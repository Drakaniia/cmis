# Spec — Quick Stock Deduct (Ctrl+D)

**Short name:** `quick-stock-deduct`
**Area:** `apps/desktop` — Inventory deduction surface + a thin Request Queue integration
**Status:** Draft, awaiting implementation
**Companion spec:** [`request-creation-stock-deduction-spec.md`](./request-creation-stock-deduction-spec.md) — same area, shared deduction service. Read that first.
**Date:** 2026-09-17

---

## 1. The request, in the requester's words

> "what about when the user just want to deduct a stock without having to procees long queuee.. new spec file if needed that still align.."

Two things are being asked for:

1. **Not every hand-over deserves the approval workflow.** Today, taking one item off the shelf and giving it to someone means walking a card through Pending → Approved → Ready → Claimed — four steps that add nothing when a customer is standing at the counter.
2. **The alternative is also long.** The inventory side already has a stock-out path, but it is a **five-step wizard** (`stock-out-wizard.tsx`): Identify → Reason → Quantity → Notes → Review. Asking for one item and one number should not take five screens.

So: a one-action, two-field deduction that still lands in the audit trail, still moves a real batch, and still counts in analytics — without the queue and without the wizard.

This spec is written to **align with** `request-creation-stock-deduction-spec.md` (§13 below maps the shared pieces and the one deliberate policy difference).

---

## 2. Current state — relevant findings

Numbered `QD1…` so they do not collide with `AF1–AF13` in the companion spec.

| # | Finding | Evidence |
|---|---------|----------|
| QD1 | The only way to take stock off the shelf is the 5-step wizard. It is mounted on three pages, each wiring the same component. | `features/inventory/components/stock-out-wizard.tsx`, mounted at `inventory-page.tsx:736`, `low-stock-page.tsx:461`, `expiry-page.tsx:608` |
| QD2 | The wizard refuses to advance without a batch: step 3 validation requires `draft.batch.length > 0`. | `stock-out-wizard.tsx` (`validateStep`, step 3) |
| QD3 | `useStockOutMutation` already does the right things — batch decrement (deleting at zero), item quantity, derived status, `needs_batch`, a `dispensing_events` upsert when the reason is `Dispensed`, and an audit entry. | `features/inventory/hooks/use-stock-mutations.ts:147` (`decrementBatch`, `recordDispensing`) |
| QD4 | `dispensing_records.request_id` is `TEXT PRIMARY KEY … REFERENCES requests (id) ON DELETE CASCADE` — a dispensing log row **cannot exist without a request**. | `src-tauri/migrations/0001_request_queue.sql:48` |
| QD5 | The File menu's accelerator table (`accelKeys`) is the established way to bind a global shortcut, and the macOS native menu is a parallel path in Rust. `Ctrl+D` is free. | `components/menubar/menu-config.ts:41-47`, `menubar.tsx:433`, `src-tauri/src/lib.rs:99` |
| QD6 | A barcode component and a barcode-wedge hook exist, but the decision here is a plain search list — the component is reusable later if scanning is ever added to this path. | `features/inventory/components/barcode-input.tsx`, `hooks/use-barcode-wedge.ts` |
| QD7 | There is no `source` (or any origin) marker on `requests`, so a quick deduction could not be told apart from a queue-created card. | `migrations/0001_request_queue.sql:5-19` |

---

## 3. Goals

- G1 — Deducting stock takes **one shortcut, one item, one number, one confirm**. No queue, no wizard.
- G2 — The deduction still decrements the real batch, records an audit entry, and counts in Dashboard/Reports.
- G3 — It remains traceable: it produces a request that appears in the queue as Claimed, marked as a quick deduction, and a `dispensing_records` row in the Dispensing Log.
- G4 — A mistake is recoverable for a few seconds, without weakening the no-undo rule for queue dispensing.

## 4. Non-goals

- N1 — Not a replacement for the wizard. Disposed / Damaged / Transferred / Other keep the 5-step path unchanged (D4).
- N2 — No multi-item deductions: one item per action (D13).
- N3 — No barcode input on this surface (D8).
- N4 — No reusable "recent items" list for repeat deductions (D13).
- N5 — No post-window correction UI; the Dispensing Log gains no correction action (D16).
- N6 — No reservation, approval, or requestor capture. The item and a quantity is the whole form (D2).

---

## 5. Decisions taken in the interview

| ID | Decision | Value chosen |
|----|----------|--------------|
| D1 | Entry points | **Global shortcut + modal, plus a command palette entry** |
| D2 | Form content | **Item + quantity only** — reason defaults to `Dispensed`, batch automatic, no notes, no name |
| D3 | Recording | **Auto-create a request that lands in Claimed** — so the Dispensing Log FK is satisfiable and the movement is traceable |
| D4 | The existing wizard | **Keep it** for the rare reasons |
| D5 | Shortcut | **`Ctrl+D` / `⌘D`** |
| D6 | Item picking | **Search list only** — no barcode field on this surface |
| D7 | Missing batches | **Deduct from the item total with no batch** — never block a counter hand-over |
| D8 | Undo | **Yes — a short undo window in the toast** |
| D9 | Short stock | **Block with a clear message** naming what is available |
| D10 | Card marking | **Yes — a "Quick deduct" marker on the card and in its detail view** |
| D11 | Relationship to `Ctrl+N` | **A separate modal** — two focused tools |
| D12 | Permission | **Anyone who can open the app** |
| D13 | Multi-batch | **Split FEFO automatically** across as many batches as needed |
| D14 | Marker storage | **A new `source` column on `requests`** |
| D15 | Marker values | **Two — `queue` and `quick-deduct`** (`queue` is the default) |
| D16 | Correction after the window | **Only the undo window**; afterwards the wizard (offsetting stock-in / stock-out) |
| D17 | Low stock feedback | **The toast says the item is now low or out of stock** |
| D18 | Docs | **Help section + shortcuts modal + README** |

---

## 6. Functional specification

### F1 — Entry points

**`Ctrl+D` / `⌘D`, global.** Registered the same way as the existing accelerators:

- a File-menu item, e.g. `file.quick-deduct` with `accelerator: "Ctrl+D"`, `accelKeys: ["ctrl+d", "meta+d"]` in `menu-config.ts`, whose action opens the modal rather than navigating (the `ACTION` union already has a `modal` variant, as used by `about` / `shortcuts`);
- the macOS native menu: a matching `MenuItem` in `src-tauri/src/lib.rs` added to `CUSTOM_IDS` so the event reaches the frontend, exactly like `file.new-request`.

**Command palette entry.** A `Deduct stock…` command that opens the same modal, so the action is discoverable without knowing the shortcut.

Guards and behaviour:

- Must **not** fire while focus is in an `input`, `textarea`, `select` or contenteditable — reuse the `acceptsTypedText` guard already in `features/requests/components/requests-page.tsx`.
- Repeated presses must not stack modals: one instance, already-open presses are no-ops.
- The modal mounts at app root, so it opens over any route without navigating.
- **Note for browser dev:** `Ctrl+D` is a browser bookmark shortcut. Inside the Tauri shell the accelerator is ours; in a plain browser tab the browser may win. This is accepted (D5) but worth knowing during testing.
- Escape closes; `Cmd/Ctrl+Enter` confirms.

### F2 — The form

Deliberately minimal (D2). Two inputs and a read-only plan.

| Element | Behaviour |
|---------|-----------|
| Item | A search/select list of in-stock items. Same filtering idea as the wizard's Step 1 (name, display name, SKU; `qty > 0`), but presented as a single-selection combobox rather than a step. |
| Quantity | Positive integer, defaulted to `1`, capped by stock on hand. |
| **Read-only plan** | Not a field — a preview line the operator can check: what will be taken and from which batch(es), and what is left afterwards. Mirrors the "confirmation showing the plan" decision (F8/D13) in the companion spec. |
| Unit | **Not asked.** Taken silently from the item (companion spec D24). Shown in the plan line so the number is unambiguous. |
| Category | **Not asked, not editable.** Taken from the item (companion spec D25). |
| Reason | **Not asked.** Fixed to `Dispensed` internally. |
| Batch | **Not asked.** Automatic FEFO (D13 / companion D7). |
| Notes | **Not asked.** |
| Customer / requestor | **Not asked.** Stays blank; the card renders "Walk-in" (companion D2/D23). |

Validation:

- **Blocked** when no item is selected, or quantity is blank / zero / negative / non-numeric.
- **Blocked when the quantity exceeds stock on hand** (D9) — the message names the available amount, e.g. "Only 3 in stock." (This is the one deliberate divergence from queue dispensing, which allows partials — see §13.)
- **Blocked** when the item has no inventory row or is out of stock (it will not appear in the list).
- An item whose value is entirely in batches that are expired or empty: **blocked** with "No dispensable batch" — expired medicine must never leave the shelf (see OQ2).

Primary action is disabled until the form is valid; the confirm label names the outcome ("Deduct 3 tablet").

### F3 — What a quick deduction does

The write path is the **same service** the companion spec introduces for queue dispensing (`features/requests/deduct-stock.ts`, companion spec F7), called with quick-deduct options. It must not be reimplemented here.

1. **Resolve the item** by id (the picker supplies it).
2. **Pick batches FEFO** — earliest expiry first, expired and empty batches excluded. Take as much as needed from each in turn until the quantity is covered (D13).
3. **Take from the item total when there are no batch rows at all** (D7): decrement `inventory_items.qty` and record the dispensing row with an empty batch rather than refusing.
4. **Decrement each batch taken from**, deleting the row when it reaches zero — with an undo snapshot taken first (see F5).
5. **Decrement the item total**, deriving `status` via `deriveStatus(newQty, threshold)` and recomputing `needs_batch` from the remaining batch count — the same arithmetic `useStockOutMutation` already applies (QD3).
6. **Create the request** (D3): one `requests` row that lands directly in `claimed`, with:
   - a sequential `REQ-<YYYY>-<NNNN>` id (companion spec F4, same helper);
   - `source = 'quick-deduct'` (D14/D15);
   - blank `requestor_name` / `requestor_id` / `requestor_email` → renders as "Walk-in";
   - blank `reason` (optional per companion D17);
   - `unit` and `category` from the item;
   - a single history entry `null → claimed`, actor `You`, noting it was a quick deduction.
7. **Write one `dispensing_records` row** — the batch(es) actually taken (comma-joined when split), expiry, quantity, staff. This satisfies QD4's foreign key because the request now exists.
8. **Upsert `dispensing_events`** on `(item_id, date)`, adding the quantity — so Dashboard and Reports count it (companion D10).
9. **Write an audit entry** via `recordAudit`: action `stock-out`, before/after quantities, detail naming the medicine, quantity, batch and the request reference, `targetId` = item id, `bestEffort: true`.
10. **Invalidate queries**: `inventory_items`, `inventory_items_count`, `dashboard-stats`.
11. **Toast** reporting what happened, including the low-stock outcome when relevant (D17), with the **Undo** action (F5).

Ordering: **stock first, card second** — the same rule as the companion spec. A card that claims a hand-over the shelf never saw is the failure mode being fixed.

### F4 — The created card on the board

- It appears in the **Claimed** column immediately (D3) and auto-archives after 24 hours under the existing rule (`CLAIMED_ARCHIVE_HOURS`).
- It carries a **"Quick deduct" badge**, and the detail view states the same (D10). The badge reads from `source === 'quick-deduct'` (D14) — this is the reason the column exists, and it is what separates a quick deduction from a walk-in request created through the queue form (which also shows "Walk-in" but stays `source = 'queue'`).
- Actions offered on it are the same as any claimed card: View details, View dispensing record. No undo, no reversal (companion F12).
- It is searchable/filterable like any other card; the requestor filter skips it because the requestor is blank.
- It must not be draggable out of Claimed (transitions already forbid every move out of `claimed`).

### F5 — Undo window

A quick deduction is one keystroke away from a mistake, so this path gets a short reversal the queue path deliberately does not (companion D12). Because the request it creates is otherwise terminal, the window is the only correction route (D16).

- The success toast carries **Undo** for a short window. **Proposed: 5 seconds** — short enough that the state it reverses is still the state it captured. *Open question OQ1.*
- **Snapshot taken before the write:** for each batch touched, its id, batch code, expiry, quantity and supplier; plus the item's pre-deduction `qty` and `status`.
- Undo, in one transaction:
  1. **Restore each batch** — add the snapshot quantity back by `(item_id, batch)`, recreating the row from the snapshot when the deduction deleted it (a batch that hit zero is deleted, per QD3, so undoing it means reviving it).
  2. **Restore the item** — add the quantity back and recompute `status` and `needs_batch`.
  3. **Subtract from `dispensing_events`** for that item and date (D8, D16), floored at zero so a reversal can never make the day negative.
  4. **Delete the created request** — `request_history` and `dispensing_records` cascade away.
  5. **Write an audit entry** recording that the deduction was undone, by whom, and what the reference was — so the reversal itself is traceable even though the record is gone.
  6. Invalidate the same queries and show a confirmation toast.
- Undo is **refused** (with a message, not silence) when the item no longer exists — someone deleted it in the intervening seconds. The stock is left as it is rather than silently discarded.
- Only the most recent deduction is undoable; a second deduction replaces the toast action.

### F6 — Low-stock feedback

- After confirming, the toast states the resulting standing when it is notable (D17): "Paracetamol 500 mg tablet — 2 left, at or below its threshold of 10" or "… — out of stock".
- The threshold comparison uses the item's own `threshold` and must agree with the Low-Stock page's derivation, not invent a second rule.
- This is informational only — it never blocks or warns before the fact (the wizard's job is the careful path).

### F7 — Command palette

- One entry, `Deduct stock…`, in the same registry/section as the other commands, opening the modal (D1).
- The palette's existing navigation path must not be used for it; it opens a modal in place, like the shortcuts/about entries do.

---

## 7. Data model changes

Two changes, one of which belongs to the companion spec.

### 7.1 `requests.source` (this spec, D14/D15)

```sql
ALTER TABLE requests ADD COLUMN source TEXT NOT NULL DEFAULT 'queue';
CREATE INDEX IF NOT EXISTS idx_requests_source ON requests (source);
```

- `'queue'` is the default, so **every existing row and every queue-created row is correct without a backfill**.
- The only other value today is `'quick-deduct'` (D15). Three or four values were considered and rejected.
- `persistence.ts` must read and write it: `RequestItem` gains `source: RequestSource` (`'queue' | 'quick-deduct'`), the `RequestRow` interface gains `source: string`, and `assemble()` narrows it defensively the way `toStatus`/`toDenyReason` already do — an unknown stored value falls back to `'queue'`.
- This also means the companion spec's `saveRequest` statement (which is already being rewritten to drop the non-existent `branch` column, companion AF5/F13) must include `source` in both the column list and the parameter list. **Coordinate the two changes**: a statement that is wrong by one parameter fails silently and takes the whole queue with it.

### 7.2 Migration ordering

Migrations are append-only and versioned (`src-tauri/src/lib.rs`), so the two specs must not both claim 0007:

| Implementation order | This spec's migration | Companion spec's migration |
|----------------------|----------------------|----------------------------|
| Companion spec first | `0008_request_source.sql` | `0007_request_queue_dispensing.sql` (§7 of the companion spec) |
| This spec first | `0007_request_source.sql` | `0008_request_queue_dispensing.sql` |

Either way, take **the next free version number at implementation time** and register it in `db_migrations()`. Dropping a blank-batch dispensing row into the companion spec's reworked `dispensing_records` (its migration relaxes the primary key to allow several rows per request) needs nothing further from this spec — an empty `batch` is a valid string for a `NOT NULL` column; the Dispensing Log simply shows an empty Batch cell in that row.

### 7.3 No other schema change

- Blank `requestor_*` and blank `reason` are stored as `''` — the columns stay `NOT NULL` (companion D23/D17).
- No settings table, no new trash table, no change to `inventory_items` / `inventory_batches`.

---

## 8. UX specification

- **Shape:** a compact modal in the existing visual language (`materializeEnter`, `sheetSpring`, `.surface-frosted`, `role="dialog"`, `aria-modal="true"`, focus trapped and returned, Escape to close).
- **Focus order:** item field on open → quantity → confirm. The item field is the only thing that ever needs typing.
- **Plan line** (read-only) reads something like:
  `3 tabs from batch B-4412 (exp 2027-01) · 7 left in stock` — and when split, names both batches.
- **Keyboard:** `Ctrl+D`/`⌘D` opens, `Esc` closes, `Cmd/Ctrl+Enter` confirms, `↑`/`↓` move through the item list.
- **Live region:** the deduction and the undo both announce through a polite live region, consistent with the board's announcements.
- **No nested steps, no progress indicator, no wizard shell.** The modal has exactly one state.
- **Wording:** the confirm button names the outcome ("Deduct 3 tab"); the button is disabled when invalid, with the reason stated inline rather than only on click.
- **Claimed card badge** uses the same colour-plus-text convention as the rest of the board (`REQUEST_COLUMNS` badge classes) — never colour alone.

---

## 9. Edge cases

| # | Case | Expected behaviour |
|---|------|--------------------|
| E1 | Item has no batch rows at all | Deduct from the item total; the record's batch is empty (D7). |
| E2 | Item has batch rows but all are expired or zero | Blocked with "No dispensable batch" — expired medicine never leaves the shelf. *Confirm in OQ2.* |
| E3 | Quantity exceeds one batch | Split FEFO across batches automatically (D13); one request, one record, several batch names. |
| E4 | Quantity exceeds total stock | Blocked with the available amount named (D9). Nothing is written. |
| E5 | Deduction takes a batch to exactly zero | The batch row is deleted (existing behaviour, QD3) — hence the pre-write snapshot needed for undo (F5). |
| E6 | Undo, and the batch row had been deleted | Revived from the snapshot with its original code, expiry, supplier and quantity. |
| E7 | Undo, and the item was deleted meanwhile | Refused with a message; stock is not silently discarded. |
| E8 | Undo, and someone deducted from the same item in the window | Adding the snapshot quantity back is still correct — each deduction moved its own amount. `dispensing_events` is decremented with a floor at zero. |
| E9 | Same-day repeat deductions | `dispensing_events` upserts on `(item_id, date)` and adds; one row per item per day. |
| E10 | Two `Ctrl+D` presses in quick succession | One modal; the second press is a no-op. |
| E11 | Deduction drops the item to/below threshold or to zero | The toast says so (D17, F6). The item is not blocked or stopped. |
| E12 | `Ctrl+D` pressed while typing in a form field | Ignored (F1 guard). |
| E13 | Frontend opened in a plain browser | The browser may claim `Ctrl+D` for bookmarking (F1); the modal is still reachable from the command palette. |
| E14 | No Tauri shell / no database | `getDb()` already degrades; the modal must show a clear "cannot record this deduction" state rather than a successful toast. |
| E15 | Item is selected, then renamed or deleted before confirm | The write fails; the failure surfaces instead of a silent no-op. |
| E16 | The created card reaches 24h claimed | Auto-archived off the board, still in the Dispensing Log — same as any claimed card. |
| E17 | An item with incomplete details (`detailsIncomplete`) | Deductible like any other; this path does not gate on data completeness. |

---

## 10. Files expected to change

**New**
- `apps/desktop/src/features/inventory/components/quick-deduct-modal.tsx` — the surface (F1–F2, F6)
- `apps/desktop/src/features/inventory/hooks/use-quick-deduct.ts` — form state, validation, call into the shared service, undo snapshot and reversal (F3, F5)
- `apps/desktop/src/features/inventory/domain/deduct-plan.ts` — pure FEFO split planning for a requested quantity, including the no-batch case (E1–E3). Pure so it is testable without a database
- `apps/desktop/src-tauri/migrations/000X_request_source.sql` — `requests.source` (§7.1–§7.2)
- Root-level mount for the modal, beside the other global modals

**Changed**
- `features/requests/deduct-stock.ts` — *shared with the companion spec.* Gains quick-deduct options: `allowPartial: false`, `allowMissingBatch: true`, `source: 'quick-deduct'`, and returns the undo snapshot
- `features/requests/request-id.ts` — reused for the created reference (no change beyond existing)
- `features/requests/types.ts` — `source: RequestSource`, `'queue' | 'quick-deduct'`
- `features/requests/persistence.ts` — read/write `source`; coordinate the parameter list with the companion spec's AF5 fix
- `features/requests/components/request-card.tsx` + `request-detail-modal.tsx` — the "Quick deduct" badge (F4/D10)
- `components/menubar/menu-config.ts` — `file.quick-deduct` accelerator entry; `components/menubar/shortcuts-modal.tsx` — list it
- `components/menubar/use-menu-actions.ts` — dispatch the new modal action
- The command palette registry — the `Deduct stock…` entry (F7)
- `src-tauri/src/lib.rs` — native menu item + `CUSTOM_IDS`, and the new migration registration
- `features/help/components/docs/sections/` — an inventory/requests doc explaining `Ctrl+D` beside `Ctrl+N` (D18)
- `README.md` — mention the shortcut path (D18)

**Unchanged on purpose**
- `features/inventory/components/stock-out-wizard.tsx` and its three mounts — the wizard stays exactly as it is (D4).

---

## 11. Verification

- `pnpm check-types` clean; `pnpm test:frontend` green.
- `pnpm check` / `pnpm fix` (Ultracite) clean.
- Manual walkthrough in `pnpm desktop:dev`:
  1. `Ctrl+D` from the Dashboard opens the modal; `Esc` closes it.
  2. Search an item, deduct 3 → stock drops by 3, a batch is decremented, the toast reports the new standing.
  3. The Claimed column shows a card badged "Quick deduct", requestor "Walk-in", with a dispensing record visible in its detail.
  4. Dashboard and Reports count the deduction for today.
  5. An item with two batches (6 expiring sooner, 4 later) deducts 3 from the earlier batch; deducting 8 splits across both and names them in the record.
  6. An item with no batch rows deducts from the item total with an empty batch cell in the Dispensing Log.
  7. Entering more than is on hand is blocked with the available amount named.
  8. **Undo** inside the window restores the batch (including a batch that had been deleted at zero), the item total, and the day's dispensing total, and removes the card.
  9. After the window there is no undo anywhere on that card.
  10. Dropping an item to its threshold shows the low-stock wording in the toast.
  11. The existing 5-step wizard still works unchanged from all three pages.
- Per the companion spec's testing decision (minimal), the highest-value additions if any are made are the pure planner (`deduct-plan.ts`) and the undo reversal against `src/test/fake-db.ts`.

---

## 12. Risks and follow-ups (recorded, not solved here)

- **One service, two policies.** Queue dispensing allows partial hand-overs; quick deduct blocks short quantities (D9 vs companion D4). That difference must live in the service's options, not in two code paths — divergence here would mean the queue and the shortcut disagree about what "deduct" means.
- **Undo versus batch deletion.** Deleting a batch at zero (QD3) plus a reversed deduction means a batch row can be resurrected. The snapshot must carry expiry, supplier and code, or the revived batch is a ghost.
- **`dispensing_events` is an aggregate.** Reversing a deduction means subtracting from a daily total that other writes also touch; the floor at zero protects against a negative day but cannot tell a genuine reversal from a concurrent write. Acceptable at this scale, worth watching.
- **`Ctrl+D` in a browser** is a bookmark (E13). Fine in the Tauri shell; a papercut when running the frontend standalone.
- **Claimed-column noise.** Every quick deduction parks a card in Claimed for 24h. A busy counter could fill the column; the badge plus auto-archive is the accepted mitigation (D3/D10), but if it becomes a nuisance the follow-up is a "hide quick deductions" board filter.
- **Silent persistence.** The companion spec fixes `saveRequest` but keeps its swallowing `catch` (its N4/AF5). A quick-deduct request is written through the same statement, so it inherits that risk — including the parameter-list coordination called out in §7.1.
- **Wizard drift.** With two deduction surfaces, the wizard and the quick path could slowly disagree (reasons, validation, wording). They share `useStockOutMutation`'s arithmetic today; keeping the shared service the only writer is what keeps them honest.

### Open questions (one decision each, cheap to settle)

- **OQ1 — Undo window length.** 5 seconds proposed. Long enough to catch a mis-key, short enough that the reversed state is still the captured state.
- **OQ2 — Items whose batches exist but are all expired.** Proposed: blocked with "No dispensable batch", because handing over expired medicine is the harm the whole expiry feature exists to prevent. The alternative — deduct from the item total anyway, as E1 does — is simpler but silently bypasses the expiry rule.
- **OQ3 — Does the created request need a `reason`?** Proposed: blank. The audit entry carries the "Dispensed" context instead. If a downstream report groups by request reason, a `'Quick deduct'` value would be more legible.

---

## 13. Alignment with `request-creation-stock-deduction-spec.md`

The two specs describe one area and must be implemented together where they touch.

**Shared, implemented once**

| Concern | Owner | Note |
|---------|-------|------|
| The deduction service (`features/requests/deduct-stock.ts`) | Companion spec F7 | This spec calls it with quick-deduct options; it must not grow a second implementation |
| Request ID generation (`REQ-YYYY-NNNN`) | Companion spec F4 | Same helper for both paths |
| FEFO batch selection + expired exclusion | Companion spec F7 / inventory domain | Same rule, same code |
| `dispensing_events` + `dispensing_records` + `recordAudit` writes | Companion spec F7 steps 6–8 | Identical for both paths |
| Blank requestor = "Walk-in" | Companion D2/D23 | Quick deductions are anonymous by construction |
| Claimed auto-archive (24h) | Companion `CLAIMED_ARCHIVE_HOURS` | Applies to the auto-created card |
| No undo after the window | Companion F12/D12 | This spec adds only the short toast window, and only for its own path |
| Docs surfaces (help, shortcuts modal, README) | Both | Each documents its own shortcut |

**Bridged by `requests.source`**

Without the column, a quick deduction and a walk-in request created through the queue form are indistinguishable — both show "Walk-in", both are Claimed, and neither says how it got there. `source` is the one piece of schema this spec owns, and it is what the "Quick deduct" badge (D10) reads.

**The deliberate divergences**

| | Queue dispense | Quick deduct |
|---|---|---|
| Short stock | Partial hand-over, remainder stays Ready (companion D4) | Blocked, available amount named (D9) |
| Batch missing | Not dispensable | Deducts from the item total (D7) |
| Confirmation | Always shows the plan (companion D13) | Shows the plan read-only, then confirms |
| Undo | None (companion D12) | A short toast window (D8) |

Both differences are options on the shared service, not forks of it.

**Implementation order** — the companion spec's F13 (`saveRequest` parameter fix) and this spec's `source` column touch the same statement. Do them in one pass, then verify a create-and-restart before moving on: a wrong-by-one parameter list fails silently, and that is precisely the bug being fixed.

---

## 14. Acceptance criteria

1. `Ctrl+D` / `⌘D` from any screen opens the quick deduct modal, and does not open while typing in a field or stack on repeated presses.
2. The command palette offers `Deduct stock…` and opens the same modal.
3. The modal asks for an item and a quantity and nothing else; unit and category come from the item.
4. Confirming deducts exactly the requested quantity from the earliest-expiring batches, splitting across batches when one cannot cover it.
5. An item with no batch rows deducts from the item total and records an empty batch, without error.
6. An item whose only batches are expired or empty is refused rather than dispensed.
7. A quantity greater than stock on hand is refused with the available amount named, and nothing is written.
8. A `requests` row is created with `source = 'quick-deduct'`, lands in Claimed, shows a "Quick deduct" badge and "Walk-in", and auto-archives after 24 hours.
9. The deduction appears in the Dispensing Log and is counted by the Dashboard and Reports for today.
10. An audit entry records the deduction, and a second records the undo if it is reversed.
11. Undo inside the window restores the batch quantities — including reviving a batch deleted at zero — restores the item total and status, subtracts the day's dispensing total, and removes the created request.
12. No undo exists once the window closes, on any surface.
13. The toast names the resulting low or out-of-stock standing when the deduction crosses the threshold.
14. The existing 5-step stock-out wizard is unchanged and still reachable from Inventory, Low-Stock and Expiry.
15. The help docs, shortcuts modal and README document `Ctrl+D` alongside `Ctrl+N`.
16. `pnpm check-types` and `pnpm test:frontend` pass.
