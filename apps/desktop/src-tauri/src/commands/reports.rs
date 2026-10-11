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

// ── Stock Level Report PDF (stock-level-report spec F8/F10) ──────────────────
// The app's first Rust-drawn document (SL13): A4 landscape, Base-14 Helvetica
// (no font files ship), pure renderer — the frontend sends the already-computed
// report and Rust never touches SQLite. The destination path also arrives from
// the frontend, because the preview step has already asked the operator where
// the file should go.

use printpdf::{BuiltinFont, Mm, PdfDocument};
use serde::Deserialize;

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

// ── Metrics ─────────────────────────────────────────────────────────────────
// printpdf exposes no measurements for Base-14 fonts, so a character-width
// guess is what made an earlier revision's numbers drift out of their columns.
// These are the standard Helvetica AFM advance widths (units per 1000 em),
// which make truncation exact and right-aligned columns actually line up.

const PT_TO_MM: f32 = 25.4 / 72.0;

/// Helvetica's cap height as a fraction of the em — used to centre text in a row.
const CAP_HEIGHT_RATIO: f32 = 0.717;

fn helvetica_units(code: u8, bold: bool) -> u16 {
    if bold {
        return helvetica_bold_units(code);
    }
    match code {
        b' ' | b'!' => 278,
        b'"' => 355,
        b'#' | b'$' => 556,
        b'%' => 889,
        b'&' => 667,
        b'\'' => 191,
        b'(' | b')' => 333,
        b'*' => 389,
        b'+' => 584,
        b',' | b'.' => 278,
        b'-' => 333,
        b'/' => 278,
        b'0'..=b'9' => 556,
        b':' | b';' => 278,
        b'<' | b'=' | b'>' => 584,
        b'?' => 556,
        b'@' => 1015,
        b'A' | b'B' | b'E' | b'K' | b'P' | b'S' | b'V' | b'X' | b'Y' => 667,
        b'C' | b'D' | b'H' | b'N' | b'R' | b'U' => 722,
        b'F' | b'T' | b'Z' => 611,
        b'G' | b'O' | b'Q' => 778,
        b'I' => 278,
        b'J' => 500,
        b'L' => 556,
        b'M' => 833,
        b'W' => 944,
        b'[' | b'\\' | b']' => 278,
        b'^' => 469,
        b'_' => 556,
        b'`' => 333,
        b'a' | b'b' | b'd' | b'e' | b'g' | b'h' | b'n' | b'o' | b'p' | b'q' | b'u' => 556,
        b'c' | b'k' | b's' | b'v' | b'x' | b'y' | b'z' => 500,
        b'f' | b't' => 278,
        b'i' | b'j' | b'l' => 222,
        b'm' => 833,
        b'r' => 333,
        b'w' => 722,
        b'{' | b'}' => 334,
        b'|' => 260,
        b'~' => 584,
        // Latin-1 accents and anything else: a safe mid-width average.
        _ => 500,
    }
}

fn helvetica_bold_units(code: u8) -> u16 {
    match code {
        b' ' => 278,
        b'!' => 333,
        b'"' => 474,
        b'#' | b'$' => 556,
        b'%' => 889,
        b'&' => 722,
        b'\'' => 238,
        b'(' | b')' => 333,
        b'*' => 389,
        b'+' => 584,
        b',' | b'.' => 278,
        b'-' => 333,
        b'/' => 278,
        b'0'..=b'9' => 556,
        b':' | b';' => 333,
        b'<' | b'=' | b'>' => 584,
        b'?' => 611,
        b'@' => 975,
        b'A'..=b'D' => 722,
        b'E' => 667,
        b'F' => 611,
        b'G' => 778,
        b'H' => 722,
        b'I' => 278,
        b'J' => 556,
        b'K' => 722,
        b'L' => 611,
        b'M' => 833,
        b'N' => 722,
        b'O' => 778,
        b'P' => 667,
        b'Q' => 778,
        b'R' => 722,
        b'S' => 667,
        b'T' => 611,
        b'U' => 722,
        b'V' => 667,
        b'W' => 944,
        b'X' | b'Y' => 667,
        b'Z' => 611,
        b'[' | b']' => 333,
        b'\\' => 278,
        b'^' => 584,
        b'_' => 556,
        b'`' => 333,
        b'a' => 556,
        b'b' | b'd' | b'g' | b'h' | b'n' | b'o' | b'p' | b'q' | b'u' => 611,
        b'c' | b'e' | b's' => 556,
        b'f' | b't' => 333,
        b'i' | b'j' | b'l' => 278,
        b'k' | b'v' | b'x' | b'y' => 556,
        b'm' => 889,
        b'r' => 389,
        b'w' => 778,
        b'z' => 500,
        b'{' | b'}' => 389,
        b'|' => 280,
        b'~' => 584,
        _ => 556,
    }
}

/// The rendered width of `text`, in millimetres, at `size` points.
fn text_width_mm(text: &str, size: f32, bold: bool) -> f32 {
    let units: u32 = text
        .bytes()
        .map(|byte| u32::from(helvetica_units(byte, bold)))
        .sum();
    (units as f32 / 1000.0) * size * PT_TO_MM
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

/// Comfortable page size for a landscape table (spec D23), and the single margin
/// every element is positioned against.
const PAGE_WIDTH_MM: f32 = 297.0;
const PAGE_HEIGHT_MM: f32 = 210.0;
const MARGIN_MM: f32 = 12.0;

/// Space kept below the last drawn row on the single continuous page, clear of
/// the footer (drawn at `margin - 4`) and the page edge.
const SINGLE_PAGE_BOTTOM_MM: f32 = 16.0;

/// Column widths (mm) for the 8-column stock table. They sum to the printable
/// width of A4 landscape: 297 - 24 = 273. Shared with the frontend document's
/// percentage widths so the preview and this file read the same.
const TABLE_COL_WIDTHS: [f32; 8] = [62.0, 52.0, 22.0, 38.0, 22.0, 28.0, 28.0, 21.0];

/// Global cell padding — text is inset by this on both sides, so no glyph ever
/// touches a rule.
const CELL_PADDING: f32 = 1.5;

const TABLE_HEADERS: [&str; 8] = [
    "Medicine",
    "Form & strength",
    "On hand",
    "Pack hint",
    "Threshold",
    "Status",
    "Nearest expiry",
    "Batches",
];

#[derive(Clone, Copy)]
enum ColumnAlign {
    Left,
    Right,
    Center,
}

/// Numbers right-align exactly as they do on screen; text columns stay left;
/// Status centres in its cell.
const TABLE_COL_ALIGN: [ColumnAlign; 8] = [
    ColumnAlign::Left,
    ColumnAlign::Left,
    ColumnAlign::Right,
    ColumnAlign::Left,
    ColumnAlign::Right,
    ColumnAlign::Center,
    ColumnAlign::Left,
    ColumnAlign::Right,
];

fn row_height(size: f32) -> f32 {
    size * PT_TO_MM * 1.4 + 2.0 * CELL_PADDING
}

/// Truncate a cell to what fits its column, measured rather than estimated, and
/// trimmed with an ASCII ellipsis so the WinAnsi sanitiser keeps it.
fn fit_cell(text: &str, col_width: f32, size: f32, bold: bool) -> String {
    let text = pdf_text(text);
    let usable = (col_width - CELL_PADDING * 2.0).max(2.0);
    if text_width_mm(&text, size, bold) <= usable {
        return text;
    }
    let mut chars: Vec<char> = text.chars().collect();
    while chars.pop().is_some() {
        let candidate = format!("{}...", chars.iter().collect::<String>());
        if text_width_mm(&candidate, size, bold) <= usable {
            return candidate;
        }
    }
    String::new()
}

struct PdfCursor {
    doc: printpdf::PdfDocumentReference,
    page: printpdf::PdfPageIndex,
    layer: printpdf::PdfLayerIndex,
    page_width: f32,
    margin: f32,
    y: f32,
    font_regular: printpdf::IndirectFontRef,
    font_bold: printpdf::IndirectFontRef,
    /// First pass: move `y` without drawing, so the one page the document will
    /// use can be created at exactly the height its content needs.
    measuring: bool,
}

impl PdfCursor {
    /// The real cursor. The report is **one continuous vertical page** — a long
    /// receipt, not a paginated document — so its height is whatever the
    /// measuring pass found.
    fn new(title: &str, page_height: f32) -> Self {
        let (doc, page, layer) =
            PdfDocument::new(title, Mm(PAGE_WIDTH_MM), Mm(page_height), "Layer 1");
        Self::with_page(doc, page, layer, page_height, false)
    }

    /// The throwaway first pass: same calls, no ink, only the `y` arithmetic,
    /// which is what tells `generate_stock_report_pdf` how tall the sheet is.
    fn new_measuring(title: &str) -> Self {
        let (doc, page, layer) =
            PdfDocument::new(title, Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Layer 1");
        Self::with_page(doc, page, layer, PAGE_HEIGHT_MM, true)
    }

    fn with_page(
        doc: printpdf::PdfDocumentReference,
        page: printpdf::PdfPageIndex,
        layer: printpdf::PdfLayerIndex,
        page_height: f32,
        measuring: bool,
    ) -> Self {
        let font_regular = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .expect("builtin Helvetica");
        let font_bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .expect("builtin Helvetica-Bold");
        Self {
            doc,
            page,
            layer,
            page_width: PAGE_WIDTH_MM,
            margin: MARGIN_MM,
            y: page_height - MARGIN_MM,
            font_regular,
            font_bold,
            measuring,
        }
    }

    fn layer(&self) -> printpdf::PdfLayerReference {
        self.doc.get_page(self.page).get_layer(self.layer)
    }

    fn font(&self, bold: bool) -> printpdf::IndirectFontRef {
        if bold {
            self.font_bold.clone()
        } else {
            self.font_regular.clone()
        }
    }

    /// A free-text line (titles, context, subtotals) — measured truncation so it
    /// can never run past the printable area.
    fn line(&mut self, text: &str, size: f32, bold: bool, indent: f32) {
        let line_h = size * PT_TO_MM * 1.6 + 1.0;
        if self.measuring {
            self.y -= line_h;
            return;
        }
        let usable = self.page_width - self.margin * 2.0 - indent;
        let fitted = fit_cell(text, usable + CELL_PADDING * 2.0, size, bold);
        self.layer().use_text(
            fitted,
            size,
            Mm(self.margin + indent),
            Mm(self.y),
            &self.font(bold),
        );
        self.y -= line_h;
    }

    fn rule(&mut self) {
        if self.measuring {
            self.y -= 3.0;
            return;
        }
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

    /// A real table row: each cell is measured, aligned to its column, and
    /// vertically centred inside a closed grid band. One continuous page means
    /// there is never a mid-table break to repeat headers across.
    fn table_row(&mut self, cells: [&str; 8], size: f32, bold: bool, is_header: bool) {
        if self.measuring {
            self.y -= row_height(size);
            return;
        }
        self.draw_row(cells, size, bold, is_header);
    }

    fn draw_row(&mut self, cells: [&str; 8], size: f32, bold: bool, is_header: bool) {
        let height = row_height(size);
        let thickness = if is_header { 0.5 } else { 0.25 };
        let top = self.y;
        let bottom = top - height;

        if is_header {
            self.hline_at(top, thickness);
        }

        let font = self.font(bold);
        let cap = size * PT_TO_MM * CAP_HEIGHT_RATIO;
        // Centre the cap-height band on the row's midline.
        let baseline = top - height / 2.0 - cap / 2.0;

        for (index, cell) in cells.iter().enumerate() {
            let width = TABLE_COL_WIDTHS[index];
            let fitted = fit_cell(cell, width, size, bold);
            let text_w = text_width_mm(&fitted, size, bold);
            let x = match TABLE_COL_ALIGN[index] {
                ColumnAlign::Left => self.col_x(index) + CELL_PADDING,
                ColumnAlign::Right => self.col_x(index) + width - CELL_PADDING - text_w,
                ColumnAlign::Center => self.col_x(index) + (width - text_w) / 2.0,
            };
            self.layer()
                .use_text(fitted, size, Mm(x), Mm(baseline), &font);
        }

        self.hline_at(bottom, thickness);
        for column in 0..=TABLE_COL_WIDTHS.len() {
            self.vline_at(self.col_x(column), top, bottom, thickness);
        }
        self.y = bottom;
    }

    fn finish(self, footer_right: &str) -> Vec<u8> {
        let layer = self.doc.get_page(self.page).get_layer(self.layer);
        // One continuous page, so there is no page count to print.
        layer.use_text(
            pdf_text(footer_right),
            7.0,
            Mm(self.margin),
            Mm(self.margin - 4.0),
            &self.font_regular,
        );
        self.doc
            .save_to_bytes()
            .expect("printpdf save_to_bytes is infallible for builtin fonts")
    }
}

const HEADER_SIZE: f32 = 7.0;
const BODY_SIZE: f32 = 7.5;
const TITLE_SIZE: f32 = 16.0;

/// Draws the whole report onto `pdf`. Called twice — once by the measuring
/// pass and once for real — so the drawing sequence is stated exactly once.
fn draw_report(pdf: &mut PdfCursor, payload: &StockReportPdfPayload) {
    // Header block (F8).
    pdf.line("Stock Level Report", TITLE_SIZE, true, 0.0);
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
        pdf.table_row(TABLE_HEADERS, HEADER_SIZE, true, true);
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
                BODY_SIZE,
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
}

/// The height a single continuous page needs for `payload`, in millimetres.
///
/// The measuring cursor consumes the same vertical arithmetic the drawing
/// cursor does, so the real page can be created at exactly this height rather
/// than spilling onto A4-sized pages.
fn single_page_height(payload: &StockReportPdfPayload) -> f32 {
    let mut probe = PdfCursor::new_measuring("Stock Level Report");
    let start = probe.y;
    draw_report(&mut probe, payload);
    let consumed = start - probe.y;
    consumed + MARGIN_MM + SINGLE_PAGE_BOTTOM_MM
}

#[tauri::command]
pub fn generate_stock_report_pdf(
    payload: StockReportPdfPayload,
    path: String,
) -> Result<String, String> {
    // One continuous vertical page: measured first, then drawn at that height,
    // so the document is never split across pages (a long receipt, not a
    // paginated table).
    let mut pdf = PdfCursor::new("Stock Level Report", single_page_height(&payload));
    draw_report(&mut pdf, &payload);
    let bytes = pdf.finish(&format!("Generated {}", payload.generated_at));
    std::fs::write(&path, &bytes).map_err(|error| format!("Could not write {path}: {error}"))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_text_normalises_non_winansi_marks() {
        assert_eq!(pdf_text("—"), "-");
        assert_eq!(pdf_text("≤30d / ‹ ›"), "<=30d / < >");
        // Anything beyond Latin-1 degrades to a placeholder rather than a box.
        assert_eq!(pdf_text("ok…"), "ok?");
    }

    #[test]
    fn text_width_uses_helvetica_advances() {
        // Four Helvetica `M`s at 10pt: 4 × 0.833 em × 10pt × 25.4/72.
        let expected = 4.0 * 0.833 * 10.0 * PT_TO_MM;
        assert!((text_width_mm("MMMM", 10.0, false) - expected).abs() < 0.01);
        assert_eq!(text_width_mm("", 10.0, false), 0.0);
        // Bold is never narrower than regular for the same text.
        assert!(text_width_mm("Threshold", 7.5, true) >= text_width_mm("Threshold", 7.5, false));
    }

    #[test]
    fn fit_cell_never_overflows_its_column() {
        let long = "Paracetamol 500 mg extra strength tablets".repeat(3);
        for (index, width) in TABLE_COL_WIDTHS.iter().enumerate() {
            let fitted = fit_cell(&long, *width, BODY_SIZE, false);
            let usable = width - CELL_PADDING * 2.0;
            let measured = text_width_mm(&fitted, BODY_SIZE, false);
            assert!(
                measured <= usable + 0.01,
                "column {index} overflowed: {measured} > {usable} ({fitted:?})"
            );
        }
    }

    #[test]
    fn fit_cell_keeps_text_that_already_fits() {
        assert_eq!(fit_cell("In stock", 28.0, BODY_SIZE, false), "In stock");
    }

    #[test]
    fn single_page_height_grows_with_the_table() {
        // The measuring pass is what lets the one page be sized to its content:
        // a short report needs less than A4, a long one grows well past it — and
        // neither ever needs a second page.
        let mut payload = StockReportPdfPayload::default();
        payload.groups = vec![PdfGroup {
            category: "Analgesic".to_string(),
            rows: Vec::new(),
        }];
        let short = single_page_height(&payload);
        payload.groups[0].rows = (0..200).map(|_| PdfRow::default()).collect();
        let tall = single_page_height(&payload);
        assert!(short < PAGE_HEIGHT_MM);
        assert!(tall > short);
        assert!(tall > PAGE_HEIGHT_MM);
    }

    #[test]
    fn right_aligned_numbers_end_before_the_column_edge() {
        for (index, align) in TABLE_COL_ALIGN.iter().enumerate() {
            if !matches!(align, ColumnAlign::Right) {
                continue;
            }
            let width = TABLE_COL_WIDTHS[index];
            let value = "1234567";
            let fitted = fit_cell(value, width, BODY_SIZE, false);
            let measured = text_width_mm(&fitted, BODY_SIZE, false);
            // The widest x draw_row can produce, plus the text, stays inside.
            assert!(measured + CELL_PADDING <= width);
        }
    }
}
