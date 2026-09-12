# CMIS UI/UX Spec — 04 Low-Stock Alerts

Spec ID: CMIS-UI-04 | Routes: `/staff/inventory/low-stock` · `/admin/inventory/low-stock` | Depends on: 00, 02, 03

---

## 1. Purpose & Distinction From Expiry

Expiry is _time_ risk; low-stock is _availability_ risk. Staff response is procurement, not disposal. This screen must make **threshold gap** the primary signal (how far below threshold) and make **reorder** the fastest action.

Expiry (03) and low-stock share table patterns intentionally (Familiarity: same filter bar placement, same row heights, same density toggle) — but their _accent encoding_ differs: expiry uses a left-edge time bar; low-stock uses a **quantity bar** (fill proportional to `current/threshold`).

---

## 2. Layout Options & Recommendation

| Option                                                | Structure                                                                                                                                                                                                                                                                  | Trade-offs                                                                                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Same table structure as expiry (spec original)** | Item / SKU / Current Qty / Threshold / Status / Supplier; filters date/branch/status; row actions Reorder/View/Adjust                                                                                                                                                      | + Mirrors expiry — zero learning cost. − Gap not visualized; Staff must mentally compare two numbers (Qty vs Threshold) under counter pressure              |
| **B. Card grid with gap meter**                       | Cards showing large gap number + mini bar + reorder CTA                                                                                                                                                                                                                    | + Immediate gap reading; friendly. − Scans fewer items per viewport; Staff loses tabular comparison                                                         |
| **C. Table with gap visualization (RECOMMENDED)**     | **A + inline quantity bar:** Current Qty cell contains a segmented bar (fill = `min(100%, current/threshold *100%)`) behind the number, colored by status. New column "Gap" shows `threshold - current` (or "Out" if 0). Card grid is the _narrow-window fallback_ (<900). | + Table efficiency + at-a-glance gap without leaving the row; aligns with expiry's pattern language (edge visualization) but encodes a different dimension. |

**Chosen layout:**

```
Item        SKU     Current (bar)      Threshold  Gap    Status        Supplier   Action
Paracetamol SKU-001 ▓▓▓░░  8 / 20        20       -12   ● Low Stock   PharmaCorp [Reorder][Adjust][…]
Amoxicillin SKU-002 ░░░░  0 / 15         15       Out   ● Out of Stock MediSupply[Reorder][Adjust][…]  ← red bar, 0% fill
Ibuprofen   SKU-003 ▓▓▓▓  45 / 30        30       +15   ○ In Stock    PharmaCorp [View]               ← hidden unless "All"
```

### 2.1 Status Taxonomy

| Status                 | Condition                 | Bar                                    | Badge                                |
| ---------------------- | ------------------------- | -------------------------------------- | ------------------------------------ |
| **Out of Stock**       | `current === 0`           | Red 0% fill, red left edge (4px)       | `destructive` "Out"                  |
| **Low Stock**          | `0 < current < threshold` | Orange fill proportional, amber edge   | warning "Low"                        |
| **In Stock**           | `current ≥ threshold`     | Neutral gray full fill (or hidden)     | muted "OK" — filtered out by default |
| **Overstock** (future) | `current ≥ threshold * 2` | Blue accent (optional, low saturation) | info — hidden by default             |

**Default view:** only Out + Low (actionable). Toggle "Show in-stock" reveals satisfied rows dimmed (`opacity 0.6`).

---

## 3. Components & Actions

### 3.1 Row Actions

| Action                | Behavior                                                                                                                                                                      | Confirmation                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Reorder** (primary) | Opens reorder sheet/modal: prefilled Item, Supplier, Suggested qty = `max(threshold*2 - current, threshold)` (cover to 2× threshold), notes. Calls existing procurement flow. | No extra confirm if suggestion accepted — toast "Reorder created: [Item] ×[Qty] via [Supplier]". Validation: supplier required, qty ≥ gap. |
| **Adjust Threshold**  | Inline popover on threshold cell (not separate page): number input + Save/Cancel. Updates per-item threshold; global default remains in Settings (09).                        | Toast "Threshold for [Item]: [old] → [new]". Audit log entry.                                                                              |
| **View**              | Hybrid detail (panel/sheet) with stock history + supplier lead time hint                                                                                                      | —                                                                                                                                          |
| **Bulk reorder**      | Header checkbox selects multiples → "Reorder selected (N)" → single sheet grouped by supplier (1 sheet per supplier)                                                          | Per-supplier grouped confirm — prevents mixing suppliers in one PO                                                                         |

### 3.2 Supplier Hint

Supplier cell shows name + lead time (if configured) as `caption` under name: "PharmaCorp · ~3 days" — helps Staff prioritize which low-stock to reorder first (Simplicity: adds context where decision happens).

### 3.3 Filter Bar (Same Position/Pattern as 03)

| Control      | Type                                   |
| ------------ | -------------------------------------- |
| Stock status | Segmented: `All                        | Out | Low | In`(default`Low+Out`) |
| Branch       | `DropdownMenu` (Admin: All + branches) |
| Supplier     | `DropdownMenu` (filter by supplier)    |
| Category     | `DropdownMenu`                         |

Active chips + URL persistence (same as 03/02).

---

## 4. Feedback & Wayfinding

| Event              | Feedback                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Login toast        | "2 items low stock" (info, links here) per 00 §5                                                                                      |
| Reorder success    | Success toast + row status updates after reorder logged (bar fills as if stock were on order — optional "On order" badge, muted blue) |
| Threshold adjusted | Toast + row re-evaluates status in place (cross-fade status badge)                                                                    |
| No low stock       | `Empty` + checkmark + "All items are well-stocked."                                                                                   |

Sidebar badge: "Low-Stock Alerts" shows `Out + Low` count — matches toast.

---

## 5. Interactions & Motion

| Interaction                 | Motion                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Threshold popover           | `backdrop-filter` frosted popover scaling from threshold cell origin `damping 1.0/0.25`                     |
| Reorder sheet               | From reorder button origin, blur+scale `1.0/0.30`                                                           |
| Bar fill on qty change      | Width animates via `transform: scaleX()` (compositor), `1.0/0.30` spring — rubber-band not needed (no drag) |
| Bulk select checkbox reveal | Checkboxes fade `opacity 0→1` 120ms when header checked (non-jarring)                                       |

---

## 6. Responsive Behavior

| Width      | Behavior                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `≥1200`    | Full table 7 cols, inline bar visible, detail panel optional                                                 |
| `900–1199` | Supplier hidden (tooltip on row), gap col remains; reorder as primary button, adjust in `⋯`                  |
| `800–899`  | Table → card fallback: each card shows item name + gap bar + status + [Reorder] full-width; filter bar wraps |

Card fallback for low-stock is intentional (unlike expiry which keeps table): gap cards make the _shortage_ more scannable than a horizontally scrolled table at 800px.

---

## 7. What This Screen Contains (Checklist)

- [ ] Table: Item / SKU / Current (+ inline bar) / Threshold / Gap / Status / Supplier (+ lead time) (+ bulk checkbox)
- [ ] Segmented status filter default `Low+Out`, supplier/category/branch filters
- [ ] Active chips + URL persistence, minimap not needed (no time dimension — bar is the visualization)
- [ ] Reorder sheet (FEFO-naive — no batch; procurement qty suggestion)
- [ ] Adjust Threshold popover + audit log
- [ ] Card fallback at 800–899
- [ ] Empty "All well-stocked" + toast linkage, sidebar badge parity

---

## 8. Relation to 03 Expiry — Deliberate Divergence

| Pattern                              | Shared                             | Divergent                                                         | Why                                                                                     |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Filter bar, density, table mechanics | Yes — identical placement/behavior | —                                                                 | Familiarity: same muscle memory                                                         |
| Urgency visualization                | Edge bar in both                   | Expiry: time bar on date col. Low-stock: fill bar on qty col      | Different risk dimension — mapping (§16) encodes the right variable where the eye rests |
| Bulk action                          | Both have bulk                     | Expiry: bulk dispose. Low-stock: bulk reorder grouped by supplier | Domain action parity, but grouping logic differs (supplier vs batch)                    |

---

## 9. Trade-offs Summary

| Decision                                    | Why                                                                                 | Sacrifice                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Inline gap bar over mental math             | Counter pressure — Staff must see "-12" vs threshold without subtracting            | Adds ~24px column width — acceptable at 800px min; hidden in card fallback         |
| Reorder suggestion `2× threshold - current` | Prevents just-at-threshold reorder that re-triggers tomorrow; nudges durable buffer | May over-order — Staff can edit suggestion (field is editable)                     |
| Threshold popover inline (not Settings)     | Staff fixes per-item threshold where anomaly is visible (Grouping & mapping §16)    | Risk of Staff changing threshold casually — mitigated by audit log + confirm toast |
| Show in-stock dimmed (toggle)               | Lets Staff verify a false alarm without leaving screen                              | Extra rows — off by default                                                        |
