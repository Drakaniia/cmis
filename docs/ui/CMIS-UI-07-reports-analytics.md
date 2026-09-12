# CMIS UI/UX Spec — 07 Reports & Analytics

Spec ID: CMIS-UI-07 | Routes: `/staff/reports` · `/admin/reports` | Depends on: 00, 03, 04, 06

---

## 1. Purpose & Persona Split

Reports serves two personas _with the same screen_ (equal-priority choice) — differences are in scope, not layout:

| Persona   | Primary job on Reports                                      | Data scope                                                     |
| --------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| **Staff** | "What moved this week, what will I run out of?"             | Assigned branch, last 90 days, category-filtered               |
| **Admin** | "Are branches compliant, where is waste, what to purchase?" | All branches, selectable horizon (year/custom), branch-compare |

Both need **filters-first** (spec §3.5): a persistent filter bar where every chart/table below updates together — no per-widget filters (Familiarity: one mental model).

---

## 2. Layout Options & Recommendation

| Option                                                                                 | Structure                                                                                                                                                                                                                                                                                                                                                                                               | Trade-offs                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Filters-first dashboard grid (spec original)**                                    | Top: date range + branch + category. Below: 6 widgets in responsive grid (Stock Movement line/bar, Expiry timeline, Usage by Category pie/donut, Dispensed vs Requested bar, Top Dispensed ranked table, Low-Stock Trend line)                                                                                                                                                                          | + Single filter source of truth; widgets comparable. − At 800px, 6 widgets stack long — but that's the report nature                     |
| **B. Tab per insight**                                                                 | Tabs: Movement / Expiry / Usage / Fulfillment / etc.                                                                                                                                                                                                                                                                                                                                                    | + Focus per tab, less scrolling. − Breaks cross-widget comparison; filter state per tab confuses (Agency loss)                           |
| **C. Filters-first hybrid with sticky filters + progressive disclosure (RECOMMENDED)** | **A +:** filter bar is **sticky under translucent header** (stacked material, see 00 §1.2); widgets in CSS grid that respects density toggle (Compact = tighter gaps, more widgets per viewport; Comfortable = airier, larger charts). Top Dispensed is a ranked table (not chart) per original spec — keeping tabular precision where ranking matters. Charts use same `--chart-1..5` tokens as shell. | + Best of A + density awareness + sticky filters prevent re-scroll to change horizon (Utility). Tab alternative's fragmentation avoided. |

**Chosen grid (≥1200 / 900 / 800):**

```
[Filters: Date range (7/30/90/Y/Custom) | Branch (if multi) | Category ▼]  [Export CSV][Export PDF]  ← sticky

┌────────────────────┬────────────────────┐
│ Stock Movement     │ Low-Stock Trend    │  line charts, shared time axis
├────────────────────┼────────────────────┤
│ Expiry Timeline    │ Usage by Category  │  timeline/gantt + donut
├────────────────────┼────────────────────┤
│ Dispensed vs Req'd │ Top Dispensed      │  bar + ranked table (5 rows)
└────────────────────┴────────────────────┘
  Compact: 2 cols ≥900, 1 col at 800. Comfortable: 2 cols ≥1200, 1 col at 900.  ← density dictates breakpoint
```

### 2.1 Per-Widget Notes

| Widget                     | Type                                          | Key decision                                                                                                                            |
| -------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Stock Movement**         | Line (in vs out over time)                    | Two lines, not stacked area — in/out are independent flows; legend interactive (click to isolate). Time axis matches filter horizon.    |
| **Low-Stock Trend**        | Line (count of low-stock items over time)     | Shows system stress trending, not individual items — complements Movement                                                               |
| **Expiry Timeline**        | Horizontal mini-Gantt grouped by expiry month | Bars colored by urgency (red/orange/yellow) matching 03; click bar filters table below (or navigates to 03 with that month pre-applied) |
| **Usage by Category**      | Donut (not pie — center label shows total)    | Donut over pie: center space for total, legend readable. Max 6 slices; remainder as "Other" slice                                       |
| **Dispensed vs Requested** | Grouped bar (per category or per week)        | Shows fulfillment rate; bar group gap wider than bar gap (Gestalt)                                                                      |
| **Top Dispensed**          | Ranked table (5–10 rows)                      | Table not chart — ranking needs precise Qty; rows link to Inventory detail                                                              |

**Chart library trade-off:**

| Library                          | Why / why not                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Recharts                         | Familiar, responsive out-of-box, composable — but bundle ~45kb                                                                               |
| VisX (Airbnb)                    | Lower-level, smaller, more Craft control — more code                                                                                         |
| **Recommended: Recharts for v1** | Fastest to ship, responsive container handles 800px, `chart-1..5` tokens map directly. VisX can replace per-widget if bundle audit flags it. |

Charts animate on data change via opacity cross-fade (150ms), not bar re-grow — avoids vestibular motion on frequent filter changes (§14).

---

## 3. Filters & Exports

**Filter bar (sticky, translucent):** same material/position language as 02/03/04 (Familiarity). Controls:

| Control    | Type                                                                                 | Behavior                                                                        |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Date range | Presets 7/30/90/Y/Custom `DatePicker`                                                | All widgets share this horizon; URL-persisted                                   |
| Branch     | `DropdownMenu` (Admin: All + branches + "Compare" toggle; Staff: assigned, disabled) | "Compare" (Admin) splits line charts by branch (color per branch, `chart-1..5`) |
| Category   | `DropdownMenu`                                                                       | Only categories with data in horizon                                            |

**Exports:**

| Action     | Scope                                                                                                                                           | Format                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Export CSV | All visible widgets' underlying rows (one CSV per widget, zipped)                                                                               | CSV — data-preserving                    |
| Export PDF | Single paginated report: cover (filters summary + timestamp), each widget as static chart image + table, footer "Generated by [user] on [date]" | PDF — presentation for university filing |

Export buttons disable with spinner when no data.

---

## 4. Information Hierarchy & Empty States

| State                              | Display                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| No data in horizon                 | `Empty` + "Not enough data to generate reports. Start logging stock movements or widen date range." + [Widen range] button                            |
| One widget empty, others have data | Empty illustration _inside that widget's card_ (not board-wide) — card stays, explains why (e.g., "No dispenses in category 'Antibiotics' this week") |
| Loading                            | Per-widget `Skeleton` (chart skeleton: 3 bars shimmer) matching card size — prevents layout shift                                                     |
| Offline                            | Filter bar shows offline dot + banner "Reports reflect local cache as of [time]"; charts dim `opacity 0.6` with "Sync pending" caption                |

---

## 5. Interactions & Motion

| Interaction                   | Motion                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Filter change → charts update | Each widget cross-fades `opacity 1→0.4→1` 180ms; no bar spring growth                                                             |
| Date preset click             | Chip springs `scale 1.02` 120ms on active preset                                                                                  |
| Legend click (isolate series) | Series fades in/out `opacity`, not removal — preserves axis                                                                       |
| Density toggle                | Grid gap animates via `transform` on gap shim (compositor), charts resize via `ResponsiveContainer` debounce 100ms (avoid thrash) |

**Reduced motion:** disable legend fade; swap to instant opacity per §14.

---

## 6. Responsive Behavior

| Width                 | Behavior                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `≥1200` (Comfortable) | 2-col grid, branch-compare lines distinguishable                                                   |
| `≥900` (Compact)      | 2-col grid even at 900 (Compact packs); Comfortable drops to 1-col at 900                          |
| `800–899`             | 1-col stack, filter bar wraps 2 rows, donut center label hides, Expiry Gantt collapses to 6 months |

Minimum Tauri width 800px guarantees no widget narrower than 368px (800 - sidebar 240 - padding 32) — chart axis labels truncate with tooltip if needed.

---

## 7. What This Screen Contains (Checklist)

- [ ] Sticky filter bar (date presets + custom + branch + category) + Export CSV/PDF header
- [ ] 6 widgets: Movement line, Low-Stock Trend line, Expiry Gantt, Usage donut, Dispensed-vs-Requested bar, Top Dispensed ranked table (2-col grid, density-aware breakpoints)
- [ ] Recharts `ResponsiveContainer` per widget, `chart-1..5` tokens, legend isolate
- [ ] Per-widget empty skeleton + empty "no data" card state
- [ ] Cross-fade on filter change (not spring growth), offline dim
- [ ] URL persistence + branch-compare (Admin) + click-through to 03/navigable
- [ ] Palette entries: "Open Reports", "Reports: last 30 days", per-widget deep links

---

## 8. Trade-offs Summary

| Decision                                         | Why                                                                                | Sacrifice                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Filters-first single bar over per-widget filters | One source of truth — Purpose: answer "what happened _in this period_?" coherently | Can't compare two periods side-by-side in one view — deferred to future "Compare periods" toggle (out of scope) |
| Ranked table for Top Dispensed (not chart)       | Ranking is precise Qty comparison — bars lose ordinal clarity at low deltas        | Less visual delight than bar — but data table is the right tool per Simplicity (not minimalism)                 |
| Cross-fade not spring-grow for chart updates     | Frequent filter changes — spring bars would create vestibular churn (§14)          | Less playful — correct: Reports is analytical, not delightful (§16 Delight is earned restraint)                 |
| Recharts v1 over VisX                            | Ship speed + responsive guarantees                                                 | Larger bundle — reclaim via code-split (`React.lazy` on this route, which is not the default landing)           |
