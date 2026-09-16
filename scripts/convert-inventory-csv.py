"""Convert a legacy clinic inventory sheet (.csv) into the import template (.xlsx).

The clinic keeps its monthly inventory in the old flat layout::

    NAME OF MEDICATION,DOSAGE,stock on hand,1..31,total dispensed,stock remaining

The app imports the 41-column template layout (see ``inventory - TEMPLATE.xlsx``
/ ``scripts/generate-template.py``), which splits DOSAGE into
``strength_value/strength_unit/form/pack_size`` and adds ``category``/``supplier``.
This script bridges the two so an existing month can be imported as-is:

* ``NO STOCK`` → ``0`` (the template validates stock as a number; the text is not
  importable), ``440 (April)`` → ``440``, ``14a`` → ``14``
* ``total_dispensed`` keeps the sheet's own value when present, otherwise the sum
  of the daily grid (what the template's ``=SUM(Gn:AKn)`` formula would show)
* ``stock_remaining`` is only written when stock on hand is known, so a blank
  stock column does not turn into a fabricated negative remainder
* separator/footer rows (blank name, e.g. "total medicine dispensed") are dropped

Usage::

    python scripts/convert-inventory-csv.py "AUGUST 2026 inventory - august r.csv" \
        -o "AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx"
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from inventory_vocabulary import form_list_formula, unit_list_formula

SHEET_TITLE = "Inventory Template"

# The template contract, byte-for-byte what csv-parser.ts validates against.
TEMPLATE_HEADERS = [
    "name",
    "strength_value",
    "strength_unit",
    "form",
    "pack_size",
    "stock_on_hand",
    *[str(day) for day in range(1, 32)],
    "total_dispensed",
    "stock_remaining",
    "category",
    "supplier",
]

LEGACY_NAME = "NAME OF MEDICATION"
LEGACY_DOSAGE = "DOSAGE"
LEGACY_STOCK = "stock on hand"
LEGACY_TOTAL = "total dispensed"
LEGACY_REMAINING = "stock remaining"

NO_STOCK = "NO STOCK"

# Unit tokens the template's strength_unit column accepts (list validation).
UNIT_PATTERN = re.compile(r"^(mg|mcg|g|ml|%|iu|units)(/[a-z0-9]+)*$", re.IGNORECASE)
LETTERS_ONLY_UNIT = re.compile(r"^[a-z%]+(/[a-z%]+)*$", re.IGNORECASE)

# Form words the template's form column recognises (list validation aliases).
FORMS = {
    "tablet",
    "tablets",
    "tab",
    "tabs",
    "capsule",
    "capsules",
    "cap",
    "caps",
    "caplet",
    "caplets",
    "sachet",
    "sachets",
    "syrup",
    "suspension",
    "susp",
    "ointment",
    "cream",
    "drops",
    "vial",
    "vials",
    "ampule",
    "ampoule",
    "nebule",
    "injection",
    "suppository",
    "box",
    "piece",
    "pieces",
    "eye drops",
}

NUMBER = re.compile(r"^(\d+(?:\.\d+)?)([a-z%]*)$", re.IGNORECASE)
NUMBER_WITH_UNIT = re.compile(r"^(\d+(?:\.\d+)?)([a-z%].*)$", re.IGNORECASE)
INTEGER = re.compile(r"-?\d+")

# Mass-over-volume strengths ("250mg/5ml") are one concentration, not two
# numbers: the template's unit list has "mg/5ml" for exactly this.
CONCENTRATION_UNITS = {"mg", "mcg", "g", "iu", "units", "%"}


@dataclass
class ConvertedRow:
    """One medication, already mapped onto the template columns."""

    name: str
    dosage: str
    stock_on_hand: int | None
    daily: list[int]
    total_dispensed: int
    stock_remaining: int | None
    form: str = ""
    pack_size: str = ""
    strength_unit: str = ""
    strength_value: str = ""


@dataclass
class Report:
    medications: int = 0
    skipped_rows: int = 0
    normalised_dosage: list[tuple[str, str, str]] = field(default_factory=list)
    blank_strength: list[str] = field(default_factory=list)
    mismatch: list[tuple[str, int, int]] = field(default_factory=list)
    no_stock: int = 0
    coerced_stock: list[tuple[str, str, int]] = field(default_factory=list)
    coerced_daily: list[tuple[str, int, str, int]] = field(default_factory=list)


def parse_int(raw: str | None, *, default: int = 0) -> int:
    """First integer in a free-text cell; blank → ``default``."""
    text = (raw or "").strip()
    if not text:
        return default
    try:
        return int(text)
    except ValueError:
        match = INTEGER.search(text)
        return int(match.group()) if match else default


def split_strength_token(token: str) -> tuple[str, str] | None:
    """Split ``200mg/200mg/5ml`` into ``("200/200/5", "mg/mg/ml")``.

    Returns ``None`` when the token is not a clean value/unit pair (``50mg/60``),
    in which case the caller keeps the whole dosage text verbatim.
    """
    parts = token.split("/")
    values: list[str] = []
    units: list[str] = []
    for part in parts:
        match = NUMBER.match(part)
        if not match or not match.group(1):
            return None
        values.append(match.group(1))
        units.append(match.group(2))

    if all(unit == "" for unit in units):
        # Pure strength, no unit attached: "600", "200/200/5".
        return "/".join(values), ""

    if (
        len(parts) == 2
        and units[1].lower() == "ml"
        and units[0].lower() in CONCENTRATION_UNITS
    ):
        # "250mg/5ml" -> strength 250, unit "mg/5ml"
        return values[0], f"{units[0]}/{values[1]}{units[1]}"

    if any(unit == "" for unit in units):
        # e.g. "1mg/ml" — a single value with a compound unit. "50mg/60" has a
        # stray number and is left verbatim for the caller instead.
        match = NUMBER_WITH_UNIT.match(token)
        if match and LETTERS_ONLY_UNIT.match(match.group(2)):
            return match.group(1), match.group(2)
        return None

    return "/".join(values), "/".join(units)


def is_unit(token: str) -> bool:
    return bool(UNIT_PATTERN.match(token.strip()))


def is_form(token: str) -> bool:
    key = token.strip().lower()
    candidates = {key, key.rstrip("s"), key.split("/")[0], key.replace("/bx", "")}
    return bool(candidates & FORMS)


def split_dosage(dosage: str) -> tuple[str, str, str, str]:
    """Split the legacy DOSAGE text into strength_value/unit/form/pack_size.

    Slots are filled in template order, so the importer's reassembly
    (``strength_value strength_unit form pack_size``) keeps the original text.
    """
    tokens = (dosage or "").split()
    if not tokens:
        return "", "", "", ""

    strength_value = ""
    strength_unit = ""
    split = split_strength_token(tokens[0])
    if split:
        strength_value, strength_unit = split
        remaining = tokens[1:]
    else:
        remaining = tokens

    if not strength_unit and remaining and is_unit(remaining[0]):
        strength_unit = remaining[0]
        remaining = remaining[1:]

    form = ""
    if remaining:
        if is_form(remaining[0]):
            form = remaining[0]
            remaining = remaining[1:]
        elif len(remaining) > 1 and is_form(" ".join(remaining[:2])):
            form = " ".join(remaining[:2])
            remaining = remaining[2:]

    return strength_value, strength_unit, form, " ".join(remaining)


def compose_display_name(name: str, sv: str, su: str, form: str, pack: str) -> str:
    """Mirror of composeDisplayName() in the app's ``domain/strength.ts``.

    The app stores this full label in ``display_name`` and matches dispense
    requests against it, so the converter has to agree with it exactly —
    otherwise a converted workbook and the row it produces disagree about the
    medicine's name (strength spec §7.1).
    """
    parts = [name.strip(), f"{sv} {su}".strip(), form.strip(), pack.strip()]
    return " ".join(part for part in parts if part)


def assemble(sv: str, su: str, form: str, pack: str) -> str:
    """The four strength parts joined in template order — what fidelity is
    measured against, since that is the text the app now stores."""
    return " ".join(part for part in (sv, su, form, pack) if part)


def find_legacy_columns(header: list[str]) -> dict[str, int]:
    """Map legacy header labels to indices, tolerating case and spacing drift."""
    normalised = {cell.strip().lower(): idx for idx, cell in enumerate(header)}

    def index_of(*labels: str) -> int | None:
        for label in labels:
            if label.lower() in normalised:
                return normalised[label.lower()]
        return None

    columns: dict[str, int] = {}
    name = index_of(LEGACY_NAME, "name")
    dosage = index_of(LEGACY_DOSAGE, "dosage")
    stock = index_of(LEGACY_STOCK, "stock on hand")
    total = index_of(LEGACY_TOTAL, "total dispensed")
    remaining = index_of(LEGACY_REMAINING, "stock remaining")
    if None in (name, dosage, stock, total, remaining):
        raise SystemExit(
            "Unrecognised header - expected NAME OF MEDICATION / DOSAGE / "
            "stock on hand / total dispensed / stock remaining, got: "
            + ", ".join(header)
        )
    columns["name"] = int(name)  # type: ignore[arg-type]
    columns["dosage"] = int(dosage)  # type: ignore[arg-type]
    columns["stock"] = int(stock)  # type: ignore[arg-type]
    columns["total"] = int(total)  # type: ignore[arg-type]
    columns["remaining"] = int(remaining)  # type: ignore[arg-type]

    days: dict[int, int] = {}
    for day in range(1, 32):
        idx = index_of(str(day))
        if idx is None:
            raise SystemExit(f"Unrecognised header - missing day column {day}")
        days[day] = idx
    columns["days"] = days  # type: ignore[assignment]
    return columns


def cell(row: list[str], idx: int) -> str:
    return row[idx].strip() if 0 <= idx < len(row) else ""


def convert(csv_text: str, report: Report) -> list[ConvertedRow]:
    rows = list(csv.reader(io.StringIO(csv_text)))
    if not rows:
        raise SystemExit("The CSV is empty")

    columns = find_legacy_columns(rows[0])
    days: dict[int, int] = columns["days"]  # type: ignore[assignment]
    converted: list[ConvertedRow] = []

    for raw in rows[1:]:
        name = cell(raw, columns["name"])
        if not name:
            # Separator rows and the "total medicine dispensed" footer.
            report.skipped_rows += 1
            continue

        dosage = cell(raw, columns["dosage"])
        raw_stock = cell(raw, columns["stock"])
        if raw_stock.upper() == NO_STOCK:
            stock_on_hand: int | None = 0
            report.no_stock += 1
        elif raw_stock == "":
            stock_on_hand = None
        else:
            stock_on_hand = parse_int(raw_stock)
            if raw_stock != str(stock_on_hand):
                report.coerced_stock.append((name, raw_stock, stock_on_hand))

        daily: list[int] = []
        for day in range(1, 32):
            raw_day = cell(raw, days[day])
            value = parse_int(raw_day)
            if raw_day and raw_day != str(value):
                report.coerced_daily.append((name, day, raw_day, value))
            daily.append(value)

        raw_total = cell(raw, columns["total"])
        grid_total = sum(daily)
        total_dispensed = parse_int(raw_total) if raw_total else grid_total
        if raw_total and total_dispensed != grid_total:
            report.mismatch.append((name, total_dispensed, grid_total))

        stock_remaining = (
            None if stock_on_hand is None else stock_on_hand - total_dispensed
        )

        sv, su, form, pack = split_dosage(dosage)
        if not sv:
            report.blank_strength.append(name)
        if assemble(sv, su, form, pack) != " ".join(dosage.split()):
            report.normalised_dosage.append((name, dosage, assemble(sv, su, form, pack)))

        converted.append(
            ConvertedRow(
                daily=daily,
                dosage=dosage,
                form=form,
                name=name,
                pack_size=pack,
                stock_on_hand=stock_on_hand,
                stock_remaining=stock_remaining,
                strength_unit=su,
                strength_value=sv,
                total_dispensed=total_dispensed,
            )
        )
        report.medications += 1

    return converted


HEADER_FILL = PatternFill(start_color="E8EEF6", end_color="E8EEF6", fill_type="solid")
HEADER_FONT = Font(name="Calibri", size=10, bold=True, color="000000")
HEADER_ALIGN = Alignment(horizontal="center", vertical="center")
HEADER_BORDER = Border(
    left=Side(style="thin", color="B0B8C8"),
    right=Side(style="thin", color="B0B8C8"),
    top=Side(style="thin", color="B0B8C8"),
    bottom=Side(style="thin", color="B0B8C8"),
)


def write_workbook(rows: list[ConvertedRow], out_path: Path) -> None:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = SHEET_TITLE

    for idx, header in enumerate(TEMPLATE_HEADERS, start=1):
        cell_ref = sheet.cell(row=1, column=idx, value=header)
        cell_ref.font = HEADER_FONT
        cell_ref.fill = HEADER_FILL
        cell_ref.alignment = HEADER_ALIGN
        cell_ref.border = HEADER_BORDER
    sheet.row_dimensions[1].height = 22

    widths = {"A": 34, "B": 14, "C": 14, "D": 16, "E": 18, "F": 16, "AL": 16, "AM": 16, "AN": 18, "AO": 20}
    for col in range(7, 38):  # G..AK (days)
        widths[get_column_letter(col)] = 6
    for letter, width in widths.items():
        sheet.column_dimensions[letter].width = width

    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:AO1"

    for offset, row in enumerate(rows):
        excel_row = offset + 2
        sheet.cell(excel_row, 1, row.name)
        sheet.cell(excel_row, 2, row.strength_value if row.strength_value else None)
        sheet.cell(excel_row, 3, row.strength_unit if row.strength_unit else None)
        sheet.cell(excel_row, 4, row.form if row.form else None)
        sheet.cell(excel_row, 5, row.pack_size if row.pack_size else None)
        sheet.cell(excel_row, 6, row.stock_on_hand)
        for day, value in enumerate(row.daily, start=7):
            # Blank keeps the sheet readable; the parser reads blank as 0.
            sheet.cell(excel_row, day, value if value else None)
        # Literal totals, not formulas: the importer reads cached values only, so
        # a bare formula would arrive blank.
        sheet.cell(excel_row, 38, row.total_dispensed)
        sheet.cell(excel_row, 39, row.stock_remaining)
        sheet.cell(excel_row, 40, None)  # category: left blank, auto-guessed
        sheet.cell(excel_row, 41, None)  # supplier

        for column in (6, *range(7, 40)):
            sheet.cell(excel_row, column).number_format = "0"

    last_row = max(len(rows) + 1, 2)
    validations = [
        # Free text, not decimal 0–10000: a compound strength ("200/200/5") is a
        # legal stored value, and the old rule made the workbook reject a row the
        # app had just exported (strength spec §9).
        DataValidation(type="textLength", operator="between", formula1="0", formula2="20", allow_blank=True, sqref="B2:B501"),
        DataValidation(type="list", formula1=unit_list_formula(), allow_blank=True, sqref="C2:C501"),
        DataValidation(type="list", formula1=form_list_formula(), allow_blank=True, sqref="D2:D501"),
        DataValidation(type="textLength", operator="between", formula1="0", formula2="40", allow_blank=True, sqref="E2:E501"),
        DataValidation(type="whole", operator="between", formula1="0", formula2="10000", allow_blank=True, sqref="F2:F501"),
        DataValidation(type="whole", operator="between", formula1="0", formula2="10000", allow_blank=True, sqref="G2:AK501"),
        DataValidation(type="list", formula1='"Antibiotic,Analgesic,Supplement,Respiratory,Gastro,Antiseptic,First Aid,Other"', allow_blank=True, sqref="AN2:AN501"),
        DataValidation(type="textLength", operator="between", formula1="0", formula2="80", allow_blank=True, sqref="AO2:AO501"),
    ]
    for validation in validations:
        sheet.add_data_validation(validation)

    red = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
    sheet.conditional_formatting.add(f"F2:F{last_row}", CellIsRule(operator="greaterThan", formula=["10000"], fill=red))
    sheet.conditional_formatting.add(f"G2:AK{last_row}", CellIsRule(operator="greaterThan", formula=["10000"], fill=red))

    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.print_title_rows = "1:1"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(out_path)


def main(argv: list[str]) -> int:
    # Medication names in this clinic's sheet carry curly quotes and dashes; keep
    # the report printable on a cp1252 console.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("csv", type=Path, help="legacy inventory .csv")
    parser.add_argument("-o", "--out", type=Path, required=True, help="template .xlsx to write")
    args = parser.parse_args(argv)

    report = Report()
    text = args.csv.read_text(encoding="utf-8-sig")
    rows = convert(text, report)
    if not rows:
        raise SystemExit("No medications found - is this the right file?")
    write_workbook(rows, args.out)

    print(f"{args.csv.name} -> {args.out.name}")
    print(f"  medications written : {report.medications}")
    print(f"  separator rows held : {report.skipped_rows}")
    print(f"  NO STOCK -> 0       : {report.no_stock}")
    print(f"  stock coerced       : {report.coerced_stock}")
    print(f"  daily cells coerced : {report.coerced_daily}")
    print(f"  total kept from sheet: {report.medications - len(report.mismatch)} rows, "
          f"{len(report.mismatch)} mismatch: {report.mismatch}")
    print(f"  dosage re-spaced    : {len(report.normalised_dosage)}")
    for name, original, rebuilt in report.normalised_dosage[:10]:
        print(f"    - {name}: {original!r} -> {rebuilt!r}")
    print(f"  blank strength_value: {len(report.blank_strength)} {report.blank_strength[:10]}")

    # Self-check: the file must be readable as the template the importer expects.
    check = openpyxl.load_workbook(args.out, data_only=False)
    sheet = check[SHEET_TITLE]
    header = [sheet.cell(1, col).value for col in range(1, 42)]
    assert header == TEMPLATE_HEADERS, "written header drifted from the template"
    assert sheet.max_column == 41, f"expected 41 columns, got {sheet.max_column}"
    assert sheet.max_row == len(rows) + 1, "row count drifted"
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
