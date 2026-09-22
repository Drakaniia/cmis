"""Regenerates the shipped inventory template (stock-report-export spec E17).

The asset this writes — ``docs/public/inventory - TEMPLATE.xlsx`` — is the
representative 31-day, 43-column shape: the six prefix columns, days 1–31,
``total_dispensed`` / ``stock_remaining`` / ``category`` / ``supplier``, plus
the ``pack_qty`` / ``pack_unit`` pair appended by migration 0012 (pack-size
D26, export-spec E3).

A shipped file has exactly one shape, so it cannot literally be "dynamic":
the app's Stock Report export varies the day block with the month picker
(28–31 days, E2) while this asset demonstrates the widest month. The importer
accepts 28–31 day columns in either the 41-column legacy or the 43-column
shape (E5), so every file the app writes reads back.
"""

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

from inventory_vocabulary import form_list_formula, unit_list_formula

OUTPUT = r"C:\Users\Qwenzy\Desktop\CMIS\docs\public\inventory - TEMPLATE.xlsx"

# Representative month: 31 days. The app export swaps this block for 28–31
# day columns following the report's month picker (E2); the importer derives
# the day count from the header row (E5).
DAYS_IN_MONTH = 31

HEADERS = (
    ["name", "strength_value", "strength_unit", "form", "pack_size", "stock_on_hand"]
    + [str(day) for day in range(1, DAYS_IN_MONTH + 1)]
    + [
        "total_dispensed",
        "stock_remaining",
        "category",
        "supplier",
        "pack_qty",
        "pack_unit",
    ]
)

TOTAL_COL = 6 + DAYS_IN_MONTH + 1  # 1-indexed: total_dispensed
LAST_COL = TOTAL_COL + 5  # …through pack_unit
LAST_LETTER = get_column_letter(LAST_COL)
DAY_FIRST_LETTER = "G"
DAY_LAST_LETTER = get_column_letter(6 + DAYS_IN_MONTH)
TOTAL_LETTER = get_column_letter(TOTAL_COL)
REMAIN_LETTER = get_column_letter(TOTAL_COL + 1)
CATEGORY_LETTER = get_column_letter(TOTAL_COL + 2)
SUPPLIER_LETTER = get_column_letter(TOTAL_COL + 3)
PACK_QTY_LETTER = get_column_letter(TOTAL_COL + 4)
PACK_UNIT_LETTER = get_column_letter(TOTAL_COL + 5)

# Column widths per spec 4.3
WIDTHS = {
    "A": 28,
    "B": 14,
    "C": 14,
    "D": 16,
    "E": 14,
    "F": 16,
    TOTAL_LETTER: 16,
    REMAIN_LETTER: 16,
    CATEGORY_LETTER: 18,
    SUPPLIER_LETTER: 20,
    PACK_QTY_LETTER: 12,
    PACK_UNIT_LETTER: 12,
}
# Day columns each 6 wide
for col in range(7, 7 + DAYS_IN_MONTH):
    WIDTHS[get_column_letter(col)] = 6

FILL = PatternFill(start_color="E8EEF6", end_color="E8EEF6", fill_type="solid")
FONT = Font(name="Calibri", size=10, bold=True, color="000000")
ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=False)
HEADER_HEIGHT = 22

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Inventory Template"

# Write header row
for idx, h in enumerate(HEADERS, start=1):
    c = ws.cell(row=1, column=idx, value=h)
    c.font = FONT
    c.fill = FILL
    c.alignment = ALIGN
    c.border = Border(
        left=Side(style="thin", color="B0B8C8"),
        right=Side(style="thin", color="B0B8C8"),
        top=Side(style="thin", color="B0B8C8"),
        bottom=Side(style="thin", color="B0B8C8"),
    )

ws.row_dimensions[1].height = HEADER_HEIGHT

# Column widths
for col_letter, w in WIDTHS.items():
    ws.column_dimensions[col_letter].width = w

# Freeze and auto-filter + print settings
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:{LAST_LETTER}1"
ws.sheet_properties.pageSetUpPr.fitToPage = True
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.print_title_rows = "1:1"
ws.sheet_properties.pageSetUpPr = openpyxl.worksheet.properties.PageSetupProperties(fitToPage=True)
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.sheet_properties.outlinePr = None
ws.print_options.gridLines = True

# Input messages map per spec 4.3
INPUT_MSGS = {
    "A": "Medication name, e.g. Paracetamol",
    "B": "Parts of the old DOSAGE — e.g. 500 + mg + tablet + 100/box",
    "C": "Parts of the old DOSAGE — e.g. 500 + mg + tablet + 100/box",
    "D": "Parts of the old DOSAGE — e.g. 500 + mg + tablet + 100/box",
    "E": "Parts of the old DOSAGE — e.g. 500 + mg + tablet + 100/box",
    "F": "Whole number count on hand. Use 0 for no stock. No text.",
    "days": "Units dispensed that day. 0–10000, blank = 0.",
    "total": "Auto-calculated — do not overwrite unless correcting.",
    "remain": "Auto-calculated — do not overwrite unless correcting.",
    "category": "Optional. Blank category will be auto-guessed.",
    "supplier": "Optional supplier name.",
    "pack_qty": "Units per pack, e.g. 100. Blank when unpacked.",
    "pack_unit": "Pack unit, e.g. box. Blank when unpacked.",
}

# For 100 pre-created blank data rows rows 2-101 with formulas
for r in range(2, 102):
    # total_dispensed = SUM(firstDay: lastDay)
    ws.cell(row=r, column=TOTAL_COL, value=f"=SUM({DAY_FIRST_LETTER}{r}:{DAY_LAST_LETTER}{r})")
    ws.cell(row=r, column=TOTAL_COL).number_format = "0"
    # stock_remaining = IF(Fn="",0,Fn)-TOTALn
    ws.cell(row=r, column=TOTAL_COL + 1, value=f'=IF(F{r}="",0,F{r})-{TOTAL_LETTER}{r}')
    ws.cell(row=r, column=TOTAL_COL + 1).number_format = "0"
    # ensure number formats for numeric cols are plain integers
    ws.cell(row=r, column=6).number_format = "0"  # F
    for c in range(7, 7 + DAYS_IN_MONTH):
        ws.cell(row=r, column=c).number_format = "0"

LAST_ROW = 501

# Data validations — strict blocking Stop style to row 501

# B2:B501 free text, bounded — deliberately *not* decimal 0–10000.
# A compound strength ("200/200/5") is a legal, stored value and the old decimal
# rule rejected it, which made the app unable to write back a row it had read
# (strength spec §9). Length is still capped so the column cannot run away.
dv_b = DataValidation(type="textLength", operator="between", formula1="0", formula2="20", allow_blank=True)
dv_b.error = "Strength must be 20 characters or fewer"
dv_b.errorTitle = "Invalid strength"
dv_b.prompt = INPUT_MSGS["B"]
dv_b.promptTitle = "Strength"
dv_b.showErrorMessage = True
dv_b.showInputMessage = True
dv_b.sqref = f"B2:B{LAST_ROW}"
ws.add_data_validation(dv_b)

# C list
dv_c = DataValidation(type="list", formula1=unit_list_formula(), allow_blank=True)
dv_c.error = "Pick a unit or leave blank"
dv_c.errorTitle = "Invalid unit"
dv_c.prompt = INPUT_MSGS["C"]
dv_c.promptTitle = "Strength unit"
dv_c.showErrorMessage = True
dv_c.showInputMessage = True
dv_c.sqref = f"C2:C{LAST_ROW}"
ws.add_data_validation(dv_c)

# D list
dv_d = DataValidation(type="list", formula1=form_list_formula(), allow_blank=True)
dv_d.error = "Pick a form or leave blank"
dv_d.errorTitle = "Invalid form"
dv_d.prompt = INPUT_MSGS["D"]
dv_d.promptTitle = "Form"
dv_d.showErrorMessage = True
dv_d.showInputMessage = True
dv_d.sqref = f"D2:D{LAST_ROW}"
ws.add_data_validation(dv_d)

# E text length 0–40
dv_e = DataValidation(type="textLength", operator="between", formula1="0", formula2="40", allow_blank=True)
dv_e.sqref = f"E2:E{LAST_ROW}"
ws.add_data_validation(dv_e)

# F whole number 0–10000
dv_f = DataValidation(type="whole", operator="between", formula1="0", formula2="10000", allow_blank=True)
dv_f.error = "Stock must be 0–10000 (use 0 for no stock)"
dv_f.errorTitle = "Invalid stock"
dv_f.prompt = INPUT_MSGS["F"]
dv_f.promptTitle = "Stock on hand"
dv_f.showErrorMessage = True
dv_f.showInputMessage = True
dv_f.sqref = f"F2:F{LAST_ROW}"
ws.add_data_validation(dv_f)

# Day columns whole 0–10000
dv_g = DataValidation(type="whole", operator="between", formula1="0", formula2="10000", allow_blank=True)
dv_g.error = "Daily qty must be 0–10000"
dv_g.errorTitle = "Invalid daily qty"
dv_g.prompt = INPUT_MSGS["days"]
dv_g.promptTitle = "Daily dispensed"
dv_g.showErrorMessage = True
dv_g.showInputMessage = True
dv_g.sqref = f"{DAY_FIRST_LETTER}2:{DAY_LAST_LETTER}{LAST_ROW}"
ws.add_data_validation(dv_g)

# A text length >=1 for non-blank rows? Use textLength between 1 and 120 with allow_blank True
dv_a = DataValidation(type="textLength", operator="between", formula1="1", formula2="120", allow_blank=True)
dv_a.error = "Name required if any other cell in row has data"
dv_a.errorTitle = "Name required"
dv_a.prompt = INPUT_MSGS["A"]
dv_a.promptTitle = "Medication name"
dv_a.showErrorMessage = True
dv_a.showInputMessage = True
dv_a.sqref = f"A2:A{LAST_ROW}"
ws.add_data_validation(dv_a)

# Category list
dv_cat = DataValidation(type="list", formula1='"Antibiotic,Analgesic,Supplement,Respiratory,Gastro,Antiseptic,First Aid,Other"', allow_blank=True)
dv_cat.error = "Pick a category or leave blank"
dv_cat.errorTitle = "Invalid category"
dv_cat.prompt = INPUT_MSGS["category"]
dv_cat.promptTitle = "Category"
dv_cat.showErrorMessage = True
dv_cat.showInputMessage = True
dv_cat.sqref = f"{CATEGORY_LETTER}2:{CATEGORY_LETTER}{LAST_ROW}"
ws.add_data_validation(dv_cat)

# Supplier text length 0–80
dv_sup = DataValidation(type="textLength", operator="between", formula1="0", formula2="80", allow_blank=True)
dv_sup.sqref = f"{SUPPLIER_LETTER}2:{SUPPLIER_LETTER}{LAST_ROW}"
ws.add_data_validation(dv_sup)

# pack_qty whole 0–10000, blank when unpacked
dv_pq = DataValidation(type="whole", operator="between", formula1="0", formula2="10000", allow_blank=True)
dv_pq.error = "Pack qty must be 0–10000"
dv_pq.errorTitle = "Invalid pack qty"
dv_pq.prompt = INPUT_MSGS["pack_qty"]
dv_pq.promptTitle = "Pack qty"
dv_pq.showErrorMessage = True
dv_pq.showInputMessage = True
dv_pq.sqref = f"{PACK_QTY_LETTER}2:{PACK_QTY_LETTER}{LAST_ROW}"
ws.add_data_validation(dv_pq)

# pack_unit text length 0–20
dv_pu = DataValidation(type="textLength", operator="between", formula1="0", formula2="20", allow_blank=True)
dv_pu.prompt = INPUT_MSGS["pack_unit"]
dv_pu.promptTitle = "Pack unit"
dv_pu.showErrorMessage = True
dv_pu.showInputMessage = True
dv_pu.sqref = f"{PACK_UNIT_LETTER}2:{PACK_UNIT_LETTER}{LAST_ROW}"
ws.add_data_validation(dv_pu)

# Optional conditional formatting light red for failures via COUNTIF mismatch — simple: highlight non-whole in F and days? We'll add generic rule for out-of-range
red_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
# For numeric out-of-range in F: highlight if F2<0 or >10000
# Use formula based conditional formatting per row range
# Simpler: one rule per numeric range covering whole validation failure via ISERROR? We'll add ISNUMBER check not needed.
# Add two rules for F and days
ws.conditional_formatting.add(f"F2:F{LAST_ROW}", CellIsRule(operator="greaterThan", formula=["10000"], fill=red_fill))
ws.conditional_formatting.add(f"F2:F{LAST_ROW}", CellIsRule(operator="lessThan", formula=["0"], fill=red_fill))
ws.conditional_formatting.add(f"{DAY_FIRST_LETTER}2:{DAY_LAST_LETTER}{LAST_ROW}", CellIsRule(operator="greaterThan", formula=["10000"], fill=red_fill))
ws.conditional_formatting.add(f"{DAY_FIRST_LETTER}2:{DAY_LAST_LETTER}{LAST_ROW}", CellIsRule(operator="lessThan", formula=["0"], fill=red_fill))

# Set print and locale
ws.sheet_properties.pageSetUpPr.fitToPage = True
ws.page_setup.paperSize = ws.PAPERSIZE_A4

wb.save(OUTPUT)
print(f"Saved {OUTPUT}")
# verify
import openpyxl as op
wb2 = op.load_workbook(OUTPUT, data_only=False)
ws2 = wb2["Inventory Template"]
print(f"Sheets: {wb2.sheetnames}, max_row={ws2.max_row}, max_col={ws2.max_column}")
# check formulas
print(f"A1={ws2['A1'].value}, F1={ws2['F1'].value}, {TOTAL_LETTER}1={ws2[TOTAL_LETTER + '1'].value}, {LAST_LETTER}1={ws2[LAST_LETTER + '1'].value}")
print(f"{TOTAL_LETTER}2 formula={ws2[TOTAL_LETTER + '2'].value}, {REMAIN_LETTER}2={ws2[REMAIN_LETTER + '2'].value}")
print(f"Validations: {len(ws2.data_validations.dataValidation)}")
for dv in ws2.data_validations.dataValidation:
    print(dv.sqref, dv.type, dv.formula1)
