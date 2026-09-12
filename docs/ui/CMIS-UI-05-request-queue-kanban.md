# CMIS UI/UX Spec — 05 Request Queue (Kanban Board)

Spec ID: CMIS-UI-05 | Routes: `/staff/requests` · `/admin/requests` | Depends on: 00 Overview | **Critical-path interaction**

> This is the most Apple-design-intensive screen in CMIS — the only place where direct manipulation, velocity handoff, momentum projection, interruptibility, and rubber-banding all converge. All other specs defer to this one for Kanban drag physics.

Interview choices applied: Full fluid motion · Drag-primary with menu fallback · Command palette dominant · Hybrid chrome.

---

## 1. Purpose & Flow Position

Viewer request → this board → dispensing. The board is the Staff/Admin _primary workspace_ for claim fulfillment. Columns represent the **fulfillment state machine:**

```
Pending → Approved → Ready to Claim → Claimed
  ↕         ↕             ↕
            └────→ Denied (collapsed column, re-openable)
```

- **Pending:** new requests awaiting review (yellow badge).
- **Approved:** approved, item being located/prepared (blue).
- **Ready to Claim:** prepared at counter, Viewer notified (green).
- **Claimed:** medicine claimed, dispensing record created (gray, auto-archive 24h).
- **Denied:** collapsed far-right, expandable; separate from main flow (see §7).

Free bidirectional movement between adjacent columns is allowed (spec §3.3.1) with two forbidden transitions enforced: `Claimed → Denied` and `Denied → Claimed` (see §4.2).

---

## 2. Layout Options & Recommendation

| Option                                                       | Structure                                                                                                                                                                                                           | Trade-offs                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Kanban 4+1 columns (spec original)**                    | Horizontal columns, compact cards (48–52px), filter bar above, batch toolbar below when selected                                                                                                                    | + Tactile, state obvious at a glance; drag matches mental model "move request along". − Horizontal scroll at 800px; column width pressure                                                                                                     |
| **B. Single filtered table + detail modal**                  | Table with Status column + status filter, click row for detail, change status via modal dropdown                                                                                                                    | + Dense, sortable, no horizontal scroll. − Status transitions are abstract (dropdown vs spatial); audit reasoning ("why did you drag back?") loses spatial narrative; less delightful                                                         |
| **C. Kanban with horizontal scroll + minimap (RECOMMENDED)** | **A +:** columns scroll horizontally with **rubber-banded edges** (§9); active column indicator (underlined tab bar) syncs to scroll position; filter bar stays sticky above board within translucent header layer. | + Keeps spatial metaphor (requests travel right) — Familiarity §16: things that move together are perceived together; horizontal momentum feels right (§6). Minimap/indicator solves narrow-window discoverability without abandoning Kanban. |

**Chosen layout (≥1200 vs <1200):**

```
≥1200:  [Filter bar sticky: 🔍 Search | Date ▼ | Branch ▼ | Category ▼ | Requestor]
        ┌─────────────┬─────────────┬────────────────┬────────────┬──────────┐
        │ Pending (3) │ Approved (1)│ Ready (2)      │ Claimed (1)│ Denied(0)│  ← 5 cols fit at ~1100px
        │ [cards]     │ [cards]     │ [cards]        │ [cards]    │ collapsed│ gathers via H-scroll
        └─────────────┴─────────────┴────────────────┴────────────┴──────────┘
        [Batch toolbar when ≥1 selected: "2 selected [Approve][Deny][…][Clear]"]

<1200/800: same but columns overflow → horizontal scroll with snap to column;
          filter bar wraps to 2 rows; columns scroll with rubber-band at edges.
```

Column width: **260px fixed** at ≥1200, **220px** at 800–1199. Card gap 8px. Column scroll is **independent vertical scroll** when overflow (max 3 visible cards + fade mask at bottom).

---

## 3. Card Design — Compact Clinical with Apple Touch

Card is 48–52px, `radius 12px` (chrome, not field), opaque `var(--card)` on translucent board background — never translucent on translucent (00 §1.2).

```
┌─────────────────────────┐  ← selected: accent ring + checked checkbox
│ ☐ Maria S.          2h  │  requestor bold, time caption right
│ Paracetamol 500mg       │  medicine + strength
│ 2 tabs    [→ Pending]   │  qty caption + status micro-badge
│                     [⋯] │  menu trigger bottom-right, 28px hit area
└─────────────────────────┘
```

| Element            | Token / behavior                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Checkbox           | 18px, appears on hover OR when any card selected (Agency: progressive disclosure). Focus ring visible when keyboard focused. |
| Requestor          | `body` weight 600, truncated with tooltip "Maria Santos — STU-2024-0831"                                                     |
| Relative time      | `caption`, `muted-foreground`, right-aligned; live updates via `setInterval` 60s (no motion on tick — text swap only)        |
| Status micro-badge | `caption` 10px, colored dot + text ("Pending") — pairs color+text                                                            |
| ⋯ menu             | `Button ghost` 28px square, opens `DropdownMenu` per spec §3.3.1 menu table                                                  |
| Selected state     | `ring 2px var(--ring)` + checkbox checked + card `background: var(--accent)` subtle                                          |

**Empty column:** dashed border box + `caption` "No pending requests" — never blank (§9 of spec).

---

## 4. Interaction Model — Drag-Primary, Menu Fallback (Interview choice)

### 4.1 Drag-and-Drop — Full Apple Fluid

| Aspect                  | Spec (applied)                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Initiation**          | `pointerdown` on card body (not checkbox/⋯). 10px hysteresis before commit (§10). `setPointerCapture` so card follows even when pointer leaves column. Grab offset respected — card doesn't snap to center (§2 Direct manipulation).                                                 |
| **History**             | Track last 4 `pointermove` position+timestamp pairs for release velocity (§2).                                                                                                                                                                                                       |
| **Visual feedback**     | Dragged card: `opacity 0.82`, `scale 1.02`, `shadow-lg`, `rotate 1.5deg` subtle (hint in gesture direction §8). Valid targets: light blue `bg` + dashed border. Invalid: dimmed `opacity 0.45`.                                                                                      |
| **Drop indicator**      | Dashed placeholder line (2px, `var(--ring)`) showing insertion index within target column — computed from pointer Y vs card midpoints; recomputed on each move (1:1 tracking §2).                                                                                                    |
| **Interruptibility**    | Springs use **presentation value** — mid-flight card can be re-grabbed without jump (§3). Drag can be cancelled mid-flight: `Escape` or drop outside any column → spring back to origin column+index from current on-screen position (no teleport).                                  |
| **Rubber-banding**      | Horizontal board edges + vertical column edges use `rubberband(overshoot, dimension, 0.55)` (§9). Further past boundary = less follow. Vertical overshoot inside column similarly damped.                                                                                            |
| **Velocity handoff**    | Release velocity passed as spring initial velocity (§5). If normalized API, `relativeVelocity = gestureVelocity / (target − current)` computed per-axis (X and Y decomposed §3 Decompose 2D).                                                                                        |
| **Momentum projection** | Release velocity projected via `project(v, 0.998) = (v/1000)*0.998/0.002` (§6). `projectedEndpoint = currentPos + project(v)`. Target column = column nearest projected endpoint, not nearest to release point — flick throws card. This matches scroll/VAULT bottom-sheet behavior. |
| **Commit vs reverse**   | Use **velocity sign** at release to decide direction when pointer is between columns (not position alone per §7 quick ref). Flick right while between Pending/Approved → commits to Approved even if pointer is slightly left of midline.                                            |
| **Reversal blending**   | Re-targeting mid-drag blends velocity — no brick wall (§3). Motion library must carry velocity through re-target (additive springs).                                                                                                                                                 |
| **Snap decision**       | If `                                                                                                                                                                                                                                                                                 | v   | < 80 px/s`(threshold), snap to nearest column by pointer position (slow intentional placement). If` | v   | ≥ 80`, use projection (§6). |

**Forbidden transitions enforced visually:** disallow drop indicator + shake target column header (4px, `damping 0.6`) if drop would be `Claimed → Denied` or `Denied → Claimed` — plus toast "Complete requests cannot be denied — use detail view audit correction."

### 4.2 Per-Card Menu (⋯) — Secondary, Always Available

Menus per spec §3.3.1 table (replicated — not re-decided):

| Column   | Actions                                                      |
| -------- | ------------------------------------------------------------ |
| Pending  | View Details, Approve, Deny, Move to Approved, Move to Ready |
| Approved | View Details, Prepare (→ Ready), Move to Pending, Deny       |
| Ready    | View Details, Dispense (→ Claimed), Move to Approved         |
| Claimed  | View Details, View Dispensing Record                         |
| Denied   | View Details, Re-open → Pending                              |

Menu is **not** a replacement for drag — it's the precision path (Agency: offer choices, don't force drag). Destructive "Deny" styled `destructive`.

### 4.3 Keyboard & A11y (Spec §3.3.1 keyboard table, preserved + Apple motion mapped)

| Action          | Key                                              | Motion                                                                                                                                                                                  |
| --------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus card      | `Tab` / `Shift+Tab` reading order                | Focus ring 2px `ring`, no movement                                                                                                                                                      |
| Select          | `Space` toggles checkbox → enables batch toolbar | Checkbox scale `0.85→1` spring `1.0/0.25`                                                                                                                                               |
| Open detail     | `Enter`                                          | Modal from card origin (same as pointer)                                                                                                                                                |
| Open menu       | `Shift+F10` / Application key                    | Dropdown from card's ⋯ origin (§7 anchored origins)                                                                                                                                     |
| Move left/right | `Alt+←/→`                                        | Card animates to adjacent column with same spring as drag drop (`damping 0.8/0.30` if keyboard velocity is synthetic moderate; otherwise `1.0/0.30`) — keyboard moves are _not_ instant |
| Clear selection | `Escape`                                         | Toolbar fades out                                                                                                                                                                       |

Screen reader: card announces "[Name], [Medicine], [Qty], [Status], [Time]". Column headers announce name+count. Drag announces "Moved [Name] from [Src] to [Dst]". `aria-grabbed` + `aria-dropeffect` on columns.

### 4.4 Multi-Select & Batch Toolbar

- Checkbox on each card (hover-revealed). Selected cards highlight `accent` + checked.
- Toolbar appears **bottom of board** when ≥1 selected, frosted material, `damping 1.0/0.30` slide-up from bottom (reversible: slides back down when cleared — symmetric paths §7).
- Batch combos per spec §3.3.1 multi-select table (All Pending → Approve All/Deny All, etc.). Mixed columns restricts to only valid common actions.
- Batch deny opens modal with Reason dropdown + optional note + destructive confirm. Batch approve is simple confirm dialog unless insufficient stock warning must be shown (list of short items).

---

## 5. Filter Bar (Persistent Above Columns)

| Filter     | Type                                           | Behavior                                         |
| ---------- | ---------------------------------------------- | ------------------------------------------------ |
| Search     | `Input` with search icon, real-time as-type    | Searches name, ID, medicine — across all columns |
| Date Range | Presets Today/7d/30d/All + custom `DatePicker` | Request submission date                          |
| Branch     | `DropdownMenu`                                 | If multi-branch                                  |
| Category   | `DropdownMenu`                                 | Only categories with active requests             |
| Requestor  | Text input                                     | Name/ID                                          |

- Filters apply across all columns simultaneously (filtered-out cards fade out, counts update "Pending (2 of 5)").
- Active chips below bar, "Clear all", URL-persisted (bookmarkable).
- **Palette shortcut:** `⌘K` → "Filter: pending paracetamol this week" natural language also applies Kanban filters — palette is palette, not just nav (00 §2.2).

---

## 6. Denied Column — Collapsed by Default

Two coexisting affordances (spec original, kept):

1. Collapsed 48px column header far right — click expand/collapse, width springs `1.0/0.30`. When collapsed, shows vertical count badge.
2. Dispensing Log also lists denied (status "Denied") — audit continuity.

Re-opening creates audit log "Request [ID] re-opened by [Staff]" (Responsibility).

---

## 7. Request Detail Modal (From Card)

```
┌─────────────────────────────────────────────────┐
│ Request Details                          [✕]    │  title heading, -0.01em
├─────────────────────────────────────────────────┤
│ Requestor: Maria Santos — STU-2024-0831         │
│ maria.santos@bukidnon.edu                       │
│ Request: Paracetamol 500mg — Analgesic          │
│ Qty: 2 tabs  Reason: [full text]                │
│ Submitted: Sep 12, 2026 at 2:15 PM              │
│ Status: Pending (badge)                         │
│ ── Status History ──                            │
│ ● Sep 12, 2:15 PM — Submitted                  │
│ ── Internal Notes ── [Add note...]              │
│ ── Dispensing Record (auto on Claimed) ──       │
│ [Deny]                    [Approve → Ready]     │  context-dependent per §4.1 of modal
└─────────────────────────────────────────────────┘
```

- Frosted modal with dim scrim, **anchored origin = source card rect** (§7, §12 Materialize blur+scale).
- Interruptible: can be dragged/swiped down to dismiss (like a sheet) with velocity handoff — `damping 0.8/0.30` if swiped, `1.0/0.30` if button-close. Reversible: re-opening from same card reuses origin.
- Forbidden actions not rendered, not disabled-visible — reduces error surface.
- Deny → reason dropdown + note + destructive confirm. Dispense → stock verification ("120 in stock, dispensing 2"), FEFO batch picker (earliest expiry first), confirm → stock decremented + dispensing record + Viewer notify.
- Internal notes are Staff-only, timestamped, never shown to Viewer (privacy — Responsibility).

---

## 8. Motion Budget & Performance (Frame-level §11)

- Animate only `transform` + `opacity` on cards; `backdrop-filter` only on sheet/modal chrome (GPU).
- Column vertical scroll is native `overflow-y` with virtualized cards (TanStack Virtual) — drag uses `transform` translations, not DOM reorder until drop commits (reorder on commit, not on each move).
- Horizontal board scroll uses native `scroll-snap-type: x mandatory` snap to column when not dragging; dragging suspends snap.
- `will-change: transform` on dragged card only while dragging — removed on drop.

**Dependency justification (§3 of 00):** `motion` for springs + drag projection path; Kanban DND choice: either `motion` drag primitives or `dnd-kit` + `motion` springs — spec recommends `motion` primitives for velocity/projection fidelity (dnd-kit alone can't project momentum correctly).

---

## 9. Empty States

| State                            | Display                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| No requests at all               | Center illustration + "No requests yet. When viewers submit requests, they'll appear here." |
| No matches for filters           | "No requests match filters." + "Clear Filters" button                                       |
| Column empty (others have cards) | Dashed placeholder "No [status] requests" inside column                                     |
| All columns empty                | Board-wide `Empty` + illustration                                                           |

---

## 10. Responsive & Palette Integration

| Width      | Behavior                                                                              |
| ---------- | ------------------------------------------------------------------------------------- |
| `≥1200`    | 5 columns fit with H-scroll, filter bar single row                                    |
| `900–1199` | Filter bar wraps 2 rows, columns 220px, indicator dots below board sync scroll ↕      |
| `800–899`  | Same as 900 but minimap dots more prominent; board horizontal scroll with rubber-band |

**Palette entries for this route:** "Go to Requests", "Filter requests: pending", "New request" (if Admin/Staff creating on behalf), recent request IDs for jump-to-detail.

**Accessibility note (00 §5.3):** Kanban is _always_ keyboard-operable per §4.3 — drag is never the _only_ path (Responsibility: don't trap users, Agency: forgiveness).

---

## 11. What This Screen Contains (Checklist)

- [ ] Horizontal Kanban 4+1 columns (260px / 220px), independent vertical scroll + horizontal board scroll with snap + rubber-band
- [ ] Compact cards 48–52px with checkbox, status badge, ⋯ menu per column
- [ ] Drag physics: hysteresis 10px, `setPointerCapture`, grab offset, velocity history, projection `0.998`, rubber-band `0.55`, velocity handoff, brick-wall avoidance, sign-based commit
- [ ] Per-card ⋯ menus per status + modal actions match
- [ ] Keyboard: Tab/Space/Enter/Shift+F10/Alt+Arrow with spring animation, not instant teleport
- [ ] Batch toolbar (frosted, slide-up spring) with column-aware actions + bulk deny modal
- [ ] Filter bar (search + 4 dropdowns) → chips + URL + palette filter alias
- [ ] Denied collapsed column + Dispensing Log linkage
- [ ] Detail modal from card origin, interruptible/swipeable, deny/dispense flows with FEFO + stock guard
- [ ] Empty states (board, column, filtered) + virtualized rows + performance budget
- [ ] Palette integration + sidebar badge parity

---

## 12. Trade-offs Summary

| Decision                                           | Why                                                                                                  | Sacrifice                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Drag-primary + menu fallback (interview)           | Spatial metaphor matches fulfillment journey; velocity/projection makes flick feel intentional (Joy) | More implementation (Motion dep) vs table dropdown — justified: this is the hero interaction of the system |
| Horizontal scroll + indicator vs vertical stacking | Preserves Kanban metaphor at 800px; stacking columns vertically loses "travel right" narrative       | Horizontal scroll is less conventional on desktop — mitigated by snap + rubber-band + indicator            |
| Projection-based snap vs position snap             | Flick intent matters: Staff flicks to Claimed under counter hurry (§5 Seam, §6 Projection)           | Slightly less predictable for slow drags — threshold 80 px/s splits the two modes cleanly                  |
| Filter bar sticky above board                      | Keeps triage filters visible during horizontal scroll                                                | Consumes 48px — acceptable because board is the whole page; no other competing content                     |
