"""The canonical strength vocabularies, for the template tooling.

**One list, not three.** The strength spec (§5) found three vocabularies in the
repo that had already drifted apart: the `.xlsx` `DataValidation` lists, this
directory's `convert-inventory-csv.py`, and `export-xlsx.ts` in the app. Drift
between them is what makes a value the app can store get rejected by the workbook
it is exported into, or a value the workbook offers get folded into the wrong
column on the way back.

The app's own list lives in `apps/desktop/src/features/inventory/domain/
vocabulary.ts` and is the one the creation form and the wizard read. These two
tuples mirror it exactly; if you change one, change both (there is a test in
`apps/desktop/src/features/inventory/domain/vocabulary.test.ts` that fails when
they diverge).

`resolve-inventory-csv.py`'s *legacy* parsing tables (plural spellings, `eye
drops`) are a separate concern and stay where they are: they read what the clinic
already typed, they do not define what the template accepts.
"""

STRENGTH_UNITS = (
    "mg",
    "g",
    "mcg",
    "ml",
    "mg/ml",
    "mg/5ml",
    "%",
    "IU",
    "units",
)

MEDICINE_FORMS = (
    "tablet",
    "capsule",
    "cap",
    "sachet",
    "syrup",
    "suspension",
    "susp",
    "ointment",
    "cream",
    "drops",
    "vial",
    "ampule",
    "nebule",
    "injection",
    "suppository",
    "box",
    "piece",
    "tabs",
    "tab",
    "inhaler",
    "solution",
    "gel",
    "lotion",
    "spray",
)


def unit_list_formula() -> str:
    """The `formula1` string an Excel list `DataValidation` needs."""
    return f'"{",".join(STRENGTH_UNITS)}"'


def form_list_formula() -> str:
    """The `formula1` string an Excel list `DataValidation` needs."""
    return f'"{",".join(MEDICINE_FORMS)}"'
