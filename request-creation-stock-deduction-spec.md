# Spec — Request Creation & Automatic Stock Deduction

**Short name:** `request-creation-stock-deduction`
**Area:** `apps/desktop` — Request Queue (`features/requests`) + Inventory (`features/inventory`)
**Status:** Draft, awaiting implementation
**Author of request:** product owner
**Date:** 2026-09-17

---

## 1. The request, in the requester's words

> "theres a request queue, but theres no way to create queue when the customer is getting a product.. ctrl + n dont work and no ui, and no functions.. or what is the way when the stock is buyed so its will be deducted from the stock, not just stock in and stock out"

Two distinct problems, both confirmed against the code:

1. **There is no way to create a request.** `Ctrl+N` / `File → New Request…` silently navigates to the board instead of opening a form. No creation form, route, modal, or mutation exists anywhere in the app.
2. **Handing a product over does not deduct stock.** Dispensing a request writes a `dispensing_records` row and nothing else. The shelf, the batch, and the analytics tables are untouched, so staff have to go to Inventory and do a manual stock-out afterwards — which is exactly the "just stock in and stock out" the requester is complaining about.

---

## 2. Current state — audit findings

These are facts verified in the codebase, not assumptions. They shape the work. Referenced elsewhere in this document as **AF1–AF13** (audit findings) to keep them distinct from the **F1–F13** functional requirements in §6.

| # | Finding | Evidence |
|---|---------|----------|
| AF1 | `file.new-request` is configured with `Ctrl+N` but its action is `navigate` to `/admin/requests`. It opens the board, never a form. | `components/menubar/menu-config.ts:41-47` |
| AF2 | The in-app help and the shortcuts modal both document a New Request form that has never existed. | `features/help/components/docs/sections/requests.tsx:55-72`, `components/menubar/shortcuts-modal.tsx:26` |
| AF3 | The macOS native menu declares `CmdOrCtrl+N` as `file.new-request` and forwards it to the frontend — also unhandled. | `src-tauri/src/lib.rs:99`, `:229` |
| AF4 | `useRequestBoard.dispenseRequest` / `dispenseRequests` only attach a `DispensingRecord` and flip the status to `claimed`. No inventory write of any kind. | `features/requests/hooks/use-request-board.ts` (`dispenseRequest`, `dispenseRequests`) |
| AF5 | **Request persistence is silently dead.** `saveRequest` INSERTs into a `branch` column that does not exist on `requests` (it only exists on `audit_log`) and passes 13 parameters for 14 placeholders. The throw is swallowed by a bare `catch {}`, so the board appears to save and loses everything on restart. | `features/requests/persistence.ts:216-232`; schema at `src-tauri/migrations/0001_request_queue.sql`; `branch` only in `0004_inventory_creation.sql:47` |
| AF6 | **Dispensing is currently impossible.** `dispense-request-modal.tsx` imports the *sync* helpers `hasInventoryItem`, `batchOptionsFor`, `onHandFor`, which are hardcoded stubs returning `false` / `[]` / `0`. `canConfirm` is therefore permanently `false`. | `features/requests/stock.ts` (sync shims at the bottom), `components/dispense-request-modal.tsx:10-11` |
| AF7 | `dispense-batch-modal.tsx` uses the sync `checkStock` stub, which always returns `no-inventory-item` — so every request is listed as "Cannot be dispensed now". | `components/dispense-batch-modal.tsx:9-10`, `stock.ts` |
| AF8 | `ready → claimed` is an allowed transition, so **dragging** a card into Claimed bypasses dispensing entirely — no record, no deduction. | `features/requests/transitions.ts` (`ALLOWED_TRANSITIONS`), `components/requests-page.tsx` (`commitMove`) |
| AF9 | Two disconnected dispensing stores: `dispensing_records` (queue; one row per request, keyed by `request_id` PRIMARY KEY) and `dispensing_events` (daily analytics aggregate driving Dashboard + Reports). Inventory stock-out writes both; the queue writes neither. | `migrations/0001_request_queue.sql:48`, `migrations/0003_dispensing_events.sql`, `features/inventory/hooks/use-stock-mutations.ts` |
| AF10 | There is no request ID generator. IDs only ever appear as literals like `REQ-2026-0141` in comments, types and tests. | `features/requests/types.ts:65` |
| AF11 | A request holds exactly one medicine (`RequestItem.medicine: string`), while the help docs promise "pick the items and quantities" (plural). | `features/requests/types.ts` |
| AF12 | `reason` is NOT NULL in the schema and required in the type; `requestor_*` columns are all NOT NULL. | `migrations/0001_request_queue.sql:5-19` |
| AF13 | `requests.medicine` is free text, not a foreign key: an item is identified by comparing normalized strings, so renaming an item's display name silently detaches its request history. | `features/inventory/domain/medicine-match.ts` |

---

## 3. Goals

- G1 — A staff member can create a request **from anywhere** with `Ctrl+N` / `⌘N`, and it lands on the board and survives a restart.
- G2 — Handing a product to a customer **deducts the quantity from stock automatically**, from the real batch, and records it in the analytics tables.
- G3 — The dispense path works end to end (single, batch, and drag), replacing the dead sync stubs.
- G4 — Nothing about today's approval workflow is broken: Pending → Approved → Ready → Claimed and Deny all behave as before.

## 4. Non-goals

- N1 — No multi-item requests. A form with several medicines produces several cards (decision D5). The `RequestItem` shape stays one-medicine-per-card.
- N2 — No reservation of stock at Approve or Prepare. Stock moves at exactly one moment (decision D3).
- N3 — No undo for a dispense. It moves real stock (decision D12).
- N4 — No new write-failure surfacing UI. Persistence stays best-effort for now (see §12 risks).
- N5 — No customer-facing / kiosk surface. The form is staff-only.
- N6 — No test suite expansion beyond what existing suites require (decision D19).

---

## 5. Decisions taken in the interview

| ID | Decision | Value chosen |
|----|----------|--------------|
| D1 | Where creation lives | **Global modal on `Ctrl+N` / `⌘N`**, reachable from any screen |
| D2 | Who is the requestor | **Mostly anonymous — requestor is optional** |
| D3 | When stock leaves the shelf | **Only at `Dispense → Claimed`** |
| D4 | Behaviour when stock is short | **Allow partial dispense; the remainder stays in Ready to Claim** |
| D5 | Multi-item form | **Multiple items, split into one card each** |
| D6 | Starting status | **Pending by default, with an option to create straight into Ready to Claim** |
| D7 | Batch choice | **Automatic FEFO, no prompt** |
| D8 | Request ID | **Sequential per year — `REQ-2026-0001`, `REQ-2026-0002`, …** |
| D9 | The persistence bug | **Fix the statement only — drop `branch` from the INSERT** (no migration) |
| D10 | Analytics | **Deduct stock AND write a `dispensing_events` row** |
| D11 | Unknown medicine | **Block submission** — no matching inventory item means no request |
| D12 | Undo of a dispense | **None** — too risky for a stock movement |
| D13 | Hand-over confirmation | **A confirmation that shows the plan** before committing |
| D14 | Partial hand-overs | **Allow multiple `dispensing_records` rows per request** (migration relaxes the PK) |
| D15 | Drag into Claimed | **Runs the deduction**, identical to the menu action |
| D16 | The dead dispense path | **Fix it fully — dispensing works end to end**; the dead sync API is deleted |
| D17 | `reason` | **Optional now** |
| D18 | Low stock at creation | **Warn but allow** — a non-blocking inline hint |
| D19 | Cancel a request | **Yes — a Cancel that deletes a Pending request** |
| D20 | Docs | **Update the in-app help, shortcuts modal and README**, including the false claim that dispensing already deducts stock |
| D21 | Tests | **Minimal** — make it work; keep existing suites green |
| D22 | "Create into Ready to Claim" permission | **Anyone who can open the form** — it is a shortcut, not a permission |
| D23 | Anonymous storage | **Blank strings** — no migration; the UI renders empty as "Walk-in" |
| D24 | `unit` | **Defaulted from the matched inventory item, editable** |
| D25 | `category` | **Taken from the matched inventory item**, not hand-picked |

---

## 6. Functional specification

### F1 — New Request modal (`Ctrl+N`)

- A single modal component, mountable at app root so it opens from any route.
- Opened by:
  - the in-app menubar accelerator (`file.new-request`, `accelKeys: ["ctrl+n","meta+n"]`) — change its action from `navigate` to a modal action, e.g. `{ type: "modal", id: "new-request" }`, wired in `menu-config.ts` + `use-menu-actions.ts`;
  - the macOS native menu event already forwarded by `src-tauri/src/lib.rs` (`file.new-request`);
  - optionally the shortcuts modal entry that already advertises it.
- Must **not** fire while focus is in an `input`, `textarea`, `select` or contenteditable — reuse the existing `acceptsTypedText` guard from `requests-page.tsx`.
- Opening the modal must not navigate away from the current screen; on submit the user is told the request was created and offered "View on board" (navigate to `/admin/requests`).
- Escape closes; `Cmd/Ctrl+Enter` submits.
- Accessibility: `role="dialog"`, `aria-modal="true"`, labelled heading, focus moved to the first field on open and returned to the trigger on close, following the existing modal conventions (`dispense-request-modal.tsx`).

### F2 — Form fields

| Field | Required | Source / behaviour |
|-------|----------|--------------------|
| Medicine | Yes | Autocomplete over `inventory_items` (D11). Matches on the item's stored `display_name` first, then `name || ' ' || dosage`, then bare `name` — reuse `MEDICINE_WHERE_SQL` / `medicineMatchParams` from `features/inventory/domain/medicine-match.ts` (the stored label is authoritative because `requests.medicine` is matched textually — there is no foreign key, see AF13). |
| Quantity | Yes | Positive integer. Warn (non-blocking) when it exceeds what is on hand (D18). |
| Unit | Yes | **Prefilled from the matched item, editable** (D24). Default derived from the item's `form` / `pack_size`, drawn from the existing unit vocabulary (`tabs · caps · strip · pack · unit`). |
| Category | Yes | **Taken from the item, not editable** (D25) — guarantees the card's category matches what the board filters and reports expect. |
| Requestor name / ID / email | No | Free text (D2). Blank is a first-class value (D23). |
| Reason / purpose | No | Free text (D17). |
| Start in Ready to Claim | No | Toggle, default off (D6). Available to anyone who can open the form (D22). |

Submission rules:

- **Blocked** when the medicine has no matching inventory item (D11) — the primary action is disabled with an explanation, mirroring the "No matching inventory item" state already used in `dispense-request-modal.tsx`.
- **Blocked** when quantity is blank, zero, negative or non-numeric.
- **Allowed with a warning** when quantity exceeds stock on hand (D18). The hint names the shortfall; the request submits normally and can be partially dispensed later.
- Adding a second medicine row and submitting creates a second card (D5).

### F3 — Splitting multiple items into cards

- The form keeps a repeating list of item rows (medicine, qty, unit).
- On submit, **one `RequestItem` is produced per row** (D5). Each gets its own sequential ID, its own `StatusHistoryEntry` at submission, and its own row in `requests`.
- The shared requestor/reason/start-status values are copied onto each card.
- The success toast reports the count: "3 requests created".
- Rationale: the card, the kanban column, the dispensing record and the transition guards are all single-medicine today. Splitting keeps the schema, the drag engine and the batch toolbar untouched.

### F4 — Request IDs

- Format `REQ-<YYYY>-<NNNN>`, zero-padded to 4, sequential within the calendar year (D8).
- Derived from the highest existing ID for the current year (`SELECT id FROM requests WHERE id LIKE 'REQ-2026-%' ORDER BY id DESC LIMIT 1`), incremented, so the sequence survives restarts.
- Implemented as a pure, testable helper (e.g. `nextRequestId(existingIds: string[], year: number): string`) plus a thin DB-backed lookup.
- Rows created before the year rolls over keep their ID; a new year restarts the counter at `0001`.
- Defensive: if the derived ID already exists, advance until free (guards against two rapid creations racing).

### F5 — Create into Ready to Claim (fast path)

- With the toggle on (D6), the created card starts in `ready`, not `pending`.
- The card's history records the submission **and** the direct move, so the audit trail shows the skip rather than hiding it: `null → ready`, actor `You`.
- No approval is required, and no stock moves at creation — the deduction still happens at hand-over (D3).
- This exists so a counter hand-over for a walk-in customer does not require four clicks.

### F6 — Cancel a Pending request

- A **Cancel** action, offered only on `pending` cards (D19), in the card ⋯ menu and the detail modal footer (alongside `requestActions` / `primaryAction` in `transitions.ts`).
- It requires a confirmation step and states plainly that the request will be deleted (`destructive` variant, consistent with Deny).
- On confirm: delete the `requests` row; `request_history`, `request_notes` and any `dispensing_records` cascade away (`ON DELETE CASCADE` is already declared in `0001_request_queue.sql`).
- Not offered on any other column: Approved and Ready are cancellable via Deny (which keeps the audit trail), and Claimed/Denied are terminal.
- Bulk cancel is **out of scope** for this spec; the batch toolbar is unchanged.

### F7 — Stock deduction at hand-over (the core fix)

Stock moves at exactly one moment: the move into **Claimed** (D3). Implemented as a single shared service, not three copies — e.g. `features/requests/deduct-stock.ts`, called by the single dispense, the batch dispense and the drag-to-Claimed path (D16).

For each request being dispensed, in one transaction:

1. **Resolve the inventory item.** The form already blocks unknown medicines (F2/D11), but the service does not rely on that: an unmatched item fails the deduction loudly instead of silently doing nothing.
2. **Pick the batch by FEFO** (D7): earliest expiry first, expired batches excluded (the existing rule — dispensing expired medicine is the harm this must not enable). Expiry comes from `daysUntilExpiry` in `features/inventory/domain/expiry.ts`.
3. **Partial hand-over** (D4): take `min(requested, batchQty)` from the chosen batch. If the request is still short, continue to the next batch FEFO (this is what makes "3 from batch A, 2 from batch B" possible in one hand-over). The remainder stays on the card in Ready to Claim with a reduced `qty`.
4. **Decrement the batch** — `UPDATE inventory_batches SET qty = ? WHERE id = ?`, deleting the row when it hits zero. Reuse the semantics of `decrementBatch` in `features/inventory/hooks/use-stock-mutations.ts`.
5. **Decrement the item total** — `UPDATE inventory_items SET qty = ?, status = ?, needs_batch = ?, updated_at = ?`, deriving status through `deriveStatus(newQty, threshold)` and recomputing `needs_batch` from the remaining batch count, exactly as `useStockOutMutation` does.
6. **Write a `dispensing_records` row** for this hand-over (D14): `request_id`, `at`, the batch actually taken (or a comma-joined list when the quantity came from more than one batch), `expiry`, `qty` taken, `staff`.
7. **Write a `dispensing_events` row** (D10) — upsert on `(item_id, date)`, adding the quantity — so Dashboard and Reports count queue dispensing the same way they count inventory stock-outs. This is the fix for "the queue's dispensing is invisible to analytics".
8. **Write an audit entry** through `recordAudit` (`features/admin/audit/write-audit.ts`): action `stock-out`, before/after quantities, detail naming the medicine, quantity, batch and the request reference, `targetId` = item id, `bestEffort: true`.
9. **Invalidate queries** — `inventory_items`, `inventory_items_count`, `dashboard-stats` — so the inventory screens and dashboard reflect the deduction immediately.

Then, and only if steps 1–8 succeeded, the card moves to `claimed` with its history entry and (for a partial) its reduced `qty`.

**Ordering matters:** deduct first, move the card second. A card that says Claimed while the shelf still holds the stock is the bug being fixed; the reverse (deducted but card unmoved) is the safer failure.

### F8 — Hand-over confirmation showing the plan

- With FEFO automatic (D7) staff no longer choose a batch, so the confirmation is where they see what will happen (D13).
- The modal states, before committing: the medicine, the quantity being taken, the batch(es) and expiry that will be used, what will be left on the shelf afterwards, and — when the hand-over is partial — the amount remaining on the card and that the card stays in Ready to Claim.
- One primary action commits it; the existing modal visual language is reused (`materializeEnter`, `sheetSpring`, `.surface-frosted`).
- When nothing unusual is happening this is still shown — the decision is "always confirm", not "confirm only when surprising".

### F9 — Batch dispense

- `dispense-batch-modal.tsx` moves to the async stock check so its plan list is real (D16). The list keeps its current meaning: which requests *will* be dispensed and which cannot, named with the reason.
- Confirming runs the same deduction service per request. A partial that is blocked mid-list never silently disappears — the card stays where it is.
- Requests whose deduction fails are reported in the toast; the successful ones proceed (no all-or-nothing across a mixed selection).

### F10 — Drag into Claimed

- Dropping a Ready card into Claimed runs the deduction (D15) instead of the bare status flip it does today (AF8).
- Behaviour is identical to the menu action: same service, same confirmation plan, same history entry.
- The board's undo affordance must not offer to reverse it — see F12.

### F11 — Death of the sync stock API

- Delete the sync stubs `hasInventoryItem`, `onHandFor`, `batchOptionsFor`, `batchOptionsForSync`, `checkStock`, `checkStockSync`, `hasInventoryItemSync` from `features/requests/stock.ts` (D16).
- Migrate the two callers (`dispense-request-modal.tsx`, `dispense-batch-modal.tsx`) to `checkStockAsync` / `batchOptionsForAsync` / `onHandForAsync` via TanStack Query.
- `stockStateLabel` stays — it is pure and already correct.
- Rationale: these stubs are why dispensing cannot be confirmed today (AF6, AF7). Leaving them invites a future caller to reintroduce the bug.

### F12 — Undo boundaries

- Dispense is **not** undoable (D12). `undoLastMove` currently excludes dispense and deny because "both write audit records" — that reasoning now extends to stock.
- The undo toast must not be offered for a move into Claimed.
- The card's ⋯ menu continues to offer only `view` / `view-dispensing-record` on a claimed card (no reversal).

### F13 — Fix `saveRequest`

- Remove `branch` from the INSERT column list in `features/requests/persistence.ts` and correct the parameter list so 13 columns bind 13 values (D9, AF5).
- No migration: `requests` never needed a branch column, and `audit_log.branch` (default `'local'`) is a different table.
- The `ON CONFLICT(id) DO UPDATE` clause keeps working; the statement now actually persists.
- The surrounding best-effort `catch {}` **stays** (N4), but see §12 — this bug was invisible for exactly this reason.

---

## 7. Data model changes

Exactly one migration, appended as `0007_request_queue_dispensing.sql` (migrations are append-only — never edit a shipped file; see `src-tauri/src/lib.rs:19-21`).

```sql
-- Multiple hand-overs per request: a partial dispense is a real event.
-- dispensing_records was keyed one-row-per-request; recreate it keyed by row id.
CREATE TABLE IF NOT EXISTS dispensing_records_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  batch      TEXT NOT NULL,
  expiry     TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  staff      TEXT NOT NULL
);

INSERT INTO dispensing_records_new (request_id, at, batch, expiry, qty, staff)
  SELECT request_id, at, batch, expiry, qty, staff FROM dispensing_records;

DROP TABLE dispensing_records;
ALTER TABLE dispensing_records_new RENAME TO dispensing_records;

CREATE INDEX IF NOT EXISTS idx_dispensing_records_request
  ON dispensing_records (request_id, at);
```

- Register as migration version 7 in `db_migrations()` in `src-tauri/src/lib.rs`.
- No other schema change is needed: no new columns, no nullability change (D23 stores blanks, D17 keeps `reason` NOT NULL with `''`).

### Persistence-layer consequences

- `persistence.ts` reads `dispensing_records` as a **list per request**, not a single record. `assemble()` must map `Map<requestId, DispensingRecord[]>`.
- `RequestItem.dispensing?: DispensingRecord` becomes `dispensingRecords: DispensingRecord[]` (or keeps a derived `lastDispensing` for the card badge plus the full list for the detail view). **Recommended:** store the list, expose `dispensingRecords`, and let the card summarise the total dispensed.
- `saveRequest` currently upserts one dispensing record with `ON CONFLICT(request_id)`. With the PK relaxed that conflict target no longer exists — child rows must be written by delete-then-insert like history and notes, or deduplicated by `id`.
- The single-record assumption also appears in the detail modal and the card — both need a "2 hand-overs" / multiple-row rendering. `features/admin/dispensing` already models rows, so its shape is a good reference.

---

## 8. UX specification

- **Anonymous requests** (D2, D23): blank `requestor_name`, `requestor_id`, `requestor_email`. The card and detail view render **"Walk-in"** wherever a requestor name would appear, never an empty gap. Search by requestor skips anonymous cards (`use-request-filters` already filters on name/ID).
- **Unit** is editable per request (D24) so a "strip" of 10 and "10 tabs" can both be expressed.
- **Category** is not editable (D25) — it is whatever the item says.
- **Low-stock hint** at creation is advisory only (D18) and must not block the primary action.
- **Keyboard**: `Ctrl+N` / `⌘N` opens the form; `Esc` closes; `Cmd/Ctrl+Enter` submits. The modal must not steal `Ctrl+A`, which the board uses for select-all.
- **Feedback**: creating shows a toast naming the request reference(s); a partial dispense shows the remainder on the card and states the card stays in Ready to Claim; every structural change continues to write to the board's `aria-live="polite"` region.
- **Claimed cards** keep their existing 24-hour auto-archive behaviour (`CLAIMED_ARCHIVE_HOURS`); partial cards stay in Ready and are unaffected.

---

## 9. Edge cases to handle

| # | Case | Expected behaviour |
|---|------|--------------------|
| E1 | Medicine renamed or deleted after a request is created | The request keeps its stored text; deduction fails loudly at hand-over and the card names the reason. It never silently disappears. |
| E2 | All batches expired, or none on hand | No deduction is possible. Card stays in Ready to Claim; the confirmation explains it; deny or stock-in is the way out (matching `stockStateLabel`'s existing wording). |
| E3 | Request quantity exceeds total stock | Partial hand-over (D4). The remainder stays Ready with a reduced quantity, and the partial is its own `dispensing_records` row (D14). |
| E4 | Request spans two batches | One hand-over takes from both FEFO batches and records both in the dispensing record's batch field (plus one `dispensing_events` row for the total). |
| E5 | Two requests for the same medicine dispensed back to back | The second reads stock after the first committed. If it no longer fits, it becomes a partial rather than deducting below zero. |
| E6 | Batch quantity hits exactly zero | The batch row is deleted (matching `decrementBatch`), and `needs_batch` is recomputed from what is left. |
| E7 | Same-day second hand-over | `dispensing_events` upserts on `(item_id, date)` and adds — never inserts a duplicate day. |
| E8 | Creating three items in one form submission | Three cards, three sequential IDs, three `requests` rows, one shared toast. |
| E9 | Two rapid creations | IDs never collide (F4 defensive advance). |
| E10 | Year boundary | IDs restart at `REQ-2027-0001`; no renumbering of earlier requests. |
| E11 | Dispense attempted on a card that is not Ready | Guarded by `canMove` before the service runs, unchanged. |
| E12 | Drag dropped on a full batch | The refusal message replaces today's silent status flip. |
| E13 | Cancel on a Pending card mid-review | Deleted with its history/notes; the board announces the removal. |
| E14 | App restart after creating requests | Requests reload from SQLite (this is what F13 makes true). |
| E15 | Browser/dev environment with no Tauri shell | `getDb()` already degrades gracefully; the form must show a clear "cannot save here" state rather than a false success. |

---

## 10. Files expected to change

**New**
- `apps/desktop/src/features/requests/components/new-request-modal.tsx` — the form (F1, F2, F3, F5)
- `apps/desktop/src/features/requests/hooks/use-create-requests.ts` — validation + card construction + persist
- `apps/desktop/src/features/requests/request-id.ts` — `nextRequestId` (F4)
- `apps/desktop/src/features/requests/deduct-stock.ts` — the single shared deduction service (F7)
- `apps/desktop/src-tauri/migrations/0007_request_queue_dispensing.sql` — multiple dispensing records (D14, §7)
- Root-level mount for the modal (alongside the existing global modals in `components/` / `__root.tsx`)

**Changed**
- `features/requests/stock.ts` — delete the sync stubs (F11)
- `features/requests/components/dispense-request-modal.tsx` — async stock, FEFO plan, partial, multi-batch (F7, F8, AF6)
- `features/requests/components/dispense-batch-modal.tsx` — async plan, partial handling (F9)
- `features/requests/components/requests-page.tsx` — drag-to-Claimed deduction, dispense wiring, undo exclusion (F10, F12)
- `features/requests/hooks/use-request-board.ts` — call the deduction service; failure handling; no undo for Claimed
- `features/requests/persistence.ts` — drop `branch`, fix parameters (F13); list-valued dispensing records
- `features/requests/types.ts` — `dispensingRecords[]`, optional requestor/reason, `unit`/`category` notes
- `features/requests/transitions.ts` — Cancel action, and whatever the drag target needs (F6, F10)
- `features/requests/components/request-card.tsx` + `request-detail-modal.tsx` — "Walk-in", partial remainder, multiple hand-overs
- `components/menubar/menu-config.ts` + `use-menu-actions.ts` — `file.new-request` opens the modal
- `features/help/components/docs/sections/requests.tsx` — correct the submit flow, and the false claim that dispensing already deducts stock and asks for a batch (D20)
- `components/menubar/shortcuts-modal.tsx`, `README.md` — align with shipped behaviour (D20)
- `src-tauri/src/lib.rs` — register migration 7

---

## 11. Verification

- `pnpm check-types` clean.
- `pnpm test:frontend` green — existing suites already cover the board (`use-request-board.test.ts`), transitions (`transitions.test.ts`), filters and the card; they must not regress. The partial-dispense change alters `dispenseRequest`'s contract, so `use-request-board.test.ts` needs updating where it asserts a single record.
- `pnpm check` / `pnpm fix` (Ultracite) clean.
- Manual walkthrough in `pnpm desktop:dev`:
  1. `Ctrl+N` from the Dashboard opens the form.
  2. Create a request for an in-stock medicine → card lands in Pending, reference `REQ-2026-0001`.
  3. Restart the app → the card is still there (proves F13).
  4. Create a walk-in request with the Ready toggle → card lands in Ready, requestor shown as "Walk-in".
  5. Ready → Dispense → confirm the plan → card lands in Claimed.
  6. Inventory now shows the reduced quantity, with the batch decremented or removed and the status recomputed.
  7. Dashboard and Reports count the hand-over.
  8. Request 5 of an item with 3 on hand → partial: 3 dispensed, card stays Ready showing 2.
  9. Drag a Ready card into Claimed → the plan appears and stock drops.
- Per D21 the test additions stay minimal: the ID generator, the FEFO/partial selection logic and the deduction service against `src/test/fake-db.ts` are the highest-value targets if any are added.

---

## 12. Risks and follow-ups (recorded, not solved here)

- **Silent persistence failures.** AF5 was invisible because `saveRequest`'s catch swallows everything. Decision D9 fixes the statement but keeps the swallow (N4). A wrong-column or wrong-arity mistake can regress in exactly the same way. Strong candidate for a follow-up.
- **`requests.medicine` is matched textually**, not by foreign key (AF13 / `medicine-match.ts`). Every quantity change to an item's display name silently detaches its request history. Out of scope, but the reason E1 exists.
- **`dispensing_events` is a daily aggregate only.** Per-batch detail for analytics comes from `dispensing_records`; the two stores must stay written together, or reports will disagree with the log.
- **Partial dispense and the 24-hour archive.** A card that is partly dispensed stays in Ready indefinitely; only fully handed-over cards auto-archive. Worth watching in practice.
- **Cancel is destructive** (D19) with no trash record, unlike inventory deletion which has `trash_records`. Consider reusing that pattern if a "deleted in error" request ever comes up.
- **Two routes share the board** (`admin.requests` and the staff mount noted in `requests-page.tsx`). The modal is route-independent, but the post-submit "View on board" target must stay correct for both.
- **Denied cards** still accumulate on the board with no purge. Untouched by this spec.

---

## 13. Acceptance criteria

1. `Ctrl+N` / `⌘N` (and `File → New Request…`, and the macOS native menu item) opens a New Request form from any screen, and does not open while typing in a field.
2. A request created for a stocked medicine appears on the board in Pending and **still exists after an app restart**.
3. Creating three medicine rows produces three cards with sequential per-year references.
4. A medicine with no matching inventory item cannot be submitted.
5. A request in Ready can be dispensed, and `inventory_items.qty` and the relevant `inventory_batches` row drop by the dispensed amount; the item status is recomputed.
6. A hand-over is recorded in `dispensing_records` **and** in `dispensing_events`, and shows on the Dashboard and Dispensing Log.
7. A request for more than is on hand is partially dispensed: the shelf goes to zero for what exists, and the card stays in Ready to Claim showing the outstanding amount.
8. Dragging a Ready card into Claimed deducts stock exactly as the menu action does.
9. A claimed card offers no undo and no reversal of the stock movement.
10. The card and detail view show "Walk-in" for an anonymous request, and every hand-over for a partially dispensed request.
11. Creating a request with the Ready toggle lands it directly in Ready to Claim with the skip visible in its history.
12. A Pending request can be cancelled (deleted) with confirmation; no other column offers Cancel.
13. The help docs, shortcuts modal and README describe what the app actually does.
14. `pnpm check-types` and `pnpm test:frontend` pass.
