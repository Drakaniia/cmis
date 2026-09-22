# Spec — Stock Report Export (importable inventory workbook)

**Short name:** `stock-report-export`
**Area:** `apps/desktop` — the Stock Report page (`/admin/reports`), the shared inventory xlsx export core, the CSV/XLSX importer, and the first file-writing Rust command
**Status:** Draft, awaiting implementation
**Date:** 2026-09-22
**Phases:** Phase 1 — the shared export core + page UI + save plumbing (Rust command, dialog plugin). Phase 2 — importer support for variable day counts + the shipped asset/docs refresh.
**Supersedes, in part:** `stock-level-report-spec.md` **N1** ("No CSV export from the reports page") and **D17/D24**'s two-button output set — a third output, an `.xlsx` export, is reintroduced deliberately.

---

## 1. The request, in the requester's words

> "in stock report, add new feature that export, and should be the same output to the `docs\public\inventory - TEMPLATE.xlsx`"

Read plainly: the Stock Report currently produces a document for the screen/paper/PDF. The requester wants it to *also* produce an Excel workbook whose layout is the clinic's own inventory template — the same file the clinic fills in and the app already imports. The exported file is therefore both a human-readable inventory sheet **and** a re-importable data file.

The interview added one significant twist: the day columns are **not** a fixed 1–31 block. They follow the **number of days in the month selected in the report's month picker** — February writes 28 (29 in a leap year), April 30, September 30, and so on. That makes the export month-shaped rather than template-shaped, and it forces a matching change in the importer.

---

## 2. Current state — relevant findings

Numbered `SX1…SX15` for reference from the decisions and functional sections.

| # | Finding | Evidence |
|---|---------|----------|
| SX1 | The shipped asset `docs/public/inventory - TEMPLATE.xlsx` is a **single sheet** (`Inventory Template`, ref `A1:AO101`) with **41 columns**: `name, strength_value, strength_unit, form, pack_size, stock_on_hand, 1…31, total_dispensed, stock_remaining, category, supplier`. Rows 2–101 are a pre-created blank canvas carrying `AL{r}=SUM(G{r}:AK{r})` and `AM{r}=IF(F{r}="",0,F{r})-AL{r}` formulas, `!autofilter` `A1:AO1`, an `!freeze`-style frozen top row, header fill `E8EEF6`, and the column widths from `scripts/generate-template.py`. | direct read of the asset (see §7) |
| SX2 | The **app's own exporter writes 43 columns** — it appends `pack_qty` (`AP`) and `pack_unit` (`AQ`) after `supplier` (pack-size spec §10, migration 0012). So today the app's export and the shipped asset **already disagree by two columns**. | `features/inventory/import/export-xlsx.ts` → `buildInventoryXlsxRows`, `buildInventoryWorkbook` |
| SX3 | The importer is **fixed-width and positional**: `EXPECTED_COLUMNS = 41`, `EXPECTED_COLUMNS_MIN`, `COL_DAYS_START = 6`, `COL_DAYS_END = 37`, `COL_TOTAL_DISPENSED = 37`, `COL_STOCK_REMAINING = 38`, `COL_CATEGORY = 39`, `COL_SUPPLIER = 40`, plus `COL_PACK_QTY = 41`, `COL_PACK_UNIT = 42` for 43-column files. Header validation compares the header cells **exactly** against `INVENTORY_TEMPLATE_HEADERS` (43) or `LEGACY_TEMPLATE_HEADERS` (41). | `import/csv-parser.ts` |
| SX4 | The exporter pads rows to a **31-length daily array** and writes blank (`""`) for a `0` day. `totalDispensed` falls back to the day sum and `stockRemaining` to `stockOnHand - totalDispensed`. | `export-xlsx.ts` |
| SX5 | `utils.book_append_sheet(wb, ws, "Inventory Template")` is the single sheet today; the workbook is assembled in `buildInventoryWorkbook` and only then handed to `writeFile`. `buildInventoryWorkbook` is **exported** specifically so export → import round-trips are testable. | `export-xlsx.ts` |
| SX6 | The **Data page's export card** already drives this exporter — but only through a *web fallback*. It calls `invoke("export_data", …)`; because no Rust command exists, the invoke throws and the card falls back to `downloadInventoryXlsx` in the browser. The card also carries a 43-column SQL query and per-item dispensing-event assembly. | `features/admin/data/components/export-card.tsx` |
| SX7 | **The Rust side registers no `invoke_handler` at all**, and `tauri-plugin-dialog` is **not** installed; `tauri-plugin-opener` **is**. `commands/mod.rs` is a stub. So any native save-dialog work is greenfield. | `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `commands/mod.rs`; stock-level-report-spec SL13 |
| SX8 | The Stock Report's **month picker**, **category filter** and **Print** live in `ReportsFilterBar` (sticky bar), while the **search box and sort state live inside `StockLevelTable`**. The export button must reach search/sort, so that state has to move up to `ReportsPage`. | `reports-filter-bar.tsx`, `stock-level-table.tsx`, `reports-page.tsx` |
| SX9 | The report's summary figures come from `buildStockSummary(items)` (totals + health bands) and `buildMonthActivity(activity)` (received/dispensed, with the em-dash rule). `useMonthActivity(month, category)` is the query behind the month figures. | `stock-report-summary.ts`, `hooks/use-month-activity.ts` |
| SX10 | The report table's columns are **Medicine, Form & strength, On hand, Pack hint, Threshold, Status, Nearest expiry, Batches** — of which only `name`/`form`/strength/on-hand/pack and category overlap the template. `Threshold`, `Status`, `Batches` have **no template counterpart**. | `stock-level-table.tsx` |
| SX11 | Grouping is alphabetical by category with `Uncategorized` last; groups are dropped when empty; sort applies **within** groups only. Search matches label, SKU or category. | `stock-report-groups.ts`, `stock-level-rows.ts` |
| SX12 | The pack pair is optional on legacy data (`0` / `""`); `describeQuantity`/`hasPack`/`packItemOf` are the shared helpers, and the exporter writes the pair verbatim so export → import → export is lossless. | `domain/pack-size.ts`, `export-xlsx.ts` |
| SX13 | The identity of an item is `name + strength_value + strength_unit + form + pack_size` (plus the pack pair carried as data). **Changing `pack_size` text changes identity** — so the exported `pack_size` must be the stored text, never re-derived. | `pack-size-handling.md` PK13, `domain/identity.ts` |
| SX14 | Existing round-trip tests: `strength-round-trip.test.ts`, `export-xlsx.test.ts`, `xlsx-parser.test.ts`, `august-2026-import.test.ts` (85 items / 134 events against the real derived workbook). Any change to the column model must keep these green. | the four test files |
| SX15 | The macOS native menu mirrors a JS `CUSTOM_IDS` list and `menubar/menu-config.ts`; new menu items must be added in both places to stay in sync. | `components/menubar/menu-config.ts`, `src-tauri/src/lib.rs` |

---

## 3. Goals

- **G1** — The Stock Report can export the medicines it is showing as an `.xlsx` file laid out like `docs/public/inventory - TEMPLATE.xlsx`.
- **G2** — The exported file is a **genuine, lossless round-trip**: exporting and re-importing into an empty database reproduces the same items, pack pairs and month figures.
- **G3** — The day columns follow the **selected month's real length** (28–31), so the sheet matches the calendar it represents.
- **G4** — The workbook carries the template's full presentation: styled header, frozen top row, autofilter, column widths, the `AL`/`AM` formulas, and the data validations.
- **G5** — A second sheet gives the reader the month summary (figures + context), so the export stands alone without the app.
- **G6** — The export respects the on-screen filters (category, search, sort), because what is exported is what the operator was looking at.
- **G7** — The file leaves through a **native save dialog**, defaulting to Documents, with a real error path — no placeholder successes.
- **G8** — One exporter, not two: the Data page and the Stock Report share the same workbook-building core.

## 4. Non-goals

- **N1** — No CSV or JSON export from the Stock Report (the `.xlsx` is the only added format). `stock-level-report-spec` N1 is narrowed, not reversed.
- **N2** — No new report columns in the template grid: `Threshold`, `Status`, `Nearest expiry` and `Batches` are **not** appended. Status/threshold/expiry appear only as the summary sheet's counts, never as per-row columns.
- **N3** — No audit entry for exporting (reading is not an event, consistent with stock-level-report-spec D24-part-2).
- **N4** — No change to the on-screen report's layout, columns, grouping or sorting.
- **N5** — No "export all" escape hatch: filtered is the only behaviour.
- **N6** — No PDF/CSV changes; the Print and (future) Save-as-PDF paths are untouched.
- **N7** — No historical stock reconstruction — `stock_on_hand` stays the **live snapshot** even when a past month is selected; only the day columns and the summary's "this month" figures follow the picker.
- **N8** — No cloud/network upload; the file is written locally only.

---

## 5. Decisions taken in the interview

| ID | Decision | Value chosen |
|----|----------|--------------|
| E1 | Export shape | **Importable inventory-template grid** — one row per medicine in the template's column layout |
| E2 | Day columns | **Dynamic**: the selected month's real day count (28, 29, 30 or 31) |
| E3 | Column count | **43** — includes `pack_qty` + `pack_unit`, so pack identity round-trips; the shipped asset is regenerated to match (E17) |
| E4 | Round-trip | **Required** — export → import must yield identical data |
| E5 | Importer | **Must accept variable day counts too** (28–31), while still reading legacy fixed 41/43-column files |
| E6 | Daily data source | The **month selected** in the report's month picker |
| E7 | Filters honoured | **Category picker + search box + sort order** (all three) |
| E8 | Export button | Sticky-bar button next to Print |
| E9 | Save mechanism | **Native save dialog** via a new `tauri-plugin-dialog` dependency **plus a Rust command** that writes the bytes |
| E10 | Workbook fidelity | **Full template fidelity** — styling, freeze, autofilter, widths, formulas, validations |
| E11 | Filename | `cmis-stock-report-YYYY-MM.xlsx` |
| E12 | Empty values | **Truly blank cells** in the grid (best for re-import) |
| E13 | Existing export | **Share one export core** with the Data page — no duplication, both emit the same dynamic-day template |
| E14 | Extra sheet | **A second summary sheet** with the month figures **and** context (month, filter, as-of stamp) |
| E15 | Summary scope | **Stock Report only** — the Data page export stays single-sheet |
| E16 | Row canvas | **Header + populated rows only** — no 100-row blank padding, no placeholder rows |
| E17 | Shipped asset + docs | **Update both** — regenerate `docs/public/inventory - TEMPLATE.xlsx` and rewrite the Stock Report help section |
| E18 | Nothing to export | **Disable the button**, mirroring Print's `canPrint` rule |
| E19 | Current month | **All day columns, blanks for future days** — no truncation at today |
| E20 | Default save folder | **Documents** |
| E21 | Menu access | **Also add File → Export Stock Report** to `menubar/menu-config.ts` (and mirror in the native menu / `CUSTOM_IDS`) |
| E22 | Testing | **Unit tests for the pure builders** (dynamic day headers, filtered row sets, summary-sheet values, round-trip parsing), in the existing pure-module style |
| E23 | Received figure | Reuse the **existing month activity query**, including the em-dash rule, so the sheet matches the screen |

---

## 6. Functional specification

### E-F1 — The Export control

- A new **`Export`** button sits in the Stock Report's sticky bar, in the right-hand action cluster beside **Print**. It uses the `Download` icon, carries `press-feedback`, and is `size="sm" variant="outline"` to match Print.
- It is **disabled** when there is nothing to export: `inventory` is empty, or the filtered/search-narrowed set is empty (same condition the Print button already uses via `canPrint`, widened to include search).
- The button also appears as **File → Export Stock Report** in the app menu, disabled under the same rule if the menu framework allows; the item is added to `CUSTOM_IDS` and the macOS native menu so the three places stay in sync (SX15).
- Clicking it opens the **native save dialog** (E9), pre-filled with the E11 filename, defaulting to **Documents** (E20).
- On confirm, the workbook is built and written; a success toast names the saved path. On cancel, nothing happens and no toast fires. On failure, an **error toast with the real reason** — never a success placeholder.

### E-F2 — State lifting (SX8)

Because the export must honour **search** and **sort** (E7), the state currently local to `StockLevelTable` moves up:

- `search` and `sort` become `ReportsPage` state (or a small hook) and are passed **down** into `StockLevelTable` as props with change callbacks, keeping the component's existing rendering and `useCallback` handler conventions (`noJsxPropsBind`).
- `ReportsPage` already owns `category` and `month`; it now has everything the exporter needs: `items` (category-filtered snapshot), `search`, `sort`, `month`, and the month activity figures.
- The exporter consumes the **same derivations the table shows**: `filterStockLevelRows` → `sortStockLevelRows` (or `groupByCategory` flattened) so the exported row order is exactly the on-screen order (E7 "sort order"). Grouped order is preserved by flattening `groupByCategory(filtered, sort)`.

### E-F3 — The workbook

Two sheets, in this order:

**Sheet 1 — `Inventory Template`** (the importable grid, E1)

- Columns, left to right (E3, E6, E2):
  1. `name`
  2. `strength_value`
  3. `strength_unit`
  4. `form`
  5. `pack_size`
  6. `stock_on_hand`
  7. … `1…D` — **D day columns**, where `D` is the number of days in the selected month (28 / 29 / 30 / 31)
  8. `total_dispensed`
  9. `stock_remaining`
  10. `category`
  11. `supplier`
  12. `pack_qty`
  13. `pack_unit`
- Total column count is therefore **`8 + D`**: 36 for a 28-day month, 39 for a 31-day month. (Prefix 6 + D + suffix 4 + pack 2.)
- Day **header labels** are the day numbers themselves (`1`, `2`, … `D`), as the template does.
- **Row data** per medicine:
  - `name`, `strength_value`, `strength_unit`, `form`, `pack_size`, `pack_qty`, `pack_unit` written **verbatim from the stored values** (SX12, SX13) — never re-derived, so identity is preserved.
  - `stock_on_hand` = `item.qty`.
  - Day cells = that medicine's `dispensing_events` quantity for day _n_ of the selected month; `0`/absent days write a **truly blank cell** (E12).
  - `total_dispensed` = the sum of the day cells written, and `stock_remaining` = `stock_on_hand - total_dispensed` — again written as numbers, and mirrored into the `AL`/`AM` formulas.
  - `category` = stored category, blank when uncategorized (the `Uncategorized` display label is a **report-only** construct and must not be written into the data file, or it would change identity/import shape).
  - `supplier` = stored supplier, blank when unset.
- **Row order** follows the on-screen filtered+grouped order (E7).
- **No blank padding rows** (E16): the sheet ends after the last medicine. If the filtered set is empty, the sheet holds the header only — though in practice the button is disabled in that case (E18), so this is a defensive branch.
- **Full template fidelity** (E10):
  - header row styling — bold, `E8EEF6` fill, centred, the template's thin borders, row height;
  - column widths — the template's `A…F` and `AL…AO` widths, `6` for each day column, plus the pack columns' widths, recomputed for the dynamic layout;
  - frozen top row / first column, as the template's `A2` freeze;
  - `!autofilter` over the header row's full dynamic range (`A1:<last>`);
  - `AL`/`AM` formulas per populated row: `SUM(<firstDay><r>:<lastDay><r>)` and `IF(F{r}="",0,F{r})-AL{r}`, with cached values so the importer reads totals without recalculating (SX3's "cached results, not formulas");
  - the template's **data validations** (strength text length, unit/form/category lists, stock and daily whole-number ranges) applied to the populated rows and a sensible forward range, with the day range spanning the dynamic day columns.
- Print setup consistent with the template (landscape, fit-to-width, repeating title row) where the writer supports it.

**Sheet 2 — `Summary`** (E14, E23)

- A labelled key/value layout (label column + value column), not a secret code:
  - **Context**: report title, the month (`monthLabel`), the category filter (`All categories` or the name), the search query (or "none"), the operator (`getOperatorName()`, `Local user` fallback), and an **as-of** stamp (`formatAsOf(new Date())`).
  - **Stock totals**: medicines, units on hand, categories.
  - **Shelf health**: low, out, expiring ≤30d, expiring ≤90d, expired.
  - **This month**: received, dispensed — written from `buildMonthActivity(activity)`, so a totally quiet month shows the **em dash `—`** exactly as the screen does (E23). A month that received but dispensed nothing shows a real `0`.
- Values are the same `StockSummary` / `MonthActivity` the on-screen summary block renders, so sheet and screen can never disagree.
- Because the summary is Stock-Report-only (E15), the shared core exposes it as an **optional** second sheet; the Data page never requests it.

### E-F4 — The shared export core (E13, SX2, SX5)

- Extract workbook building so both surfaces call one implementation. Suggested shape (names indicative, to be settled in implementation):
  - a core builder that accepts `{ rows, daysInMonth, summary? }` and returns a SheetJS workbook — the existing `buildInventoryWorkbook` grows a `daysInMonth` argument and an optional summary;
  - `buildInventoryXlsxRows` becomes day-count-aware, replacing the hard-coded 31-length daily array and the `COL_*` indices;
  - the header list becomes a **function of `daysInMonth`** rather than the fixed `INVENTORY_TEMPLATE_HEADERS` constant.
- The Data page's export card keeps its own query but calls the **same** core with the current month's day count and no summary sheet (E15). Its web-fallback path (`downloadInventoryXlsx`) continues to work.
- `INVENTORY_TEMPLATE_HEADERS` (and `LEGACY_TEMPLATE_HEADERS`) are retained as the **31-day** shape for the importer's legacy branch (E5) and for tests, but must no longer be the only accepted shape.

### E-F5 — Variable day-column support in the importer (E5, SX3, E4)

- `csv-parser.ts` stops assuming 31 day columns. It derives the day count from the header row: the columns between `stock_on_hand` (index 5) and `total_dispensed` are the days, and their count may be **28, 29, 30 or 31**.
- Header validation accepts:
  - the **legacy fixed 41-column** layout (31 days), and
  - the **legacy fixed 43-column** layout (31 days), and
  - a **dynamic layout** with 28–31 day columns and 43 total columns.
- All positional constants (`COL_DAYS_START`, `COL_DAYS_END`, `COL_TOTAL_DISPENSED`, `COL_STOCK_REMAINING`, `COL_CATEGORY`, `COL_SUPPLIER`, `COL_PACK_QTY`, `COL_PACK_UNIT`) become **computed from the detected day count**, not module constants.
- A file with a day count outside 28–31, or with a column count that does not match `8 + D` (43-column) or `4 + D` (41-column legacy), raises the existing descriptive warning/error rather than shifting columns silently.
- The xlsx parser (`xlsx-parser.ts`) is a thin wrapper and needs no change beyond passing through the richer CSV.
- The `August 2026` reference workbook (31 days, 85 items) must still parse identically (SX14).

### E-F6 — Round-trip guarantee (E4)

- Exporting a filtered month and importing that file back into an empty DB reproduces:
  - every medicine's `name`, `strength_value`, `strength_unit`, `form`, `pack_size`, `pack_qty`, `pack_unit`, `stock_on_hand`, `category`, `supplier`;
  - the month's daily dispensing quantities (per item per day), which sum to `total_dispensed`;
  - the SKUs and identity keys (no duplicate or renamed items).
- The guarantee is tested for **28-, 30- and 31-day months**, and at least once with a **blank-pack** medicine and an **uncategorized** medicine (SX12, SX13).
- `stock_remaining` is a derived column and does not affect identity; it must still land on re-import consistent with `stock_on_hand - total_dispensed`.

### E-F7 — Save plumbing (E9, E20, SX6, SX7)

- **`tauri-plugin-dialog`** is added (Rust crate + JS package + capability registration) to open the native save dialog and return the chosen path.
- A new Rust command — `commands/reports.rs` or an `export.rs` module — is registered with the app's new `.invoke_handler(...)` (SX7: `lib.rs` has none today). Suggested contract:
  - `save_stock_report_workbook(bytes: Vec<u8>, path: String) -> Result<String, String>` — writes the workbook bytes to the operator-chosen path and returns the absolute path; a descriptive `Err(String)` on any I/O failure.
  - Keeping the xlsx bytes generated in TypeScript (SheetJS already runs in the app, SX5) and Rust purely the writer/revealer matches the existing pattern and avoids reimplementing the workbook in Rust.
- The frontend calls the dialog first, then the writer, through the existing `@/lib/tauri` wrapper so the web-fallback story elsewhere is unchanged.
- **Default folder: Documents** (E20). This mirrors the planned PDF destination (stock-level-report-spec D24) and gives the app one predictable place for generated files.
- A **Reveal in folder** toast action, wired through `@tauri-apps/plugin-opener`'s `revealItemInDir` (already installed, SX7), is a natural companion — recommended, not required.

### E-F8 — Empty and edge states

- **Empty database**: Export disabled (E18); the page still shows its existing empty-state panel.
- **Filters/search match nothing**: Export disabled; the table shows its existing "No medicines match" line.
- **Selected month is in the past**: day columns and the summary's received/dispensed follow that month (E6); `stock_on_hand` stays the **live snapshot** (N7), consistent with the on-screen report's "Stock as of …" honesty rule.
- **Current, in-progress month**: all day columns are present and future days are blank (E19).
- **A medicine with more than 31 batches, or events outside the month**: events are bucketed by month; only the selected month's events populate the day cells.
- **Legacy item with no pack pair** (`0` / `""`): `pack_qty`/`pack_unit` write blank; `pack_size` writes its stored text (SX12).
- **Uncategorized item**: `category` writes blank, never `Uncategorized` (E-F3).
- **Very large catalogue**: the file is built in memory; if a streaming/chunked path is needed it can follow the Data page's progress pattern, but the default is a single build.

### E-F9 — Documentation and asset (E17)

- `features/help/components/docs/sections/reports.tsx` gains an **Export** paragraph: what the file is (the importable inventory template), that day columns follow the selected month, that it honours the on-screen filters, and where it saves.
- `docs/public/inventory - TEMPLATE.xlsx` is **regenerated** to match the export's layout — including the `pack_qty` / `pack_unit` columns and a dynamic-day demonstration — so the shipped asset and the exporter can never drift again. `scripts/generate-template.py` is updated to emit the new column set (and, if practical, note the variable-day rule).
- Any doc that describes the template as "41 columns" or "43 columns" (e.g. `docs/specs/pack-size-handling.md`, README) is corrected to the dynamic description.

---

## 7. Data sources

| Cell / figure | Source | Notes |
|---------------|--------|-------|
| `name`, strength, form, `pack_size`, `pack_qty`, `pack_unit`, `category`, `supplier`, `stock_on_hand` | `useInventoryItems()` → `InventoryItem[]` | shared cache with Stock Management; `item.qty` is base units |
| Day columns | `dispensing_events` for the selected month, per item per day | the same month the report's `useMonthActivity` reads |
| `total_dispensed` | sum of the day cells | also cached into the `AL` formula |
| `stock_remaining` | `stock_on_hand - total_dispensed` | cached into the `AM` formula |
| Summary sheet — totals & health | `buildStockSummary(items)` | totals, low, out, expiry bands |
| Summary sheet — received / dispensed | `buildMonthActivity(useMonthActivity(month, category))` | em-dash rule for a quiet month (E23) |
| Summary sheet — operator | `getOperatorName()` | `Local user` fallback |
| Summary sheet — as-of | `formatAsOf(new Date())` | live snapshot stamp |

No new table or column. No migration. The existing `dispensing_events` month column is sufficient for the day bucketing.

---

## 8. Files affected

**Export core**

- `apps/desktop/src/features/inventory/import/export-xlsx.ts` — day-count-aware row builder, dynamic header list, optional summary sheet, dynamic column widths/validations/autofilter/formulas
- A new sibling module (e.g. `import/export-workbook.ts` or `stock-report-export.ts` in the reports feature) — the summary-sheet builder, so the reports feature owns its own sheet content
- `apps/desktop/src/features/inventory/import/csv-parser.ts` — variable-day detection and header acceptance; positional constants become computed
- `apps/desktop/src/features/inventory/import/xlsx-parser.ts` — pass-through (verify only)

**Stock Report page**

- `features/admin/reports/components/reports-page.tsx` — owns `search`/`sort`, builds the export payload, handles the dialog + save + toasts
- `features/admin/reports/components/reports-filter-bar.tsx` — the new Export button beside Print, with a disabled rule that includes the search
- `features/admin/reports/components/stock-level-table.tsx` — search/sort become props instead of local state
- `features/admin/reports/stock-report-export.ts` *(new)* — pure functions: `buildExportRows(...)`, `buildExportSummary(...)`, `exportFileName(month)`, `daysInMonth(month)`; unit-tested

**Rust / platform**

- `apps/desktop/src-tauri/Cargo.toml` — `tauri-plugin-dialog`
- `apps/desktop/src-tauri/src/commands/reports.rs` *(new)* or an `export.rs` — the workbook writer command; `commands/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs` — `.invoke_handler(generate_handler![...])`, plugin registration, plus the `file.export-stock-report` native menu item and `CUSTOM_IDS`
- `apps/desktop/src-tauri/capabilities/*` — dialog/write permissions

**Shell & navigation**

- `apps/desktop/src/components/menubar/menu-config.ts` — File → Export Stock Report

**Docs & asset**

- `apps/desktop/src/features/help/components/docs/sections/reports.tsx`
- `docs/public/inventory - TEMPLATE.xlsx` (regenerated), `scripts/generate-template.py`
- `docs/specs/pack-size-handling.md` and any "41/43 columns" reference

**Tests**

- `features/admin/reports/stock-report-export.test.ts` *(new)*
- `features/inventory/import/export-xlsx.test.ts` (extend)
- `features/inventory/import/csv-parser.test.ts`, `xlsx-parser.test.ts` (extend for 28/30-day layouts)
- `features/inventory/import/strength-round-trip.test.ts` (extend with a dynamic-day round-trip)
- `features/inventory/import/august-2026-import.test.ts` must stay green untouched (SX14)

---

## 9. Verification

**Automated (E22)**

- `pnpm check-types` clean; `pnpm test:frontend` green; `pnpm dlx ultracite check` clean (then `fix`).
- New/extended unit coverage, at minimum:
  - `daysInMonth` for January (31), February (28), a leap February (29), April (30), September (30), December (31);
  - dynamic header generation produces `6 + D + 6` columns with day labels `1…D`;
  - exported row set matches `filterStockLevelRows` + the flattened `groupByCategory` order for a category + search + sort combination;
  - blank cells for zero days, unset pack pair, blank category (never `Uncategorized`), blank supplier;
  - summary-sheet values equal `buildStockSummary` and `buildMonthActivity`, including the em-dash for a quiet month and a real `0` for a received-only month;
  - `exportFileName` yields `cmis-stock-report-2026-09.xlsx` for the September fixture;
  - round-trip: build workbook → parse with `parseInventoryXlsx` → assert identical items and daily quantities, for 28-, 30- and 31-day months;
  - importer accepts a legacy 41-column and a legacy 43-column file unchanged, and rejects a malformed day count with a descriptive error.

**Manual, in `pnpm desktop:dev`**

1. Stock Report → Export opens the native dialog pre-filled `cmis-stock-report-2026-09.xlsx`, defaulting to Documents; cancelling does nothing.
2. The saved workbook opens in Excel with the styled header, frozen top row, autofilter, widths, and per-row `AL`/`AM` formulas.
3. September exports 30 day columns; step to February and export again — 28 (or 29 in a leap year).
4. Filter to one category, search a partial SKU, sort by On hand: the exported rows and their order match exactly what is on screen; no extra rows.
5. Sheet 2 shows the same month summary the screen shows, with the month, filter, operator and as-of stamp; a quiet month reads `—`.
6. Wipe the DB and re-import the exported file: same medicines, same pack pairs, same month quantities, no duplicates.
7. A medicine with no pack shows blank `pack_qty`/`pack_unit`; an uncategorized medicine shows a blank `category`.
8. With an empty DB or a filter matching nothing, the Export button is disabled.
9. File → Export Stock Report performs the same action; the native menu entry matches.
10. Point the writer at an unwritable location: the toast reports a real error, never success.

---

## 10. Phase plan

| Phase | Contents | Done when |
|-------|----------|-----------|
| **1** | Shared dynamic-day export core, summary sheet, page button, state lifting, native save plumbing (`tauri-plugin-dialog` + Rust writer), menu item | Verification items 1–4, 6–10 pass for the app's own export path; the Data page export still works |
| **2** | Importer variable-day support, shipped asset + `generate-template.py` regeneration, docs rewrite, round-trip tests for 28/30/31 | Verification item 5 and the full automated round-trip suite pass; the August reference workbook still parses identically |

Phase 1 must not ship a button that writes a file the app cannot read back: if the importer change lands later, the round-trip claim stays unverified until Phase 2 — call this out in the UI copy or land both phases together.

---

## 11. Open questions and risks

1. **Fixed-width importer vs dynamic days is the real risk.** `csv-parser.ts` validates headers by exact equality (SX3). Relaxing that must not weaken legacy detection — a malformed file should still error rather than silently shift columns. A guard test for both directions is mandatory.
2. **The 41 vs 43 ambiguity is resolved toward 43 (E3)**, but that means the shipped asset changes shape. Any external process (the clinic, a school, a documented workflow) that expects a 41-column template will see two new columns; the docs must explain them.
3. **`docs/public/inventory - TEMPLATE.xlsx` cannot literally be "dynamic"** — a shipped file has one shape. Regenerating it fixes a representative month; the spec should state which month the asset demonstrates (recommend the current month at generation time) and that the app's export varies by picker.
4. **`tauri-plugin-dialog` is a new dependency and the Rust handler is greenfield** (SX7). The writer command + capability permissions must be validated on the Windows signing/build pipeline before Phase 1 is considered done.
5. **State lifting touches a component with existing conventions** (`noJsxPropsBind`, no components-in-components). Search/sort must arrive as stable `useCallback` props, and the table's existing tests (if any) may need updated props.
6. **"Sort order" and grouped export order.** The table groups by category, so an "on-screen order" export is the flattened group order, not one global sort. This is the intended reading of E7, but it is worth confirming during implementation that a user pressing Export after sorting by On hand expects category groups in the file.
7. **The summary sheet's em dash vs a spreadsheet.** E23 keeps `—` for a quiet month for screen parity; some downstream consumers may prefer `0`. Revisit if the file is ever machine-consumed.
8. **`category` blank vs `Uncategorized`.** The report displays `Uncategorized`, but the data file must write blank (E-F3) or re-import would create a real category. This asymmetry is deliberate and needs a comment so it is not "fixed" later.
