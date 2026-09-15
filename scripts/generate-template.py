import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

OUTPUT = r"C:\Users\Qwenzy\Desktop\CMIS\AUGUST 2026 inventory - TEMPLATE.xlsx"

HEADERS = [
    "name","strength_value","strength_unit","form","pack_size","stock_on_hand",
    "1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31",
    "total_dispensed","stock_remaining","category","supplier"
]

# Column widths per spec 4.3
WIDTHS = {
    "A": 28, "B": 14, "C": 14, "D": 16, "E": 14, "F": 16,
    "AL": 16, "AM": 16, "AN": 18, "AO": 20,
}
# G:AK each 6
for col in range(7, 38):  # G=7 to AK=37
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
ws.auto_filter.ref = f"A1:AO1"
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
    "G-AK": "Units dispensed that day. 0–10000, blank = 0.",
    "AL": "Auto-calculated — do not overwrite unless correcting.",
    "AM": "Auto-calculated — do not overwrite unless correcting.",
    "AN": "Optional. Blank category will be auto-guessed.",
    "AO": "Optional. Blank category will be auto-guessed.",
}

# For 100 pre-created blank data rows rows 2-101 with formulas
for r in range(2, 102):
    # total_dispensed AL = SUM(Gn:AKn)
    ws.cell(row=r, column=38, value=f"=SUM(G{r}:AK{r})")  # AL =38
    ws.cell(row=r, column=38).number_format = "0"
    # stock_remaining AM = IF(Fn="",0,Fn)-ALn
    ws.cell(row=r, column=39, value=f'=IF(F{r}="",0,F{r})-AL{r}')  # AM=39
    ws.cell(row=r, column=39).number_format = "0"
    # ensure number formats for numeric cols are plain integers
    ws.cell(row=r, column=6).number_format = "0"  # F
    for c in range(7, 38):
        ws.cell(row=r, column=c).number_format = "0"

# Data validations — strict blocking Stop style to row 501

# B2:B501 decimal 0–10000 or blank
dv_b = DataValidation(type="decimal", operator="between", formula1="0", formula2="10000", allow_blank=True)
dv_b.error = "Strength must be 0–10000 or blank"
dv_b.errorTitle = "Invalid strength"
dv_b.prompt = INPUT_MSGS["B"]
dv_b.promptTitle = "Strength"
dv_b.showErrorMessage = True
dv_b.showInputMessage = True
dv_b.sqref = "B2:B501"
ws.add_data_validation(dv_b)

# C list
dv_c = DataValidation(type="list", formula1='"mg,g,mcg,ml,mg/ml,mg/5ml,%,IU,units"', allow_blank=True)
dv_c.error = "Pick a unit or leave blank"
dv_c.errorTitle = "Invalid unit"
dv_c.prompt = INPUT_MSGS["C"]
dv_c.promptTitle = "Strength unit"
dv_c.showErrorMessage = True
dv_c.showInputMessage = True
dv_c.sqref = "C2:C501"
ws.add_data_validation(dv_c)

# D list
dv_d = DataValidation(type="list", formula1='"tablet,capsule,cap,sachet,syrup,suspension,susp,ointment,cream,drops,vial,ampule,nebule,injection,suppository,box,piece"', allow_blank=True)
dv_d.error = "Pick a form or leave blank"
dv_d.errorTitle = "Invalid form"
dv_d.prompt = INPUT_MSGS["D"]
dv_d.promptTitle = "Form"
dv_d.showErrorMessage = True
dv_d.showInputMessage = True
dv_d.sqref = "D2:D501"
ws.add_data_validation(dv_d)

# E text length 0–40
dv_e = DataValidation(type="textLength", operator="between", formula1="0", formula2="40", allow_blank=True)
dv_e.sqref = "E2:E501"
ws.add_data_validation(dv_e)

# F whole number 0–10000
dv_f = DataValidation(type="whole", operator="between", formula1="0", formula2="10000", allow_blank=True)
dv_f.error = "Stock must be 0–10000 (use 0 for no stock)"
dv_f.errorTitle = "Invalid stock"
dv_f.prompt = INPUT_MSGS["F"]
dv_f.promptTitle = "Stock on hand"
dv_f.showErrorMessage = True
dv_f.showInputMessage = True
dv_f.sqref = "F2:F501"
ws.add_data_validation(dv_f)

# G:AK whole 0–10000
dv_g = DataValidation(type="whole", operator="between", formula1="0", formula2="10000", allow_blank=True)
dv_g.error = "Daily qty must be 0–10000"
dv_g.errorTitle = "Invalid daily qty"
dv_g.prompt = INPUT_MSGS["G-AK"]
dv_g.promptTitle = "Daily dispensed"
dv_g.showErrorMessage = True
dv_g.showInputMessage = True
dv_g.sqref = "G2:AK501"
ws.add_data_validation(dv_g)

# A text length >=1 for non-blank rows? Use textLength >=0 but allow blank, plus custom? We'll do textLength between 1 and 120 with allow_blank True
dv_a = DataValidation(type="textLength", operator="between", formula1="1", formula2="120", allow_blank=True)
dv_a.error = "Name required if any other cell in row has data"
dv_a.errorTitle = "Name required"
dv_a.prompt = INPUT_MSGS["A"]
dv_a.promptTitle = "Medication name"
dv_a.showErrorMessage = True
dv_a.showInputMessage = True
dv_a.sqref = "A2:A501"
ws.add_data_validation(dv_a)

# AN list category 8 values
dv_an = DataValidation(type="list", formula1='"Antibiotic,Analgesic,Supplement,Respiratory,Gastro,Antiseptic,First Aid,Other"', allow_blank=True)
dv_an.error = "Pick a category or leave blank"
dv_an.errorTitle = "Invalid category"
dv_an.prompt = INPUT_MSGS["AN"]
dv_an.promptTitle = "Category"
dv_an.showErrorMessage = True
dv_an.showInputMessage = True
dv_an.sqref = "AN2:AN501"
ws.add_data_validation(dv_an)

# AO text length 0–80
dv_ao = DataValidation(type="textLength", operator="between", formula1="0", formula2="80", allow_blank=True)
dv_ao.sqref = "AO2:AO501"
ws.add_data_validation(dv_ao)

# Optional conditional formatting light red for failures via COUNTIF mismatch — simple: highlight non-whole in F and G:AK? We'll add generic rule for out-of-range
red_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
# For numeric out-of-range in F: highlight if F2<0 or >10000
# Use formula based conditional formatting per row range
# Simpler: one rule per numeric range covering whole validation failure via ISERROR? We'll add ISNUMBER check not needed.
# Add two rules for F and G:AK
ws.conditional_formatting.add("F2:F501", CellIsRule(operator="greaterThan", formula=["10000"], fill=red_fill))
ws.conditional_formatting.add("F2:F501", CellIsRule(operator="lessThan", formula=["0"], fill=red_fill))
ws.conditional_formatting.add("G2:AK501", CellIsRule(operator="greaterThan", formula=["10000"], fill=red_fill))
ws.conditional_formatting.add("G2:AK501", CellIsRule(operator="lessThan", formula=["0"], fill=red_fill))

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
print(f"A1={ws2['A1'].value}, F1={ws2['F1'].value}, AL1={ws2['AL1'].value}, AO1={ws2['AO1'].value}")
print(f"AL2 formula={ws2['AL2'].value}, AM2={ws2['AM2'].value}")
print(f"Validations: {len(ws2.data_validations.dataValidation)}")
for dv in ws2.data_validations.dataValidation:
    print(dv.sqref, dv.type, dv.formula1)
