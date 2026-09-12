# CMIS UI/UX Spec — 02 Inventory Management (Stock List + Detail + Stock In/Out)

Spec ID: CMIS-UI-02 | Routes: `/staff/inventory` · `/admin/inventory` | Depends on: 00 Overview

---

## 1. Purpose & User Model

Inventory is the Staff/Admin _workbench_ — 70% of session time. It must answer two questions simultaneously: "Where is everything?" (list scanning) and "What about this one?" (detail). Single-question designs (full table → full page) force context loss and slow comparison.

---

## 2. Layout Options & Recommendation

### 2.1 Structural Alternatives

| Option                                                               | Structure                                                                                             | Trade-offs                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Resizable split 40/60 (spec original)**                         | List left (40–60%), detail right (40–60%), draggable divider, ratio persisted                         | + Simultaneous scan + inspect; comparison without nav. − At 800px, 40% list = 320px → cramped columns; both panels suffer                                                                                                                |
| **B. Full table → sheet/modal**                                      | Table owns width; row click opens translucent sheet from row origin                                   | + Maximum columns visible; sheet's origin-anchored motion (§7) is delightful. − Loses comparison (detail replaces list context); extra tap to return                                                                                     |
| **C. Hybrid split + sheet fallback (RECOMMENDED, interview choice)** | **Split at `≥1200px` (A); auto-collapses to B at `<1200px`.** Breakpoint is layout, not user setting. | + Both strengths, no manual mode switch; desktop-only means this heuristic is predictable. − Implementation: two detail render paths — mitigated by sharing the same `<InventoryDetail>` component (different container: panel vs sheet) |

**Breakpoint rationale:** 1200px is where 40% list (480px) still shows 5 columns (Name, SKU, Category, Qty, Status) without horizontal scroll. Below that, horizontal scroll + cramped detail is worse than a sheet.

```
≥1200px:  ┌──────────────┬────────────────────┐
          │ List 40-60%  │ Detail 40-60%      │  ← draggable divider, 12px hit
          └──────────────┴────────────────────┘

<1200px:  ┌─────────────────────────────────┐
          │ List 100% (full table)           │  ← row tap → sheet from row
          └─────────────────────────────────┘
               sheet slides from row (§7) ──→
```

### 2.2 List Panel Anatomy (Both Modes)

```
┌─────────────────────────────────────────────┐
│ [🔍 Search by name/SKU/batch]  [Scan icon] │  ← always-on barcode input (§3)
│ [Category ▼] [Status ▼] [Branch ▼] [Sort]  │  ← filter bar, sticky under header
├─────────────────────────────────────────────┤
│ Name        │ SKU   │ Cat │ Qty │ Status   │  ← sortable headers, 44/56px rows
│ Paracetamol │ SKU-1 │ Anl │ 120 │ ● In     │  ← selected row: accent background + ring
│ Amoxicillin │ SKU-2 │ Ant │  8  │ ● Low    │
│ Ibuprofen   │ SKU-3 │ Anl │  0  │ ○ Out    │
│ ... virtualized rows (TanStack Virtual)     │
└─────────────────────────────────────────────┘
```

**Filter bar:** sticky under translucent header (content scrolls under header, then under this bar — stacked translucent layers). Uses `DropdownMenu` for categories, segmented toggle for Status (All / In / Low / Out / Expiring). Active filters as removable chips below bar (Agency: easy undo).

**Search:** real-time as-you-type, debounced 150ms, searches name/SKU/batch. Clear `✕` appears when populated. Empty hint preserved ("Search medicine, SKU, batch…").

**Sorting:** column header click. One column at a time (clinical predictability — multi-sort hides intent). Sort indicator is a chevron with `aria-sort`.

**Density impact:**

| Density     | Row height | Visible rows (600px viewport) |
| ----------- | ---------- | ----------------------------- |
| Compact     | 44px       | ~11 rows                      |
| Comfortable | 56px       | ~8 rows                       |

### 2.3 Detail Panel / Sheet Content

```
Detail (panel or sheet)
┌─────────────────────────────────────────┐
│ Paracetamol 500mg — Analgesic            │  heading, -0.01em tracking
│ SKU: SKU-001  ·  Batch: B-2026-04  · Branch: Main
│ Expiry: Dec 01, 2026 (248 days)  Qty: 120
│ Supplier: PharmaCorp                     │
├─────────────────────────────────────────┤
│ [Stock In] [Stock Out] [Edit] [History] │  action row, primary: Stock actions
├─────────────────────────────────────────┤
│ Dispensing history (last 10 for this item)
│ Date       │ Qty │ Requestor │ Staff     │
│ Sep 10     │  2  │ Maria S.  │ Nurse Joy │
└─────────────────────────────────────────┘
```

- **Panel mode (≥1200):** opaque card, `radius 8px`, divider-driven; focus stays in list unless row selected, then focus moves to detail's first button (Responsibility + Wayfinding).
- **Sheet mode (<1200):** translucent frosted sheet (`--surface-frosted`) entering from the selected row's `getBoundingClientRect()` as `transform-origin` (§7 Spatial consistency). Swipable down-to-close on pointer, with rubber-band resistance (§9).
- **Placeholder when nothing selected:** `Empty` component with dashed border + "Select an item" + arrow hint — never blank.

---

## 3. Barcode/QR Input — Always-On, But Not Dominant

Spec: scan field in form Step 1 _and_ inventory list quick-search. Interview says desktop-only — USB wedge scanner (keyboard input) is the reality.

| Option                                | Trade-offs                                                                                                                                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prominent top bar scan box            | Wastes prime filter space; 95% of sessions don't scan                                                                                                                                                                                                                                  |
| **Compact inline scan (RECOMMENDED)** | Small scan icon-button at right of search input; click expands inline `BarcodeInput` (auto-focused, `placeholder "Scan barcode or type SKU"`). On scan, row highlights + detail opens. Keyboard wedge works even when collapsed (global `keydown` listener with 50ms burst detection). |
| Only inside Stock In wizard           | Staff can't quick-lookup outside wizard — slows ad-hoc verification                                                                                                                                                                                                                    |

**Behavior:** barcode burst = 8+ chars in <100ms → treat as scan, not typing. On match: highlight row + spring detail in. On miss: inline inline message "Not found — Create new item?" with CTA (Familiarity: offer next step, don't dead-end).

---

## 4. Stock In & Stock Out Flows — Modal Wizard (Interview choice)

**Interview:** Modal wizard (numbered steps, explicit Next/Back) over sheet stepper or single-page accordion.

### 4.1 Why Modal Over Sheet/Accordion

| Option                         | Trade-offs                                                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sheet stepper                  | Delightful origin-anchored entry, but sheets imply _parallel_ context (keep list visible). Stock transactions are _interruptive tasks_ that need focus — dim scrim is correct (§12: Dim to focus)                                             |
| Single-page accordion          | Fastest to scroll, but 4 steps on one page hides progress; Staff skips required fields under fold                                                                                                                                             |
| **Modal wizard (RECOMMENDED)** | Centered opaque modal with dim scrim, numbered progress top (1–4), linear Next/Back, inline validation per step (§16: validate inline, not on submit). Best for safety-critical batch/expiry entry where error cost is high (Responsibility). |

### 4.2 Modal Anatomy

```
┌─────────────────────────────────────────────────┐
│ Stock In  — Step 2 of 4    ──●──○──○──○──       [✕] │  progress dots + step label
├─────────────────────────────────────────────────┤
│ Step 2 — Item Details (pre-filled if scanned)   │
│  Item name [________]  (read-only if existing)  │
│  Category [▼ Analgesic]  Unit [▼ tablet]         │
│  Validation: inline under field on blur          │
├─────────────────────────────────────────────────┤
│                        [Back] [Next →]           │
│                        [Cancel]                  │
└─────────────────────────────────────────────────┘
```

**Common to both flows:**

- **Materialize:** blur 0→16 + scale 0.98→1 with `damping 1.0 / 0.30` from the triggering button's rect (§12, §4).
- **Interruptibility:** Escape closes with confirmation if dirty ("Discard changes?"), focus restores to trigger. Background list stays inert (no interaction) — modal is a _task_, not a preview (§12).
- **Sheet fallback at `<1200`:** wizard still modal (centered 560px max), not a bottom sheet — modals remain centered on desktop regardless of table's sheet behavior (consistency: transactional chrome is always modal).

### 4.3 Stock In Steps (4 steps, linear)

| Step               | Fields                                                                                                                         | Prefill                                | Validation                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1. Identify        | `BarcodeInput` (auto-focus) OR `SKU` manual input; lookup button                                                               | If scan hits existing → jump to Step 3 | Required: identifier. Inline "Item not found → Create new" CTA if miss                                             |
| 2. Item Details    | Name (read-only if existing), Category `DropdownMenu`, Unit                                                                    | From lookup if existing                | Name required if new; category required                                                                            |
| 3. Batch Info      | Batch/Lot `Input`, Expiry `DatePicker`, Qty `Input type=number`, Supplier `DropdownMenu` (editable), Notes `Textarea` optional | Supplier defaults to item's last       | All required except notes; expiry must be future; qty ≥1; batch uniqueness warning (not block) if duplicate batch# |
| 4. Review & Submit | Summary card per step, "Confirm Stock In" primary                                                                              | —                                      | Confirm enables only if all steps valid; success toast "Logged: [Item] +[Qty]" + close                             |

### 4.4 Stock Out Steps (5 steps, reason-gated)

| Step                | Fields                                                                                                | Validation                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Identify         | Scan/search (same as Stock In)                                                                        | Must select existing in-stock item                                                                 |
| 2. Reason           | Dropdown: Dispensed / Disposed (expired) / Damaged / Transferred / Other — text area appears if Other | Required; "Disposed (expired)" triggers soft warning confirm ("Expired stock — confirm disposal?") |
| 3. Quantity         | Number input, max = available qty, shows "Available: 120"                                             | Cannot exceed available; if dispensed + linked request, qty prefilled from request                 |
| 4. Notes            | Optional textarea                                                                                     | —                                                                                                  |
| 5. Review & Confirm | Summary + "Confirm Stock Out"                                                                         | Block if insufficient; on confirm toast "Dispensed: [Item] –[Qty]"                                 |

**Batch selection on dispense:** if item has multiple batches, show dropdown sorted by nearest expiry first (FEFO) — default selection is the earliest-expiring batch with sufficient qty (Responsibility: reduce expiry waste).

---

## 5. Information Hierarchy & Empty States

| State                  | Display                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| No items match filters | `Empty` + "No medicine matches — try different filters" + "Clear filters"     |
| No items at all        | `Empty` + illustration + "Add your first item" CTA (links to Stock In Step 1) |
| Detail no selection    | Dashed placeholder card + "Select an item to view details"                    |
| List loading           | `Skeleton` rows (44px) matching density; header filters shimmer               |
| Error (DB)             | Inline banner + retry; focus moves to banner                                  |

**Quantities:** integer, zero in `destructive` red. Dates: `MMM DD, YYYY` + relative-on-hover. Status badges: `Marker` component with `aria-label` + icon + text (never color alone). Expiry status colors defined in 03 spec.

---

## 6. Interactions & Motion

| Interaction          | Behavior                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Row click (detail)   | ≥1200: list row highlights + detail cross-fades 150ms (no slide — same spatial plane). <1200: sheet springs from row origin `damping 1.0 / 0.30` |
| Divider drag         | Direct 1:1 (§2), `setPointerCapture`, persists to `panel-ratio`                                                                                  |
| Divider double-click | Collapse detail (list → 100%); double-click again restores ratio                                                                                 |
| Modal step Next/Back | Slide 12px + opacity 0→1 (short, `150ms ease-out`); direction mirrors (forward right, back left) — spatial consistency §7                        |
| Inline validation    | Field shakes 4px spring `damping 0.6 / 0.25` only on submit attempt, not on blur — delight reserved for error causality (§13)                    |

---

## 7. Responsive Behavior

| Width      | List                                                       | Detail                               | Filters                                      |
| ---------- | ---------------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `≥1200`    | 40–60% split, 5 columns visible                            | Panel 40–60%                         | Single row: search + 3 dropdowns + sort      |
| `900–1199` | 100% sheet-triggered, hides branch filter if single branch | Frosted sheet from row               | Wraps to 2 rows (search full-width)          |
| `800–899`  | Same as above, horizontal table scroll for SKU/category    | Sheet full-width inset (16px margin) | Wraps; active filter chips horizontal scroll |

At minimum 800px, search remains usable (≥280px) and no filter is truncated without an accessible overflow menu.

---

## 8. What This Screen Contains (Checklist)

- [ ] Hybrid split/sheet container switching at 1200px
- [ ] Search + Category/Status/Branch filters + sortable headers
- [ ] Inline BarcodeInput (icon → expand) + global keyboard wedge listener
- [ ] Detail panel (≥1200) and detail sheet (<1200) sharing `<InventoryDetail>`
- [ ] Stock In 4-step modal wizard + Stock Out 5-step modal wizard (dim scrim, progress dots, inline validation, FEFO batch)
- [ ] Empty / loading / error states per §5 of 00 + §5 above
- [ ] Density-aware row heights + skeleton matching
- [ ] Palette action entries: "Stock In", "Stock Out", "Scan item"

---

## 9. Trade-offs Summary

| Decision                 | Why                                                                                                  | Sacrifice                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Hybrid split/sheet       | Both scan+inspect and max columns — desktop-only makes breakpoint deterministic                      | Two detail containers — complexity offset by shared detail component            |
| Modal wizard (not sheet) | Transactional focus; expiry/batch errors are costly — linear + scrim prevents background distraction | Loses list context during entry — acceptable: transaction is modal task per §12 |
| Inline scan (not bar)    | Conserves filter space; scanner still works collapsed via wedge detection                            | Less discoverable — mitigated by persistent scan icon + palette "Scan item"     |
| Single-column sort       | Predictable mental model for clinical staff (Simplicity)                                             | Power users lose multi-sort — edge case justified: 5 columns, rarely needed     |
