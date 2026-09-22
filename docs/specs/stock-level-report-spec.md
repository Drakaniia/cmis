# Spec — Stock Level Report (Reports page rebuild)

**Short name:** `stock-level-report`
**Area:** `apps/desktop` — the Reports page (`/admin/reports`), the relocated analytics view, and the app's first Rust command
**Status:** Draft, awaiting implementation
**Date:** 2026-09-21
**Phases:** Phase 1 — page rebuild + analytics relocation + system Print. Phase 2 — the Rust-drawn PDF.
**Supersedes, in part:** the widget grid and export controls described in `CMIS-UI-07` as implemented in `features/admin/reports/`

---

## 1. The request, in the requester's words

> "i want to remove import, exportxsv and export pdf in the /report page, or jsut i only want to generate report that shows the stock level of each medecine"

Two readings were on the table: strip the toolbar only, or strip the page back to one thing. The interview settled it as **both, taken further**:

1. **The three toolbar actions go.** Import, Export CSV and Export PDF disappear from the reports page. Import was never real (see SL1) and export moves to a single, deliberate PDF.
2. **The page becomes a stock report.** Not a dashboard — a document: every medicine with its full standing, grouped by category, with a comprehensive month summary above it and a real PDF behind a button.

The six analytic widgets are not deleted. They get their own home (`/admin/analytics`), so nothing is lost while Reports becomes the paper that gets handed to someone.

---

## 2. Current state — relevant findings

Numbered `SL1…SL15` for reference from the decisions and functional sections.

| # | Finding | Evidence |
|---|---------|----------|
| SL1 | The **Import button is fake**. It opens a hidden file input, accepts a file, then only fires a success toast — no parsing, no database write. The `accept` list is `.csv,.xlsx,.xls`, and the handler dynamically imports `sonner` purely to toast the filename and size. | `reports-filter-bar.tsx` → `handleImportClick`, `handleImportFile` |
| SL2 | The **real** import path is elsewhere and unaffected by this change: the Data page mounts an import card, and the inventory pages have their own add/import flows. | `routes/admin.data.tsx`, `features/admin/data/components/import-card.tsx`, `features/inventory/import/import.ts` |
| SL3 | **Export PDF is also a placeholder**: a `toast.message` explaining that print is the answer, followed by `window.print()`. The comment calls this "Agency: no fake download". | `reports-page.tsx` → `handleExportPdf` |
| SL4 | **Export CSV is real but report-shaped**: `buildReportsCsv` emits eight labelled sections (Filters, Stock Movement, Low-Stock Trend, Expiry Timeline, Usage by Category, Dispensed vs Requested, Top Dispensed, Stock Levels). It is not a stock-level export with extras — it is a dashboard dump. | `export-reports.ts` → `buildReportsCsv` |
| SL5 | The **Stock Levels section already exists** and is already the page's lead block: pure row-building, search, sort, status badge, base-unit quantities with a pack hint. | `stock-level-rows.ts`, `components/stock-level-table.tsx` |
| SL6 | The stock snapshot **deliberately ignores the date preset** — it is a snapshot, not a window — while sharing the inventory hook's cache so it can never disagree with Stock Management. | `reports-page.tsx:53-62` (comment), `stock-level-rows.ts` |
| SL7 | Everything in `features/admin/reports/` is referenced **only by `reports-page.tsx`**: the six widget components, `use-reports.ts` (six query hooks), `use-reports-filters.ts`, `types.ts`, `export-reports.ts`. The folder is self-contained, which is what makes both the strip and the relocation cheap. | `code_search buildReportsCsv\|ReportsFilterBar\|…` → only intra-folder hits |
| SL8 | Month data **is available** for a summary block: `dispensing_events` (item, date, month, qty, unique per item+date), `audit_log` with `after_json.received` for stock-in units, `requests` (submitted_at, category, qty), `inventory_batches` (batch, expiry, qty, supplier). | `migrations/0003_dispensing_events.sql`, `0004_inventory_creation.sql`, `0001_request_queue.sql`, `0002_inventory.sql` |
| SL9 | There is **no price or cost column** on `inventory_items` (nor anywhere else), so no valuation figure can appear in the summary. | `migrations/0002_inventory.sql` |
| SL10 | Expiry urgency already has one shared classifier, and its thresholds are constants used by Expiry Alerts: `EXPIRY_THRESHOLDS = { soon: 30, later: 90 }` with `expired` below zero. Reusing it is what keeps the report and Expiry Alerts from ever disagreeing. | `features/inventory/domain/expiry.ts`, `features/inventory/types.ts:11` |
| SL11 | `useExpiryBuckets` **accepts a category and ignores it** (`_category`); the expiry widget's bars are therefore never narrowed by the filter bar's category. A latent inconsistency worth not carrying into the analytics page untouched. | `hooks/use-reports.ts` → `useExpiryBuckets` |
| SL12 | **There is no print stylesheet anywhere in the app.** `index.css` has no `@media print` block; the single `window.print()` call in the codebase is the fake Export PDF above. | `code_search window\.print\|@media print` → one hit (reports page) |
| SL13 | **The Rust side has no commands at all.** `commands/mod.rs` is a comment stub ("add per feature") and `lib.rs` registers no `invoke_handler`. That is why the Data page's `invoke("export_data")` silently fails into the web fallback. `tauri-plugin-dialog` is **not** installed; `tauri-plugin-opener` **is**. | `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `features/admin/data/components/export-card.tsx` |
| SL14 | Page identity is spread across five places: sidebar items, the route→title map in the global header, the command palette, the frontend menu config, and the macOS native menu + `CUSTOM_IDS`. Routes are file-based, with a generated `routeTree.gen.ts`. | `app-sidebar.tsx:104`, `header.tsx:31`, `command-palette.tsx:124`, `menubar/menu-config.ts:269`, `src-tauri/src/lib.rs` |
| SL15 | Biome carries a **per-file override naming a reports widget** (`expiry-timeline-widget.tsx` for its SVG `role` usage). Relocating that file without updating the path silently disables the exemption. | `biome.jsonc:106` |

Supporting findings:

- The operator identity for a document header is available app-wide: `getOperatorName()` with `DEFAULT_OPERATOR = "Local user"`, fed by Settings → General → Operator name. There is **no facility setting**; the dispensing log's default branch literal is `"Local"` (`features/admin/dispensing/rows.ts:20`).
- The help docs describe the widget grid and Export CSV by name, and `docs/specs/pack-size-handling.md` cites `export-reports.ts` and three widget files by path. Both need updating (D26).
- The only existing test in the reports folder is `stock-level-rows.test.ts` (pure functions over hand-built `InventoryItem` fixtures) — the style to extend.

---

## 3. Goals

- **G1** — The Reports page answers one question: *what medicines do I have, how much, and how healthy is the shelf?* No charts competing for attention.
- **G2** — A summary block that reads as a month's status report: the size of the catalogue, its health, and what moved in and out this month.
- **G3** — A full-detail, category-grouped list — strength, form, pack, threshold, status, expiry, batch count — with per-category subtotals and a grand total.
- **G4** — Output that can leave the app: a real PDF, drawn in Rust, saved with a predictable name and revealed in the file manager; plus the system print dialog for anything else.
- **G5** — The six analytic widgets remain reachable and fully functional at `/admin/analytics`.
- **G6** — Nothing on the page pretends to do something it does not do (the present Import button is the anti-pattern being deleted).

## 4. Non-goals

- **N1** — No CSV export from the reports page (D16). Bulk tabular export stays on the Data page; this page produces a document.
- **N2** — No import from the reports page (D24). The button is deleted, not reimplemented.
- **N3** — No supplier column, no per-medicine dispensed-this-month, no incomplete-details flag on the report table (D3).
- **N4** — No stock valuation, cost or price anywhere (SL9 — the data does not exist).
- **N5** — No historical stock reconstruction: the report does not recompute past on-hand quantities for the selected month (D30).
- **N6** — No new analytics features; the six widgets move unchanged (minus the export buttons on their bar).
- **N7** — No audit entry for generating a report (D24-part-2); reading is not an event.

---

## 5. Decisions taken in the interview

| ID | Decision | Value chosen |
|----|----------|--------------|
| D1 | Reports page scope | **One stock-level report** — the six widgets leave the page, the three toolbar buttons are deleted |
| D2 | Month summary figures | **Stock totals + health counts + this month in/out** (no top movers, no fulfillment block) |
| D3 | Extra per-medicine columns | **Form & strength, pack hint, expiry/batch count** |
| D4 | Date presets | **Replaced by a month picker** (7D/30D/90D/1Y pills are removed) |
| D5 | Month picker range | **Current month default, unlimited past, never a future month** |
| D6 | Month memory | **Session only** — remembered while the app runs, resets to the current month on restart |
| D7 | List layout | **Grouped by category** with a subtotal per group |
| D8 | Subtotal content | **Full mini-summary**: count, units on hand, low, out, nearest expiry |
| D9 | Zero-stock medicines | **Included, in place** — the report doubles as the full catalogue |
| D10 | Category filter | **Kept, and it filters everything** — the summary and the list |
| D11 | Search & sort | **Both kept**; sorting applies within each category group |
| D12 | Expiry health buckets | **Both buckets** — expired, expiring ≤30d, expiring ≤90d, from the shared thresholds |
| D13 | Naming | Sidebar, palette and header all read **"Stock Report"**; route stays `/admin/reports` |
| D14 | Heading placement | **The global header map** carries the title (no separate on-page heading block on screen) |
| D15 | Empty month | Month in/out figures render an **em dash (—)**, not a zero |
| D16 | Empty database | **Reworded empty state with a link to the real import page** |
| D17 | Outputs | **Two buttons**: Print (system dialog) and Save as PDF (native Rust) |
| D18 | Document header | **Title + context, operator/facility, page numbers, repeated table headers**; no signature lines |
| D19 | Document scope | **Everything** — summary + all medicines matching the filter + subtotals, scroll caps lifted |
| D20 | Filter in the document | **Honoured** — the PDF/print matches the screen, and the header names the filtered category |
| D21 | Screen print mechanism | **`window.print()` + a new `@media print` stylesheet** |
| D22 | PDF engine | **Drawn in Rust** (`printpdf`), from a payload the frontend sends |
| D23 | PDF page | **A4 landscape** |
| D24 | PDF destination | **Auto-save to Documents**, then toast the path with a reveal action; **no audit entry**; Import button deleted outright |
| D25 | Analytics relocation | **`features/admin/analytics/` + a new `/admin/analytics` route + a sidebar item next to Reports + a native View menu item**; its bar keeps presets and category, loses Import/Export CSV/Export PDF |
| D26 | Documentation | **Rewrite the Reports help section as Stock Report, add an Analytics section, and fix the stale `export-reports.ts` references in `docs/specs/pack-size-handling.md`** |
| D27 | Tests | **Unit tests for the new pure logic** (summary figures, grouping, subtotals, as-of label), in the style of `stock-level-rows.test.ts` |
| D28 | Dead code | **Deleted fully** — `export-reports.ts`, the CSV/PDF handlers, the fake import handler and its hidden input, unused imports |
| D29 | Sequencing | **One spec, two phases** — the page is usable after Phase 1; the PDF is Phase 2 |
| D30 | Stock vs month | **Stock stays live**; the report carries an explicit **"Stock as of …"** stamp and the month labels only the in/out figures |

---

## 6. Functional specification

### F1 — Page composition

Top to bottom, inside the existing page shell (sticky bar + scroll area):

1. **Summary block** (F2) — the month status card, carrying the as-of stamp and the grand total row.
2. **Grouped medicine table** (F5) — one section per category, each with a subtotal strip.
3. **Footer meta line** — reworded version of the existing provenance line: generated timestamp, month, category filter, and the as-of note.

Removed from the page entirely: the three toolbar buttons, the hidden file input, the analytic widget grid, the `motion.div` stagger wrapper that existed only for the widgets, the `isEmptyDb` "import CSV to see trends" panel (replaced per F6), and the now-unused query hooks.

Kept: the sticky translucent bar with its material treatment (§12) and `press-feedback` on every control, the density-aware grid breakpoints, and the reduce-motion rules.

### F2 — The month summary block (D2)

One card, three groups of figures, in this reading order:

**Stock totals** (live snapshot, category-filtered):
- **Medicines** — number of rows in the report.
- **Units on hand** — sum of base units across those rows.
- **Categories** — number of distinct categories represented.

**Shelf health** (live snapshot, category-filtered, computed with the shared classifiers):
- **Low stock** — rows where `classifyLowStock(qty, threshold) === "low-stock"`.
- **Out of stock** — rows where it is `"out-of-stock"`.
- **Expiring ≤ 30 days**, **Expiring ≤ 90 days**, **Expired** — counts of medicines with a batch in that band, counted via `classifyExpiry(daysUntilExpiry(batch.expiry))` from `features/inventory/domain/expiry.ts`, so the numbers match Expiry Alerts exactly (SL10). A medicine with several batches in the same band counts once.

**This month** (driven by the month picker, category-filtered):
- **Received** — units received, read from the same source the movement widget used (`audit_log` rows with `action = 'stock-in'` and `after_json.received`, summed over the month) (SL8).
- **Dispensed** — units dispensed, summed from `dispensing_events` for the month.

Rules:
- Health-count and "both expiry buckets" definitions come from D12: `expired`, `expiring-soon` (≤30d) and `expiring-later` (≤90d) are reported as separate figures, using the shared thresholds rather than a private constant.
- When the selected month has **no** inbound and **no** outbound activity, both month figures render an em dash **—** (D15), visually distinct from a genuine zero. A month that received but dispensed nothing still shows `0` for dispensed.
- Every figure carries its label in words; nothing is a bare number in a box that requires decoding.
- The card's context line reads **"Stock as of {generated timestamp}"** (D30) plus the active filters, so a screenshot can never be mistaken for historical stock.

### F3 — Month picker (D4, D5, D6, D30)

- The 7D/30D/90D/1Y pill row and the `PresetButton` spring indicator are **removed**; `use-reports-filters.ts` and `ReportsPreset` lose their purpose on this page (the analytics page keeps its own copy — F11).
- The picker is a **month stepper**: `‹  September 2026  ›`, with the forward control disabled at the current month (no future months, D5) and a "Current month" affordance when the selection is off-current. A native month input is an acceptable alternative if it is constrained to `max = current month`; the stepper is preferred because it needs no new component vocabulary.
- Default is the current month; stepping back is unlimited (the data simply ends).
- Selection lives in **session state** (D6): remembered while the app is open, reset on restart. It must not be written to the settings store.
- The month drives **only** the "This month" figures. Stock totals, health counts and the table stay live (D30).

### F4 — Category filter, search, sort (D10, D11)

- The **category picker stays** and narrows the summary figures *and* the visible groups in the list (D10). Choosing a category collapses the report to that single group; the group header still names it.
- The **search box stays**: case-insensitive match on medicine label, SKU or category, applied before grouping, so a query can leave a group empty.
- **Sortable headers stay**, but sorting applies **within** each group (D11). The default remains status ascending with name as the tie-break — worst first, as today.
- In grouped mode the `category` sort key is meaningless; its header becomes non-sortable (or the key is dropped) rather than pretending to reorder groups. Group order is alphabetical by category, with blank/`Uncategorized` last.
- The "N of M" counter stays, counted across the whole filtered set, and a per-group count appears in the group header (F5).

### F5 — Grouped medicine table (D7, D8, D3)

Columns, left to right:

| Column | Content | Notes |
|--------|---------|-------|
| Medicine | `composeListLabel(item)` — name with strength — with SKU beneath, as the current table does | existing rendering reused |
| Form & strength | `form` + `strengthValue`/`strengthUnit`, e.g. `tablet · 500 mg` | blank fields degrade to an em dash |
| On hand | numeric base units, right-aligned, `tabular-nums` | the sortable numeric column |
| Pack hint | `describeQuantity(qty, { form, packQty, packUnit })` — `20 sachet (2 box)` | shows an em dash when the pair is unset (`packQty` 0 / blank unit) rather than a broken hint |
| Threshold | numeric, right-aligned | sortable |
| Status | `StatusBadge` from `LOW_STOCK_STATUS_CONFIG` | sortable, default sort key |
| Nearest expiry | `expiryLabel(item.expiry)` with urgency styling from `classifyExpiry` | em dash when blank |
| Batches | `item.batches.length` | right-aligned |

Because the On hand and Pack hint columns are now separate (D3), On hand carries the number and Pack hint carries the packaged string — today the single cell mixes them.

Each category group renders:
- a **group header**: category name, its medicine count, and its own search-hit count when a query is active;
- its rows, sorted per F4;
- a **subtotal strip** (D8) carrying the full mini-summary: medicines, units on hand, low, out, and the category's nearest expiry date.

A **grand total** row closes the table, mirroring the summary block's stock figures so a printed page reconciles with itself.

Rendering constraints:
- The existing sticky-header + capped scroll behaviour stays on screen (`max-h-[420px]` today) *per group*, and the print stylesheet lifts the cap (F8).
- `ReactElement`/`key` rules already observed by `SortHeader` continue to apply; no components defined inside components; handlers stay `useCallback`-stable (`noJsxPropsBind`).

### F6 — Zero stock and empty states (D9, D16)

- Medicines at 0 units **appear in place** in their category group, in status order among their peers (D9). No separate trailing group.
- **Empty database**: the current "No data yet — import CSV to see trends" panel is reworded to a plain statement that no medicines are recorded yet, with a button linking to the real import destination (D16, SL2). The dead text about `dispensing_events` while importing an inventory CSV is dropped.
- **Empty month, non-empty inventory**: the report renders normally with the month figures as em dashes (F2).
- **Filter excludes everything**: a short "No medicines match" line in place of the table, with the active filter named.

### F7 — Outputs (D17, D21, D22, D24)

**Print (Phase 1).** A `Print` button in the sticky bar calls `window.print()`, with the new print stylesheet (F9) doing the document work. Its tooltip/description may mention that the system dialog's own "Save as PDF" also works, but the button must not claim to produce a PDF itself.

**Save as PDF (Phase 2).** A `Save as PDF` button invokes the new Rust command (F10) and, on success, toasts the saved path with a reveal action; on failure, an error toast with the real reason. No placeholder success, ever (the SL3 anti-pattern).

Both buttons:
- are `disabled` only when there is genuinely nothing to print (no medicines at all);
- carry `press-feedback`, and sit in the bar's right-hand action cluster (where the three removed buttons were);
- honour the active category filter, as the document does (D20).

### F8 — Document contents (D18, D19, D20)

Applies to both the printed page and the PDF.

**Header block:**
- Title: **Stock Level Report**.
- Context: the selected month and its in/out figures; the category filter (`All categories` or the name); the as-of stamp; the generated timestamp.
- Operator: `getOperatorName()` (Settings → Operator name, `Local user` fallback) and the location literal — **`Local`**, the same default the dispensing log uses, since no facility setting exists (see §12 Open questions).

**Body:** the summary block, then every medicine matching the filter — the **complete** set, with scroll caps lifted (D19) — grouped by category with the subtotals and the grand total.

**Pagination:** table headers repeat on each page; pages are numbered (D18). Note the honest split: the Rust PDF can draw "Page N of M" itself; the **system print dialog cannot be forced to add page numbers** by CSS, so for the Print path we rely on the browser dialog's own header/footer option. This is called out in §12.

**No signature lines** (D18 explicitly excluded them).

### F9 — Print stylesheet requirements (D21)

A new `@media print` block in `apps/desktop/src/index.css`, plus `print:hidden` on chrome that must never print:

- **Hidden**: sidebar/rail, global header, the sticky filter bar, toasts, and any motion/decorative overlay.
- **Lifted**: `max-h`/`overflow-auto` caps on the report and its group scrollers become visible overflow, so the whole list renders.
- **Repeated headers**: `thead { display: table-header-group }` on the report table; group headers kept with their first rows (`break-inside: avoid` on a group's header+subtotal pairing where practical).
- **Readable on paper**: card borders and muted backgrounds neutralised, text forced to dark-on-white, chart-era gradients and translucent materials flattened.
- **Stable column widths** so a paginated table does not reshape between pages.

### F10 — The Rust PDF (D22, D23, D24)

The first real command in the app (SL13), so this section doubles as the wiring decision.

- **Crate**: `printpdf` added to `apps/desktop/src-tauri/Cargo.toml`. Base-14 fonts (Helvetica) are used, so no font files ship. Version pinned at implementation time.
- **Module**: `src-tauri/src/commands/reports.rs`, exported from `commands/mod.rs` (which already says "add per feature"), and registered with a new `.invoke_handler(tauri::generate_handler![generate_stock_report_pdf])` in `lib.rs` — `lib.rs` currently has none.
- **Command**: `generate_stock_report_pdf(payload) -> Result<String, String>`, returning the absolute path written.
- **Payload is data, not a query.** The frontend sends the already-computed report (`asOf`, `month`, `monthLabel`, `categoryLabel`, `operator`, `location`, `summary`, `groups[{ category, subtotal, rows }]`, `grandTotal`). Rust never touches SQLite: all the SQL stays in the TS query layer, one place to change, and the command stays a pure renderer that is easy to test. This also avoids re-implementing the audit-log/`dispensing_events` joins in Rust.
- **Layout** (A4 landscape, 842 × 595 pt): title + context header, operator/location line, summary block as a compact key–value strip, then the groups; repeating column header row; subtotal strip per group; grand total; footer with `Page N of M` and the generated timestamp.
- **Destination** (D24): the Documents directory via the Tauri path API, filename `cmis-stock-report-<YYYY-MM>-<YYYYMMDD-HHmm>.pdf` — the time component makes collisions impossible without a dialog. No `tauri-plugin-dialog` dependency is added.
- **Reveal**: on success, the frontend toasts the path with a **Reveal in folder** action wired to `revealItemInDir` from `@tauri-apps/plugin-opener` (already installed), invoked through the existing `@/lib/tauri` wrapper so the web fallback story matches the rest of the app.
- **Failure**: a real error message; if Documents is unwritable the toast says so instead of claiming success.
- **No audit row** (D24). Nothing is written to `audit_log`.

### F11 — Analytics relocation (D25, N6)

- Move to `apps/desktop/src/features/admin/analytics/`: the six widget components, `widget-card.tsx`, `use-reports.ts` (renamed to `hooks/use-analytics.ts`), the filter bar (as an analytics bar), and the report types the widgets need (`StockMovementPoint`, `LowStockPoint`, `ExpiryBucket`, `CategoryUsage`, `FulfillmentPoint`, `TopDispensedRow`, `ReportsPreset`, `ReportsFilters`).
- New route `apps/desktop/src/routes/admin.analytics.tsx` + page `components/analytics-page.tsx`, reusing today's grid, stagger and filter-bar behaviour exactly as it is — **minus** the Import, Export CSV and Export PDF buttons and the fake import input (D25).
- The analytics bar keeps the **7D/30D/90D/1Y presets** and the category picker.
- Nav: an **Analytics** item directly under Reports in `app-sidebar.tsx` (icon: `BarChart3` moves to Analytics, or a line-chart equivalent; the Reports item takes a document/table icon), a matching command-palette entry, a `View → Go to Analytics` item in `menubar/menu-config.ts`, and the macOS native menu item `view.go-analytics` added to `setup_native_menu` **and** to `CUSTOM_IDS` (SL14).
- While relocating, fix SL11 by passing the category through to the expiry query, or remove the unused parameter — either way, no dead argument.
- Update `biome.jsonc`'s per-file override path for `expiry-timeline-widget.tsx` (SL15).
- **Out of scope**: new widgets, new queries, chart redesign (N6).

### F12 — Naming and navigation (D13, D14)

- Sidebar label, command palette entry and global header title all read **"Stock Report"**; the sidebar group heading stays **Reports**.
- The route stays `/admin/reports`; `header.tsx`'s route→title map is updated for it, and a new entry added for `/admin/analytics`.
- The macOS File menu's existing `file.import` / `file.export` items are **not** touched — they belong to the Data page flow, not to this page.
- The `View → Go to Reports` native item keeps its id; only its label may change if the menu is re-labelled to match.

### F13 — Documentation (D26)

- `features/help/components/docs/sections/reports.tsx`: rewrite as **Stock Report** — the summary figures, the month picker, the grouped table with subtotals, the as-of stamp, and Print / Save as PDF. The `WIDGETS` list moves out.
- A new help section for **Analytics** describing the six cards (the moved content), with the TOC entry in `docs-toc.tsx`.
- `features/help/components/docs/sections/dispensing.tsx:70` mentions "Export CSV" in a reports-adjacent context — verify and correct it so no doc still promises a CSV export from Reports.
- `docs/specs/pack-size-handling.md:425` cites `export-reports.ts` (deleted) and three widget paths (moved): update the paths, and note the stock report's pack hint as the successor rendering of D14.

### F14 — Removal list (D28)

Deleted:
- `features/admin/reports/export-reports.ts` (`buildReportsCsv`, `downloadReportsCsv`) — no CSV path remains on this page;
- `ReportsFilterBar`'s import input, `handleImportClick`, `handleImportFile` and the `useRef`;
- `reports-page.tsx`'s `handleExportCsv`, `handleExportPdf`, the `Download`/`FileDown`/`Upload` icon imports, the `toast` import if unused, and the `downloadReportsCsv` import;
- the six widget imports, the six query hooks and the grid wrapper they lived in;
- `features/admin/reports/hooks/use-reports-filters.ts` and the report types the page no longer needs (they move with the widgets, F11).

Kept and extended: `stock-level-rows.ts` (joining the new summary/grouping logic as sibling pure modules), `stock-level-table.tsx` (its search/sort internals are reused inside the grouped layout), `stock-level-rows.test.ts`.

Suggested new pure modules (matching the existing "pure logic outside the component, tested without a database" convention, SL5):
- `stock-report-summary.ts` — `buildStockSummary(rows)`, `buildMonthActivity(...)`, the dash rule, the as-of label;
- `stock-report-groups.ts` — `groupByCategory(rows, search?)`, per-group subtotals, grand total, group ordering.

---

## 7. Data sources

| Figure | Source | Notes |
|--------|--------|-------|
| Every per-medicine column | `useInventoryItems()` → `InventoryItem[]` | shared cache with Stock Management (SL6); no new query |
| Low / out counts | `classifyLowStock(qty, threshold)` | `features/inventory/domain/low-stock.ts` |
| Expiry bands | `classifyExpiry(daysUntilExpiry(batch.expiry))` | `features/inventory/domain/expiry.ts`; shared thresholds (SL10) |
| Nearest expiry, batch count | `item.expiry`, `item.batches` | already on the item |
| Pack hint | `describeQuantity(qty, { form, packQty, packUnit })` | `features/inventory/domain/pack-size.ts` (pack-size D14) |
| Dispensed this month | `SELECT SUM(qty) FROM dispensing_events WHERE month = ?` (+ category join) | the existing movement query's outbound half |
| Received this month | `audit_log` where `action='stock-in'`, summing `after_json.received` within the month window | the existing `loadInboundByDate` logic; `after.qty` must **not** be used as a fallback (it is the resulting total) |
| Operator | `getOperatorName()` | `features/admin/audit/operator.ts` |
| Location | the `Local` default branch literal | no facility setting exists (SL13/§12) |

No new migration, no new table, no schema change: this spec adds no column.

---

## 8. Files affected

**Page & logic (Phase 1)**

- `features/admin/reports/components/reports-page.tsx` — rebuilt around summary + grouped table, print handler, PDF handler
- `features/admin/reports/components/reports-filter-bar.tsx` — becomes the stock report bar: month stepper, category picker, search/sort context, Print + Save as PDF; import/export removed
- `features/admin/reports/components/stock-level-table.tsx` — gains the new columns, grouping, group subtotals and grand total
- `features/admin/reports/components/summary-block.tsx` *(new)* — the month summary card
- `features/admin/reports/stock-level-rows.ts`, `stock-report-summary.ts` *(new)*, `stock-report-groups.ts` *(new)*
- `features/admin/reports/types.ts` — `StockLevelRow` gains strength/form/expiry/batch fields; `StockLevelSortKey` loses or keeps `category` per F4; month/summary types added; widget types removed (moved)
- Tests: `stock-level-rows.test.ts` (extend), `stock-report-summary.test.ts` *(new)*, `stock-report-groups.test.ts` *(new)*
- Deleted: `export-reports.ts`, `use-reports-filters.ts` (if unused after the move)

**Analytics (Phase 1)**

- `features/admin/analytics/**` *(new)* — six widgets, `widget-card.tsx`, `hooks/use-analytics.ts`, filter bar, page, types
- `routes/admin.analytics.tsx` *(new)*, `routeTree.gen.ts` (regenerated)
- `features/admin/reports/components/*widget*.tsx`, `top-dispensed-table.tsx`, `hooks/use-reports.ts` — moved out

**Shell & navigation**

- `components/app-sidebar.tsx`, `components/header.tsx`, `components/command-palette.tsx`, `components/menubar/menu-config.ts`
- `apps/desktop/src/index.css` — the new `@media print` block
- `biome.jsonc` — relocated widget path in the per-file override

**Rust (Phase 2)**

- `apps/desktop/src-tauri/Cargo.toml` — `printpdf`
- `apps/desktop/src-tauri/src/commands/reports.rs` *(new)*, `commands/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs` — `invoke_handler`, plus `view.go-analytics` in the native menu and `CUSTOM_IDS`

**Docs**

- `features/help/components/docs/sections/reports.tsx` (rewritten), `sections/analytics.tsx` *(new)*, `docs-toc.tsx`, `sections/dispensing.tsx` (stale CSV mention)
- `docs/specs/pack-size-handling.md` (§10 path list)

---

## 9. Verification

**Automated (D27)**

- `pnpm check-types` clean; `pnpm test:frontend` green; `pnpm dlx ultracite check` clean (then `fix`).
- New unit coverage, at minimum:
  - `buildStockSummary` — totals across categories, low/out counts matching `classifyLowStock`, expiry band counts counting a multi-batch medicine once per band, empty input returning zeros;
  - month activity — a month with neither inbound nor outbound yields dashes, a month with only inbound yields `0` dispensed (not a dash), an inbound-only day still counts;
  - `groupByCategory` — alphabetical ordering, blank category last, search narrowing groups, per-group subtotals and the grand total summing to the summary figures;
  - the as-of label formatting;
  - `StockLevelRow` mapping for the new columns, including the em-dash degradations (blank expiry, unset pack pair, blank strength) — mirroring `stock-level-rows.test.ts` fixtures.
- A guard test that the reports page no longer imports the deleted modules or renders Import/Export CSV/Export PDF labels.

**Manual, in `pnpm desktop:dev`**

1. Reports opens on the current month; the summary shows totals, health counts and this month's in/out.
2. Step back a month with activity: in/out change, stock figures and the table do not.
3. Step to a month with no activity: both month figures read —.
4. Filter to one category: summary figures, group list and the document header all narrow; the header names the category.
5. Search a partial SKU: groups empty out, per-group counts drop, the grand total follows.
6. Sort by On hand: order changes within each group only; group order stays alphabetical.
7. A medicine at 0 units appears in its own category group, not in a trailing bucket.
8. A medicine with a `10/box` pack shows `50` in On hand and `50 tablet (5 box)` in Pack hint; one with no pack shows a plain number and an em dash.
9. Print: the preview has no sidebar, no sticky bar, no scroll cutoff — every category and the grand total are present, headers repeat.
10. Save as PDF: a file appears in Documents named `cmis-stock-report-2026-09-<timestamp>.pdf`, the toast shows the path, and the reveal action opens the folder; opening the PDF shows A4 landscape, the context header, subtotals and `Page 1 of N`.
11. Disconnect/deny the Documents write (or point the path at an unwritable location in a test build): the toast reports an error, not a success.
12. `/admin/analytics` renders all six widgets with working presets and category filter, and no import/export controls anywhere on it.
13. Sidebar, header, palette and the macOS View menu all read **Stock Report** / **Analytics** consistently, and both routes deep-link correctly.

---

## 10. Phase plan

| Phase | Contents | Done when |
|-------|----------|-----------|
| **1** | Page rebuilt (summary, month picker, grouped table, subtotals, empty states), import/export removed, widgets relocated to `/admin/analytics` with nav + menu wiring, print stylesheet, Print button, help docs, unit tests | Verification items 1–9, 12–13 pass; no reference to the deleted modules remains |
| **2** | `printpdf`, the Rust command, the payload contract, Documents save + reveal, PDF button | Verification items 10–11 pass; the PDF matches the document contents in F8 |

Phase 1 must leave no half-wired PDF button: the `Save as PDF` control ships in Phase 2, not as a placeholder earlier.

---

## 11. Open questions and risks

1. **Facility name.** There is no facility/branch setting — only the dispensing log's `"Local"` default literal. The document header will print that literal unless a setting is added. Decision needed if the report is to carry a clinic name; the recommendation is to ship with `Local` and treat a facility setting as a separate small change.
2. **Page numbers in the system print path.** CSS cannot force "Page N of M" into a Chromium print job; only the PDF can draw it (F8). If numbered paper copies matter more than the print dialog's convenience, the Print button could be dropped in favour of PDF-only.
3. **Grouped groups versus the sticky header.** Per-group capped scrollers (F5) keep long categories readable on screen but complicate the print lift; the implementation may prefer one page-level scroll with sticky group headers inside it. Resolve during implementation, keep the print behaviour identical either way.
4. **`StockLevelSortKey` and the Category column.** With grouping by category (D7) and the category column effectively carried by group headers, keeping a sortable Category header is redundant. The recommendation is to drop the column from the table but keep categories matchable by search, and drop `"category"` from the sort key.
5. **Analytics is untouched functionally** but inherits SL11 (the ignored category argument in the expiry query). Fixing it changes visible behaviour on the moved page — worth confirming rather than slipping in silently.
6. **`printpdf` is a new dependency** in a signed desktop app; it is pure Rust with no system libraries, but it should still be checked against the Windows signing/build pipeline (`docs/windows-signing.md`) before Phase 2 is considered done.
7. **`AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx`** and the existing import tests are untouched by this change; the round-trip guarantees in `pack-size-handling.md` must still pass, which is why the pack hint keeps using `describeQuantity` rather than a new formatter.
