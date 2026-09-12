# CMIS UI/UX Spec — 03 Expiry Alerts

Spec ID: CMIS-UI-03 | Routes: `/staff/inventory/expiry` · `/admin/inventory/expiry` | Depends on: 00, 02

---

## 1. Purpose & Risk Model

Expiry alerts are _patient-safety critical_ — undetected expired medicine is harm, not waste (Responsibility). This screen must make time-to-expiry the dominant visual signal and make disposal the fastest action.

---

## 2. Layout Options & Recommendation

| Option                                                    | Structure                                                                                                                                                                                                                                                                                   | Trade-offs                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Filterable table (spec original)**                   | Columns: Item / SKU / Batch / Expiry / Qty / Status; date range + branch + status filters; row actions Dispose/Extend/View                                                                                                                                                                  | + Scannable, familiar for Staff/Admin; sortable by expiry. − At risk of looking like generic CRUD; urgency not visually dominant         |
| **B. Timeline / Gantt grouped by expiry month**           | Horizontal timeline, items as bars placed by expiry month                                                                                                                                                                                                                                   | + Instantly shows "what expires when". − Poor for scanning SKUs/batches; wastes vertical space; weak for action (Dispose per row harder) |
| **C. Table with time-gradient enhancement (RECOMMENDED)** | **A + clinical-grade hierarchy:** expiry date column uses a left-edge time bar (4px) colored by urgency, plus badge + relative "in X days / expired X days ago". Table is primary; an optional condensed timeline strip (24px height) above table shows monthly bucket counts as a minimap. | + Keeps table efficiency + adds at-a-glance urgency without sacrificing scannability; minimap is glanceable context, not primary nav.    |

**Chosen layout:**

```
[Date range ▼] [Branch ▼] [Status: All | Expired | Expiring Soon | Later]
[════════════ timeline minimap: Jan ███  Feb █  Mar ██  ...  (click to filter) ═══]

▌ Paracetamol  SKU-001  B-2026-04  Dec 01, 2026 (in 80d)  120  ● Expiring Later  [Dispose][Extend][…]
▌ Amoxicillin  SKU-002  B-2025-11  Nov 28, 2026 (in 16d)   8  ● Expiring Soon   [Dispose][Extend][…]  ← orange bar
▌ Ibuprofen    SKU-003  B-2025-09  Sep 01, 2026 (expired 11d) 0 ● Expired       [Dispose][View][…]  ← red bar
```

### 2.1 Status Taxonomy & Color Encoding

| Status             | Window       | Bar + badge                                                        | Accessibility                        |
| ------------------ | ------------ | ------------------------------------------------------------------ | ------------------------------------ |
| **Expired**        | `< today`    | Red bar `#E53E3E` + `destructive` badge + icon `AlertTriangle`     | Color + text "Expired" + icon        |
| **Expiring Soon**  | `≤30 days`   | Orange bar `#ED8936` + warning badge + icon `Clock`                | Color + text "Expiring Soon (in Nd)" |
| **Expiring Later** | `31–90 days` | Yellow bar `#ECC94B` + muted badge                                 | Yellow never alone — text qualifies  |
| **Safe**           | `>90 days`   | No bar, neutral row (not shown by default — filter "Later" to see) | —                                    |

**Global thresholds are configurable** in Admin Settings (see 09) — 30/90 are defaults; UI reflects whatever threshold is active (badge count + minimap buckets recompute).

**Empty values:** expiry missing → "—" + amber warning inline ("Expiry not set — batch needs date") — never blank.

---

## 3. Components & Filters

- **Sort default:** Expiry ascending (soonest first) — safety ordering beats alphabetical (Purpose). User can resort by Name/Qty but reset returns to expiry-asc.
- **Row height:** 44/56 per density toggle (inherits from 02 table).
- **Actions per row:**

| Action      | When                    | Style                                | Confirmation                                                                                                                                       |
| ----------- | ----------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dispose** | Always                  | `destructive` ghost → solid on hover | Modal confirm: "Dispose [Qty] × [Item] batch [Batch]?" + reason (Expired/Damaged/Other) + quantity must match row's qty (prevents accidental bulk) |
| **Extend**  | Only if batch re-tested | `secondary`                          | Modal: new expiry `DatePicker` + note required + audit log "Expiry extended by [Staff] from [old] to [new]"                                        |
| **View**    | Always                  | ghost                                | Opens hybrid detail (panel ≥1200 / sheet <1200) with full batch history                                                                            |

- **Bulk:** header checkbox + "Dispose selected (N)" appears when ≥1 selected. Bulk dispose requires single confirmation listing all batches — destructive batch must be explicit.

### 3.1 Filter Bar (Sticky Under Header, Same Translucent Layer as Inventory)

| Control    | Type                                                           | Behavior                                                                                     |
| ---------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Date range | Presets (Next 30d, 30–90d, Expired, All) + custom `DatePicker` | Presets set both status filter + date window together (Familiarity: one control, one intent) |
| Branch     | `DropdownMenu`                                                 | Admin sees All + each branch; Staff sees assigned only (disabled)                            |
| Status     | Segmented: `All                                                | Expired                                                                                      | Soon | Later` | Chip-ifies into active filter pills below bar; "Clear all" resets |

Filter state persists in URL (bookmarkable) and in `tauri-plugin-store` per role.

### 3.2 Timeline Minimap (Optional Strip)

- 24px height, 12 monthly buckets from current month outward.
- Bar height = count of items expiring that month (relative). Clicking a bucket filters table to that month.
- Not a navigation replacement — secondary context (Simplicity: show common path first — table — advanced context one level deeper).

---

## 4. Feedback & Wayfinding

| Event               | Feedback                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Login summary toast | "3 items expiring within 30 days" (info toast per 00 §5) — links to this screen                                                             |
| Row dispose success | Success toast "Disposed: [Item] batch [Batch] ×[Qty]" + row removal with `opacity 0→ cross-fade 150ms` (not slide — row leaves the dataset) |
| No items expiring   | `Empty` + checkmark + "No items expiring soon. All clear!" — positive confirmation, not absence                                             |

Sidebar badge: "Expiry Alerts" nav item shows count of **Expired + Expiring Soon** (not Later) — matches toast count; consistency §1 via same query.

---

## 5. Interactions & Motion

| Interaction                   | Motion                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| Table row hover action reveal | `opacity 0→1` 120ms on actions cell                                                                    |
| Filter chip dismiss           | Scale `1→0.85` + opacity, 140ms, then list cross-fades filtered                                        |
| Dispose confirm modal         | Dim scrim + scale 0.98→1 `damping 1.0/0.30`, anchored to row's dispose button (§7 spatial consistency) |
| Minimap bucket click          | Filter bar spring highlight + table rows cross-fade to new set                                         |
| Density toggle                | Row height spring `1.0/0.25` (compositor)                                                              |

Reduced-motion: all row reveals become opacity only; modal becomes cross-fade.

---

## 6. Responsive Behavior

| Width      | Behavior                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| `≥1200`    | Full table 6 cols, minimap visible, detail panel option on row View                         |
| `900–1199` | SKU hidden (tooltip on name), minimap collapses to 6 buckets, actions as `⋯` menu           |
| `800–899`  | Horizontal scroll for table (sticky Name col), minimap hidden behind "Show timeline" toggle |

---

## 7. What This Screen Contains (Checklist)

- [ ] Table: Item / SKU / Batch / Expiry (+ relative) / Qty / Status (bar+icon+text)
- [ ] Default sort expiry-asc, filter bar sticky translucent (date preset + branch + status segments)
- [ ] Active filter chips + "Clear all" + URL persistence
- [ ] Timeline minimap (24px) with bucket filtering
- [ ] Row actions Dispose/Extend/View (+ bulk dispose)
- [ ] Empty "All clear" + login toast link
- [ ] Density-aware rows, palette entry "Go to Expiry"

---

## 8. Trade-offs Summary

| Decision                                      | Why                                                                           | Sacrifice                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Table + minimap over full Gantt               | Scanning SKUs/batches is the job; Gantt loses action ergonomics               | Timeline is less immersive — correct for a safety table, not a marketing view                    |
| Status bar on expiry col (not whole row tint) | Whole-row red is alarm fatigue; edge bar is scannable without washing the row | Slightly less "at a glance" than row tint — compensated by badge + icon pairing                  |
| 30/90 defaults configurable (not hard-coded)  | Different medicines have different shelf lives; Admin Agency                  | One more setting to document — placed in Settings → Alert Thresholds (09) with sensible defaults |
