//! Stock Report export writer (stock-report-export spec E-F7).
//!
//! The workbook itself is built in TypeScript
//! (`features/inventory/import/export-xlsx.ts`) because SheetJS already runs in
//! the app. This command is deliberately only the file write, so the workbook's
//! layout stays in one place and Rust never reimplements the grid.

/// Writes a pre-built workbook to the operator-chosen path and returns that path.
///
/// The path is already absolute and user-approved — it comes from the native
/// save dialog. Any I/O failure is reported with its real reason rather than
/// swallowed, because the caller shows it in an error toast (E-F1: never a
/// success placeholder).
#[tauri::command]
pub fn save_stock_report_workbook(bytes: Vec<u8>, path: String) -> Result<String, String> {
    std::fs::write(&path, &bytes).map_err(|error| format!("Could not write {path}: {error}"))?;
    Ok(path)
}

// ── Stock Level Report PDF (stock-level-report spec F10) ────────────────────
// The app's first Rust-drawn document (SL13): A4 landscape, Base-14 Helvetica
// (no font files ship), pure renderer — the frontend sends the already-computed
// report and Rust never touches SQLite.

use printpdf::{BuiltinFont, Mm, PdfDocument};
use serde::Deserialize;
use tauri::Manager;

#[derive(Deserialize, Default)]
pub struct PdfSummary {
    #[serde(default)]
    pub medicines: i64,
    #[serde(default)]
    pub units_on_hand: i64,
    #[serde(default)]
    pub categories: i64,
    #[serde(default)]
    pub low: i64,
    #[serde(default)]
    pub out: i64,
    #[serde(default)]
    pub expiring_soon: i64,
    #[serde(default)]
    pub expiring_later: i64,
    #[serde(default)]
    pub expired: i64,
}

#[derive(Deserialize, Default)]
pub struct PdfMonthActivity {
    #[serde(default)]
    pub received: String,
    #[serde(default)]
    pub dispensed: String,
}

#[derive(Deserialize, Default)]
pub struct PdfRow {
    #[serde(default)]
    pub medicine: String,
    #[serde(default)]
    pub sku: String,
    #[serde(default)]
    pub form_strength: String,
    #[serde(default)]
    pub on_hand: i64,
    #[serde(default)]
    pub pack_hint: String,
    #[serde(default)]
    pub threshold: i64,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub nearest_expiry: String,
    #[serde(default)]
    pub batches: i64,
}

#[derive(Deserialize, Default)]
pub struct PdfGroup {
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub rows: Vec<PdfRow>,
}

#[derive(Deserialize, Default)]
pub struct PdfGrandTotal {
    #[serde(default)]
    pub medicines: i64,
    #[serde(default)]
    pub units_on_hand: i64,
    #[serde(default)]
    pub low: i64,
    #[serde(default)]
    pub out: i64,
    #[serde(default)]
    pub nearest_expiry: String,
    #[serde(default)]
    pub categories: i64,
}

#[derive(Deserialize, Default)]
pub struct StockReportPdfPayload {
    #[serde(default)]
    pub as_of: String,
    /// `YYYY-MM` — doubles as the filename fragment.
    #[serde(default)]
    pub month: String,
    #[serde(default)]
    pub month_label: String,
    #[serde(default)]
    pub category_label: String,
    #[serde(default)]
    pub operator: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub generated_at: String,
    #[serde(default)]
    pub summary: PdfSummary,
    #[serde(default)]
    pub month_activity: PdfMonthActivity,
    #[serde(default)]
    pub groups: Vec<PdfGroup>,
    #[serde(default)]
    pub grand_total: PdfGrandTotal,
}

/// Builtin Helvetica only covers WinAnsi — normalise the few non-ASCII marks
/// the report can carry (em dash month figures, `≤` labels) so the PDF never
/// shows a missing glyph.
fn pdf_text(value: &str) -> String {
    value
        .replace('—', "-")
        .replace("≤", "<=")
        .replace('‹', "<")
        .replace('›', ">")
        .chars()
        .map(|ch| {
            if ch.is_ascii() || (ch as u32) < 256 {
                ch
            } else {
                '?'
            }
        })
        .collect()
}

/// Column widths (mm) for the 8-column stock table. They sum to the printable
/// width of A4 landscape with 12mm margins: 297 - 24 = 273.
const TABLE_COL_WIDTHS: [f32; 8] = [62.0, 52.0, 22.0, 38.0, 22.0, 28.0, 28.0, 21.0];

/// Truncate a cell to what fits its column at this font size — same heuristic
/// as `PdfCursor::line` (Helvetica advance ≈ 0.18 × size per char in mm),
/// reserving 2mm of cell padding.
fn fit_cell(text: &str, col_width: f32, size: f32) -> String {
    let usable = (col_width - 2.0).max(4.0);
    let max_chars = (usable / (size * 0.18)).max(4.0) as usize;
    let mut text = pdf_text(text);
    if text.len() > max_chars {
        text.truncate(max_chars.saturating_sub(1));
        text.push('…');
    }
    text
}

fn pdf_filename(month: &str) -> String {
    let safe_month: String = month
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-')
        .collect();
    let month = if safe_month.is_empty() {
        "unknown".to_string()
    } else {
        safe_month
    };
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M").to_string();
    format!("cmis-stock-report-{month}-{stamp}.pdf")
}

struct PdfCursor {
    doc: printpdf::PdfDocumentReference,
    pages: Vec<(printpdf::PdfPageIndex, printpdf::PdfLayerIndex)>,
    page_width: f32,
    page_height: f32,
    margin: f32,
    y: f32,
    font_regular: printpdf::IndirectFontRef,
    font_bold: printpdf::IndirectFontRef,
}

impl PdfCursor {
    fn new(title: &str) -> Self {
        let page_width = 297.0;
        let page_height = 210.0;
        let (doc, page, layer) =
            PdfDocument::new(title, Mm(page_width), Mm(page_height), "Layer 1");
        let font_regular = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .expect("builtin Helvetica");
        let font_bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .expect("builtin Helvetica-Bold");
        Self {
            doc,
            pages: vec![(page, layer)],
            page_width,
            page_height,
            margin: 12.0,
            y: page_height - 12.0,
            font_regular,
            font_bold,
        }
    }

    fn layer(&self) -> printpdf::PdfLayerReference {
        let (page, layer) = self.pages.last().expect("at least one page");
        self.doc.get_page(*page).get_layer(*layer)
    }

    fn ensure_space(&mut self, needed: f32) {
        if self.y - needed < self.margin + 8.0 {
            let (page, layer) =
                self.doc
                    .add_page(Mm(self.page_width), Mm(self.page_height), "Layer 1");
            self.pages.push((page, layer));
            self.y = self.page_height - self.margin;
        }
    }

    fn line(&mut self, text: &str, size: f32, bold: bool, indent: f32) {
        self.ensure_space(size * 0.55 + 2.0);
        let font = if bold {
            &self.font_bold.clone()
        } else {
            &self.font_regular.clone()
        };
        // Truncate to what fits the printable width at this size — a medicine
        // name is the only free-text field and must not overrun the columns.
        let max_chars =
            ((self.page_width - self.margin * 2.0 - indent) / (size * 0.18)).max(10.0) as usize;
        let mut text = pdf_text(text);
        if text.len() > max_chars {
            text.truncate(max_chars.saturating_sub(1));
            text.push('…');
        }
        self.layer().use_text(
            pdf_text(&text),
            size,
            Mm(self.margin + indent),
            Mm(self.y),
            font,
        );
        self.y -= size * 0.55 + 2.0;
    }

    fn rule(&mut self) {
        self.ensure_space(4.0);
        let layer = self.layer();
        layer.set_outline_thickness(0.4);
        let y = self.y + 1.0;
        let line = printpdf::Line {
            points: vec![
                (printpdf::Point::new(Mm(self.margin), Mm(y)), false),
                (
                    printpdf::Point::new(Mm(self.page_width - self.margin), Mm(y)),
                    false,
                ),
            ],
            is_closed: false,
        };
        layer.add_line(line);
        self.y -= 3.0;
    }

    fn col_x(&self, index: usize) -> f32 {
        self.margin + TABLE_COL_WIDTHS.iter().take(index).sum::<f32>()
    }

    fn hline_at(&self, y: f32, thickness: f32) {
        let layer = self.layer();
        layer.set_outline_thickness(thickness);
        let line = printpdf::Line {
            points: vec![
                (printpdf::Point::new(Mm(self.margin), Mm(y)), false),
                (
                    printpdf::Point::new(Mm(self.page_width - self.margin), Mm(y)),
                    false,
                ),
            ],
            is_closed: false,
        };
        layer.add_line(line);
    }

    fn vline_at(&self, x: f32, top: f32, bottom: f32, thickness: f32) {
        let layer = self.layer();
        layer.set_outline_thickness(thickness);
        let line = printpdf::Line {
            points: vec![
                (printpdf::Point::new(Mm(x), Mm(top)), false),
                (printpdf::Point::new(Mm(x), Mm(bottom)), false),
            ],
            is_closed: false,
        };
        layer.add_line(line);
    }

    /// A real table row: each cell is drawn at its column's x position with a
    /// full grid (outer border + column separators + row divider), so the PDF
    /// carries selectable positioned text — not a `a | b | c` markdown line.
    fn table_row(&mut self, cells: [&str; 8], size: f32, bold: bool, is_header: bool) {
        let row_h = size * 0.55 + 3.0;
        self.ensure_space(row_h + 2.0);
        let thickness = if is_header { 0.6 } else { 0.3 };
        // Top border for the first row of each table so the grid is closed.
        if is_header {
            self.hline_at(self.y + 2.0, thickness);
        }
        let top = self.y + 2.0;
        let font = if bold {
            self.font_bold.clone()
        } else {
            self.font_regular.clone()
        };
        for (index, cell) in cells.iter().enumerate() {
            let x = self.col_x(index) + 1.0;
            let fitted = fit_cell(cell, TABLE_COL_WIDTHS[index], size);
            self.layer()
                .use_text(fitted, size, Mm(x), Mm(self.y), &font);
        }
        self.y -= row_h;
        let bottom = self.y + 1.5;
        self.hline_at(bottom, thickness);
        // Column separators + outer borders for this row band.
        for k in 0..=TABLE_COL_WIDTHS.len() {
            self.vline_at(self.col_x(k), top, bottom, thickness);
        }
    }

    fn finish(self, footer_right: &str) -> Vec<u8> {
        let total = self.pages.len();
        for (index, (page, layer)) in self.pages.iter().enumerate() {
            let layer = self.doc.get_page(*page).get_layer(*layer);
            let footer = format!(
                "Page {} of {}   {}",
                index + 1,
                total,
                pdf_text(footer_right)
            );
            layer.use_text(
                footer,
                7.0,
                Mm(self.margin),
                Mm(self.margin - 4.0),
                &self.font_regular,
            );
        }
        self.doc
            .save_to_bytes()
            .expect("printpdf save_to_bytes is infallible for builtin fonts")
    }
}

/// Draws the Stock Level Report (F8/F10) and saves it to Documents.
///
/// Returns the absolute path written. The time component in the filename makes
/// collisions impossible without a dialog (D24). Nothing is written to
/// `audit_log` — reading is not an event.
#[tauri::command]
pub fn generate_stock_report_pdf(
    app: tauri::AppHandle,
    payload: StockReportPdfPayload,
) -> Result<String, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("Could not resolve the Documents folder: {error}"))?;
    let path = documents.join(pdf_filename(&payload.month));
    let path_display = path.to_string_lossy().to_string();

    let mut pdf = PdfCursor::new("Stock Level Report");

    // Header block (F8).
    pdf.line("Stock Level Report", 16.0, true, 0.0);
    pdf.line(
        &format!(
            "{}  ·  received {}  ·  dispensed {}  ·  {}",
            payload.month_label,
            payload.month_activity.received,
            payload.month_activity.dispensed,
            payload.category_label
        ),
        8.0,
        false,
        0.0,
    );
    pdf.line(
        &format!("{}  ·  generated {}", payload.as_of, payload.generated_at),
        8.0,
        false,
        0.0,
    );
    pdf.line(
        &format!(
            "Operator: {}  ·  Location: {}",
            payload.operator, payload.location
        ),
        8.0,
        false,
        0.0,
    );
    pdf.rule();

    // Summary strip.
    let s = &payload.summary;
    pdf.line("Summary", 10.0, true, 0.0);
    pdf.line(
        &format!(
            "Medicines {}   Units on hand {}   Categories {}",
            s.medicines, s.units_on_hand, s.categories
        ),
        8.0,
        false,
        2.0,
    );
    pdf.line(
        &format!(
            "Low stock {}   Out of stock {}   Expiring <=30d {}   Expiring <=90d {}   Expired {}",
            s.low, s.out, s.expiring_soon, s.expiring_later, s.expired
        ),
        8.0,
        false,
        2.0,
    );
    pdf.line(
        &format!(
            "This month ({}): received {}   dispensed {}",
            payload.month_label, payload.month_activity.received, payload.month_activity.dispensed
        ),
        8.0,
        false,
        2.0,
    );
    pdf.rule();

    // Groups — each group is a real positioned table, not a `a | b` text line.
    for group in &payload.groups {
        pdf.line(
            &format!(
                "{} — {} {}",
                group.category,
                group.rows.len(),
                if group.rows.len() == 1 {
                    "medicine"
                } else {
                    "medicines"
                }
            ),
            10.0,
            true,
            0.0,
        );
        pdf.table_row(
            [
                "Medicine",
                "Form & strength",
                "On hand",
                "Pack hint",
                "Threshold",
                "Status",
                "Nearest expiry",
                "Batches",
            ],
            7.0,
            true,
            true,
        );
        if group.rows.is_empty() {
            pdf.line("(no medicines in this group)", 8.0, false, 2.0);
        }
        for row in &group.rows {
            let medicine = if row.sku.is_empty() {
                row.medicine.clone()
            } else {
                format!("{} ({})", row.medicine, row.sku)
            };
            let on_hand = row.on_hand.to_string();
            let threshold = row.threshold.to_string();
            let batches = row.batches.to_string();
            pdf.table_row(
                [
                    medicine.as_str(),
                    row.form_strength.as_str(),
                    on_hand.as_str(),
                    row.pack_hint.as_str(),
                    threshold.as_str(),
                    row.status.as_str(),
                    row.nearest_expiry.as_str(),
                    batches.as_str(),
                ],
                7.5,
                false,
                false,
            );
        }
        let (low, out, units) = group.rows.iter().fold((0, 0, 0), |(l, o, u), row| {
            (
                l + i64::from(row.status == "low-stock"),
                o + i64::from(row.status == "out-of-stock"),
                u + row.on_hand,
            )
        });
        pdf.line(
            &format!(
                "Subtotal: {} {}, {} units, {} low, {} out",
                group.rows.len(),
                if group.rows.len() == 1 {
                    "medicine"
                } else {
                    "medicines"
                },
                units,
                low,
                out
            ),
            8.0,
            true,
            2.0,
        );
    }

    // Grand total.
    pdf.rule();
    let g = &payload.grand_total;
    pdf.line(
        &format!(
            "Grand total: {} medicines, {} units, {} low, {} out, {} categories, nearest expiry {}",
            g.medicines, g.units_on_hand, g.low, g.out, g.categories, g.nearest_expiry
        ),
        9.0,
        true,
        0.0,
    );

    let bytes = pdf.finish(&format!("Generated {}", payload.generated_at));
    std::fs::write(&path, &bytes)
        .map_err(|error| format!("Could not write {path_display}: {error}"))?;
    Ok(path_display)
}
