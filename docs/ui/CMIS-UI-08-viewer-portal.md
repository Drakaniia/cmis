# CMIS UI/UX Spec — 08 Viewer Portal (Browse · Request · History · Claims)

Spec ID: CMIS-UI-08 | Routes: `/viewer` · `/viewer/history` · `/viewer/claims` | Depends on: 00, 02, 05

---

## 1. Purpose & Viewer Mental Model

Viewer (student/staff requestor) is _not_ inventory Staff — their job is **find medicine → submit request → claim at counter**. Every screen must reinforce this linear job, not expose inventory internals. Availability is conveyed as _threshold hint_, not exact counts (interview: status + hint).

| Screen                          | Primary question                                       |
| ------------------------------- | ------------------------------------------------------ |
| **Browse (`/viewer`)**          | "Is what I need here, and can I ask for it now?"       |
| **Request Flow (modal wizard)** | "What do you need to know about me to fulfill this?"   |
| **History (`/viewer/history`)** | "What did I ask for, and where is it in the pipeline?" |
| **Claims (`/viewer/claims`)**   | "What is mine to pick up right now?"                   |

Viewer sidebar is minimal: `Browse` + `History` + `Claim Status` (see 00 §2.2). No branch selector (Viewer sees only assigned/nearest branch). Content is **centered 640–720px column**, not full-width grid — focus over chrome (Flexibility: different job, different layout per 01).

---

## 2. Browse Medicine (`/viewer`) — Layout Options & Recommendation

| Option                                                                         | Structure                                                                                                                                                                                                                                                                                                                                                       | Trade-offs                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Search + filter list with card rows (spec 3.6.1)**                        | Search bar + Category/Status filters + row per medicine: Name · Status badge · Qty · [Request →] / [Notify Me]                                                                                                                                                                                                                                                  | + Familiar list, fast scanning. − Qty disclosure is the hard question (exact vs hint)                                                                                                                   |
| **B. Grid cards with imagery**                                                 | 2-col card grid, each medicine as card with icon                                                                                                                                                                                                                                                                                                                | + More approachable. − Wastes vertical space; imagery is fake for generic medicine (no photos) — decorative harm                                                                                        |
| **C. Focused list with threshold-hint badges (RECOMMENDED, interview choice)** | **A + interview quantity rule:** no exact numbers; status badges are **"In Stock — ample"** (green), **"Few left"** (amber, when below low-stock threshold), **"Out of stock"** (gray). Category chips above list (toggle) instead of dropdown — more thumb-friendly if ever on touch. Search is `InputGroup` with icon, sticky under header translucent layer. | + Respects interview: hint prevents hoarding/gaming while still conveying urgency; chip filters are glanceable; centered column keeps decision density calm (Simplicity: less chrome, fewer decisions). |

**Chosen layout:**

```
 Viewer Browse — 640px centered, sticky filters under translucent header
┌──────────────────────────────────────────────┐
│ [🔍 Search medicine...]                      │  real-time, debounced 150ms
│ [All][Analgesic][Antibiotic][Antiseptic]…    │  chip toggles, "All" default
├──────────────────────────────────────────────┤
│ Paracetamol 500mg                            │
│ Analgesic · ● In stock — ample    [Request →]│  green badge + hint
├──────────────────────────────────────────────┤
│ Amoxicillin 250mg                            │
│ Antibiotic · ● Few left           [Request →]│  amber badge — still requestable
├──────────────────────────────────────────────┤
│ Ibuprofen 400mg                              │
│ Analgesic · ○ Out of stock        [Notify Me]│  gray, disabled Request
└──────────────────────────────────────────────┘
```

### 2.1 List Row Anatomy

| Element       | Token / behavior                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medicine name | `heading` scale, `0.9375rem` weight 600, `-0.01em` tracking                                                                                                                                                                  |
| Category      | `caption` `muted-foreground` left of badge                                                                                                                                                                                   |
| Status badge  | `Marker` with dot + text + hint: "In stock — ample" / "Few left" / "Out of stock". Colors: green/amber/gray — never color-alone.                                                                                             |
| Quantity      | **Not shown**. Internal `qty` still drives badge threshold but is hidden from Viewer.                                                                                                                                        |
| CTA           | Primary `Button` `default` size: `[Request →]` when not out-of-stock; `secondary` `[Notify Me]` when out (future: notification toggle; v1 shows inline "We'll notify Staff" toast). Buttons `pointerdown` scale `0.97` (§1). |
| Row height    | 64px Comfortable / 56px Compact per density toggle (inherits shell toggle; Viewer benefits even though not dense-table)                                                                                                      |

**"Few left" threshold:** reuses Staff low-stock threshold for that item — single source of truth, no Viewer-specific threshold (Familiarity: one system, one meaning).

**Search & filters:** search by medicine name only (not SKU/batch — Viewer doesn't know SKUs). Category chips are toggles (multi-select? Single-select recommended — simpler mental model; interview didn't specify multi — choose single: "Show me analgesics"). Status toggle: `All | Available | Out` (second-level, segmented).

**Empty:** "No medicine matches your search. Try different keywords." + "Clear search".

---

## 3. Request Flow — Modal Wizard (Interview: modal, per 02)

Spec 3.6.2 defines 4 steps; interview confirms **modal wizard** (centered, dim scrim, numbered progress) over sheet or accordion — same justification as Stock In (02 §4.1): request is a _focused task_ that needs completion, not a parallel preview.

### 3.1 Steps (Linear, 4 Steps)

| Step                         | Content                                                                                                                                                                                                                                                                                                                                                                                                                   | Validation                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **1. Medicine Confirmation** | Card showing selected medicine (name, strength, category, status badge hint). Not editable — confirms intent before personal data entry.                                                                                                                                                                                                                                                                                  | Pass-through; "Continue" primary                                                       |
| **2. Request Form**          | Full name `Input` (prefilled from profile if auth exists), Student/Staff ID `Input`, Reason `Textarea` (placeholder "Describe symptoms or reason…"), Quantity `Input type=number` default 1 min 1 max = threshold hint? Since Viewer doesn't see exact stock, **max is not enforced numerically by Qty — enforced by Staff approval** (Responsibility: Viewer self-regulates via "Few left" hint; Staff gatekeeps abuse). | All required; name min 2 chars, ID pattern if known, reason min 10 chars, qty ≥1       |
| **3. Review & Submit**       | Summary card: medicine + requestor + reason + qty + note "You'll be notified when ready to claim". `Submit Request` primary.                                                                                                                                                                                                                                                                                              | Submit disabled until valid; inline validation per field on blur (§16 validate inline) |
| **4. Confirmation**          | Success illustration + "Request submitted" + Request ID `#RQ-xxxx` (copyable) + "Track Status" CTA → `/viewer/history` with new request highlighted + auto-toast "Your request for [Medicine] was sent — Staff will review shortly".                                                                                                                                                                                      | —                                                                                      |

### 3.2 Modal Anatomy

```
┌─────────────────────────────────────────────────────┐
│ Request Medicine — Step 2 of 4  ──●──●──○──○──  [✕] │
├─────────────────────────────────────────────────────┤
│ Full name [________________]                         │
│ ID        [________________]                         │
│ Reason    [______________________________]           │
│ Qty       [1]  hint: "few left — please request only what you need" (when hint is Few left)
├─────────────────────────────────────────────────────┤
│                                 [Back] [Next →]     │
└─────────────────────────────────────────────────────┘
```

- **Materialize:** blur+scale `damping 1.0/0.30` from the source medicine row's Request button (§7 anchored origins — spatial consistency: request originates from the medicine you tapped).
- **Step motion:** forward slide 12px + opacity, back slides inverse (§7 symmetric paths).
- **Accessibility:** focus moves to first input on step enter; `Escape` with dirty guard ("Discard request?"); all inputs have `Label`, error text linked via `aria-describedby`.

### 3.3 Alternatives Considered

| Option                          | Why not chosen                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sheet stepper from row          | Sheet implies parallel context (keep browse visible). Request deserves focus + scrim (§12 Dim to focus)                                                                                                                         |
| Single-page long form           | 4 fields on one page is feasible, but progress dots motivate completion; Step 1 confirmation reduces mis-selection errors                                                                                                       |
| Auto-approval vs Staff approval | Open question from CMIS-03 §5 — spec for this portal assumes **Staff approval required**; UI shows "Pending" after submit. If auto-approval ships, Step 4 becomes "Ready to claim" directly — one string swap, no layout change |

---

## 4. Request History (`/viewer/history`)

Simple card list (not table — Viewer expects timeline, not spreadsheet):

| Element       | Content                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card          | `Card` per request: Date (`MMM DD, YYYY` + relative), Medicine name, Qty, Status badge, `[View details]` link                                                                   |
| Status badges | Pending yellow · Approved blue · Ready green **pulsing** (§1 continuous feedback) · Claimed gray · Denied red — same palette as Kanban for cross-role consistency (Familiarity) |
| Sort          | Newest first (desc). No user-controlled sort — simplicity over power                                                                                                            |
| Detail        | Click card → same detail modal shape as Staff Kanban (§7) but **read-only** for Viewer (no Approve/Deny actions, only status + history + dispensing record when claimed)        |

```
┌──────────────────────────────────────────────┐
│ Sep 12, 2026 · 2:15 PM          ● Pending    │
│ Paracetamol 500mg — 2 tabs                   │
│ Reason: Severe headache…         [View →]     │
├──────────────────────────────────────────────┤
│ Sep 10, 2026 · 10:30 AM  ● Ready to claim ◐  │ ← pulsing green
│ Ibuprofen 400mg — 1 strip        [View →]     │
└──────────────────────────────────────────────┘
```

**Empty:** "You haven't made any requests yet. Browse available medicine to get started." + `[Browse Medicine →]`.

---

## 5. Claim Status (`/viewer/claims`)

Two-section page (spec 3.6.4):

```
[Ready to Claim — prominent cards]
┌──────────────────────────────────────────────┐
│ ★ Ready to claim                             │
│ Paracetamol 500mg — 2 tabs                    │
│ Pick up at: Main Clinic, Counter 1            │
│ Prepared by: Nurse Joy · Sep 12, 2:45 PM      │
│ [Directions / note]                           │
└──────────────────────────────────────────────┘
[Claimed History — compact table/cards]
│ Date │ Medicine │ Qty │ Claimed at │
```

| Section             | Hierarchy                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ready to Claim**  | Prominent `Card` with left green accent bar (4px) + `display` medicine name + location/branch + staff to ask for + timestamp. Pulsing badge inside. If multiple, newest top. |
| **Claimed History** | Table (or card list under 900px) of past claims: Date / Medicine / Qty. Read-only.                                                                                           |

**Claim action:** physical claim at counter — Viewer shows this screen to Staff; Staff dispenses via Kanban Detail → Dispense (§5). No digital "I claimed" button (prevents false self-claim) — Responsibility: physical handoff is audit ground truth.

---

## 6. Interactions & Motion

| Interaction          | Motion                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Request button press | `scale 0.97` 100ms on `pointerdown` (§1)                                                             |
| Modal open/close     | Blur+scale from button origin, `damping 1.0/0.30`, symmetric enter/exit (§7)                         |
| Step Next/Back       | 12px slide + opacity, direction mirrors (§7)                                                         |
| Status pulse (Ready) | `opacity 0.92→1` 1200ms ease, not spring — calm attention, not bounce (§14 avoid 0.2 Hz oscillation) |
| History card press   | Same `0.97` scale; focus ring 2px                                                                    |
| Search chip toggle   | `scale 1.02` 120ms on active                                                                         |

Reduced-motion: modal cross-fades, pulse stops, step slides become opacity only.

---

## 7. Responsive Behavior (Desktop 800 min, but Viewer is the most "mobile-shaped" module)

| Width      | Behavior                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `≥1200`    | 640px centered column (optimal reading), filters single row                                                    |
| `900–1199` | Column 640px centered still (no full-width stretch — preserves calm density)                                   |
| `800–899`  | Column becomes `calc(100% - 32px)` with 16px side padding; filters wrap chips to 2 rows; modal narrows to 92vw |

If Tauri ever ships responsive tablet, Viewer is the first module to become bottom-sheet request — no redesign, just switch centered column to padded stack (future-proof note).

---

## 8. What This Screen Contains (Checklist)

- [ ] Browse: centered list with threshold-hint badges (ample / few left / out), search + chip category + status segment, sticky translucent filters
- [ ] Request wizard: 4-step modal from button origin, linear validation, confirmation + ID + track link, dirty discard guard
- [ ] History: card list newest-first, status badges parity with Kanban, read-only detail modal
- [ ] Claims: Ready prominent cards (accent bar + pulse + location) + Claimed history table
- [ ] No exact qty disclosure; "Few left" threshold from inventory; quantity max not hard-enforced (Staff gatekeeps)
- [ ] Palette entries: "Browse medicine", "My requests", "Claim status" + search aliases
- [ ] Empty states per section + loading skeletons

---

## 9. Trade-offs Summary

| Decision                                  | Why                                                                                                                   | Sacrifice                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Threshold hint over exact qty (interview) | Prevents hoarding/gaming; simpler mental model for Viewer (Simplicity); Staff retains exact data for control (Agency) | Viewer can't dose-plan precisely — correct: Viewer trusts Staff fulfillment; hint "Few left — request only what you need" teaches restraint |
| Centered 640px column over full-width     | Focus over chrome; 800px window doesn't need edge-to-edge medicine rows                                               | Feels distinct from Staff wide tables — intentional per-role layout (Flexibility, 01)                                                       |
| Read-only Viewer detail (no actions)      | Responsibility: only Staff can transition request state; Viewer self-claim button would corrupt audit                 | Viewer can't cancel own Pending request — add "Cancel request" if product demands, creating audit "Cancelled by requestor" entry (deferred) |
| Modal wizard over bottom sheet            | Transaction focus; 4 fields deserve scrim, not parallel browse context                                                | Loses browse context during fill — acceptable: focus reduces errors (Responsibility)                                                        |
