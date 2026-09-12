# CMIS UI/UX Spec — 06 Dispensing Log

Spec ID: CMIS-UI-06 | Routes: `/staff/dispensing` · `/admin/dispensing` | Depends on: 00, 02, 05

---

## 1. Purpose & Relationship

Dispensing Log is the _audit-compliant history_ of every claim (Viewer-requested + direct Staff stock-out dispensed). It's read-heavy, export-dependent, and legally significant — unlike Kanban (action-oriented) or Inventory (operational), this screen optimizes for **searchability + traceability**.

It also houses **Denied** requests that exited Kanban (status "Denied" rows here) — providing continuity (§5 Denied handling).

---

## 2. Layout Options & Recommendation

| Option                                                               | Structure                                                                                                                                                                                                                                                                                                                                          | Trade-offs                                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Filterable sortable table (spec original)**                     | Columns: Date / Medicine / Batch# / Qty / Requestor / Staff / Request Link; filters date/medicine/staff/requestor/branch; CSV/PDF export                                                                                                                                                                                                           | + Precise, sort-by-date natural; audit reviewers expect tables. − No spatial summary of recent dispensing without scanning rows               |
| **B. Activity feed + table hybrid**                                  | Top strip: last 10 dispenses as feed; below: full table                                                                                                                                                                                                                                                                                            | + Quick recent glance. − Duplicates Home's activity; adds chrome that doesn't help audit search                                               |
| **C. Table with sticky filter bar + request drill-in (RECOMMENDED)** | **A +:** row click opens the same Request Detail modal as Kanban (anchored to row origin), so audit trail is one click away (§12 Dim to focus? No — this is parallel context, so sheet/modal _without_ deep dim? Correction: audit review is a focused task → dim scrim is correct per §12 Dim to focus). Export controls in header of table card. | + Keeps table purity + one-click traceability to requestor record (linked per CMIS-02 dispensing log requirement). No extra feed duplication. |

**Chosen layout:**

```
[Date range ▼] [Medicine ▼] [Staff ▼] [Requestor search] [Branch ▼]     [Export CSV][Export PDF]
┌──────────────────────────────────────────────────────────────────────────┐
│ Date       │ Medicine           │ Batch  │ Qty │ Requestor    │ Staff   │ Req Link │
│ Sep 12 2:30│ Paracetamol 500mg  │B-2026-04│ 2  │ Maria S. STU │Joy Nurse│ #RQ-0831 → │
│ Sep 12 1:15│ Amoxicillin 250mg  │B-2025-11│10  │ John D. STU  │Joy Nurse│ —         │ ← direct dispense
│ Sep 11 ... │ …                  │ …      │ …  │ …            │ …       │ …        │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Column Specifics

| Column       | Width priority | Notes                                                                                        |
| ------------ | -------------- | -------------------------------------------------------------------------------------------- |
| Date         | Fixed 140px    | `MMM DD, h:mm A` + relative tooltip on hover; sortable (default desc)                        |
| Medicine     | Flex 1.5       | Name + SKU in caption under name                                                             |
| Batch#       | 110px          | Mono `0.8125rem`; copy-on-click                                                              |
| Qty          | 60px           | Integer, right-aligned                                                                       |
| Requestor    | 150px          | Name + ID caption; link to Viewer record where allowed (Admin/Staff)                         |
| Staff        | 120px          | Who dispensed — critical for audit                                                           |
| Request Link | 90px           | Clickable `#RQ-xxxx` → Request Detail modal; `—` for direct stock-out dispenses (no request) |

**Denied rows:** same columns, `destructive` muted row tint + status "Denied" via `Marker` in Medicine cell; Request Link present; Staff is denier.

---

## 3. Filters & Query Model

| Control    | Type                                              | Behavior                                            |
| ---------- | ------------------------------------------------- | --------------------------------------------------- |
| Date range | Presets Last 7/30/90d / All + custom `DatePicker` | Indexed on `dispensed_at` — most common audit query |
| Medicine   | Searchable `DropdownMenu` (type-ahead)            | Filters by medicine ID                              |
| Staff      | `DropdownMenu` (Staff/Admin list)                 | Admin sees all; Staff sees self + "All"             |
| Requestor  | Text input (name/ID)                              | Matches requestor record                            |
| Branch     | `DropdownMenu`                                    | Admin only                                          |
| Status     | Segmented `All                                    | Dispensed                                           | Denied` | Default `All` (audit completeness) |

- **Active chips** + URL persistence (consistent with 02/03/04/05).
- **Search:** free-text across Medicine/Batch/Requestor falls back to filtered rows with highlight.
- **Palette:** "Search dispensing: paracetamol last week" as palette query alias.

---

## 4. Interactions

| Interaction    | Behavior                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row click      | Opens Request Detail modal from row origin (`damping 1.0/0.30` blur+scale, §7). If direct dispense (no request), opens direct-detail sheet showing batch/notes/staff without requestor section. |
| Export CSV/PDF | Header buttons → dialog: select visible vs all filtered vs date-bounded; CSV streams rows; PDF paginates with header/footer (report-grade). Buttons disabled with skeleton when no rows.        |
| Sort           | Click header; default Date desc. Secondary sort is Medicine asc when Date ties.                                                                                                                 |
| Copy Batch#    | Click cell → toast "Copied B-2026-04" (`sonner`).                                                                                                                                               |

**No inline editing.** Past dispensing records are immutable except via Admin override (Audit → correction) — Responsibility: prevent silent audit tampering.

---

## 5. Information Hierarchy & Empty States

| State                  | Display                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| No dispensing yet      | `Empty` + "No dispensing records yet. Claims from the Request Queue will appear here." |
| No matches for filters | "No records match filters." + "Clear filters"                                          |
| Loading                | `Skeleton` rows matching density                                                       |
| Export generating      | Button shows spinner + "Generating…", progress bar if >2s                              |

---

## 6. Responsive Behavior

| Width      | Behavior                                                                       |
| ---------- | ------------------------------------------------------------------------------ |
| `≥1200`    | Full 7 cols, no truncation                                                     |
| `900–1199` | Batch hidden (tooltip), Staff hidden (avatar + tooltip)                        |
| `800–899`  | Table horizontally scrolls with sticky Date+Medicine cols; filters wrap 2 rows |

---

## 7. What This Screen Contains (Checklist)

- [ ] Table 7 cols (Date / Medicine / Batch / Qty / Requestor / Staff / Req Link) with sortable Date desc default
- [ ] Filter bar sticky translucent (date preset + medicine + staff + requestor + branch + status segments) + chips + URL
- [ ] Row → Request Detail modal (anchored) vs direct-detail sheet branch
- [ ] Export CSV/PDF with scope dialog + progress
- [ ] Denied rows styling + immutability note
- [ ] Density-aware rows + skeleton
- [ ] Palette search alias

---

## 8. Trade-offs Summary

| Decision                                | Why                                                                                                 | Sacrifice                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| No activity feed above table            | Home already has activity; audit needs search, not recency strip — Simplicity                       | Loses quick glance — offset by default Date-desc sort showing most recent top              |
| Modal detail from row (not split panel) | Audit review is focused task → dim scrim appropriate (§12); split would compete with filter context | Requires close to return — acceptable for audit linear flow                                |
| Immutability (no inline edit)           | Audit integrity; edits create audit log correction entries, not silent cell changes                 | Staff can't fix typo quickly — Admin override path documented in 09 Audit/Audit correction |
