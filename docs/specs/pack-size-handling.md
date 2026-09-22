# Spec — Pack Size & Dosage Handling (base units vs packs)

**Short name:** `pack-size-handling`
**Area:** `apps/desktop` — Inventory item model, stock-in, request units, dispensing math, export/import, reports
**Status:** Draft, awaiting implementation
**Related:** [`quick-stock-deduct.md`](./quick-stock-deduct.md) (shares the deduction service `features/requests/deduct-stock.ts`), the strength-fields work (`migrations/0004`, `0005`, `domain/strength.ts`)
**Date:** 2026-09-21

---

## 1. The request, in the requester's words

> "how can we handle in the dosage if for example, 600 mg sachet (10/box), its separate. mg each and each has a box, some is 100mg tabs"

What this resolves to, after the interview:

1. **Stock is counted in singles, but the world speaks in boxes.** A `600 mg sachet` arrives as a box of 10. The shelf knows "100 sachets"; a request says "2 box". Today the request's `2` is compared against `100` and two sachets leave the shelf.
2. **`(10/box)` is decoration.** It is free text in `pack_size`, rendered into the label and part of the medicine's identity — and read by **no calculation anywhere**.
3. **Different strengths must stay apart.** `600 mg sachet` and `100 mg tab` are already separate products (identity already includes strength, form and pack size). That behaviour is correct and is preserved, not changed.
4. **Both directions have to convert.** Deliveries come in boxes (stock-in), hand-overs go out in boxes (requests/dispensing), and the shelf is always kept in singles.

So: one item per medicine + strength + form + pack; the **dose form is the base unit**; **one** pack multiple (`pack_qty` + `pack_unit`) sits on the item; every surface converts to base units before it touches stock, and renders the mixed form when it shows a number.

5. **The reference dataset is real, and it is the doctor's.** The clinic's original is `AUGUST 2026 inventory.xlsx` (three sheets, one free-text `DOSAGE` column per medication) and row 2 of it is the request's own example — `Acetylcysteine` · `600 mg sachet (10/box)`. The app imports a derived single-sheet copy (`… - august r - TEMPLATE FORMAT.xlsx`, 85 medications). Both are **read-only inputs**: nothing here ever edits them (PK26–PK30, N7). §2 and §11 pin exactly what an import plus backfill must do.
6. **The Low-Stock alert has to say what the level is.** Once a number can mean either unit, a bare `20 / 20` is ambiguous — so the alert states it in both (§F11).

---

## 2. Current state — relevant findings

| # | Finding | Evidence |
|---|---------|----------|
| PK1 | `inventory_items.pack_size` is `TEXT NOT NULL DEFAULT ''` and is **free text**, not a number. | `src-tauri/migrations/0004_inventory_creation.sql` (strength/form columns block) |
| PK2 | The codebase's own canonical example of a pack label is literally the one in the request: `600 mg sachet (10/box)`. | `features/inventory/import/csv-parser.test.ts:325` — `expected: "600 mg sachet (10/box)"` |
| PK3 | Nothing reads `pack_size` for arithmetic. It is rendered into `display_name` (`composeDisplayName`) and participates in identity (`identityKey`), and that is all. | `domain/strength.ts` (`composeDisplayName`), `domain/identity.ts` (`identityKey`, `identityLabelKey`) |
| PK4 | The UI type documents it as a bare token — `Pack size token, e.g. "10". May be blank.` — while real data is `(100/box)`, `(100/tab)`, `60ml`, `120 ml`, `(10/box)`. The shape is not actually consistent. | `features/inventory/types.ts:88`, `csv-parser.test.ts` fixtures (`"(100/box)"`, `"120 ml"`, `"60ml"`, `"(10/box)"`) |
| PK5 | The request unit vocabulary is fixed and has **no `box` and no `sachet`**: `tabs · caps · strip · pack · unit`. A `sachet` item's requests are pre-filled as `pack`. | `features/requests/request-units.ts:10`, `UNIT_BY_FORM` (line 31) |
| PK6 | A request stores `qty INTEGER` + `unit TEXT` and nothing else; there is no second, canonical quantity. | `src-tauri/migrations/0001_request_queue.sql` (`requests`), `features/requests/types.ts:118-119` |
| PK7 | Stock is a **single integer** in both places, with no unit column: `inventory_items.qty` and `inventory_batches.qty`. | `0002_inventory.sql`, `0004`/`0005` (no unit columns added) |
| PK8 | The stock check compares the request's number to shelf numbers **directly, with no conversion**: `take = Math.min(item.qty, dispensable)`. | `features/requests/stock.ts` (`checkStockAsync`) |
| PK9 | The deduction already writes the take in whatever unit the caller passed, straight into the batch and the daily aggregate. | `features/requests/deduct-stock.ts` (`decrementBatch`, `recordDispensing`), `domain/deduct-plan.ts` |
| PK10 | `MEDICINE_FORMS` already contains `box` and `piece` as dose forms, which collides with a `pack_unit` of `box`. | `domain/vocabulary.ts` (`MEDICINE_FORMS`) |
| PK11 | Dispensing is already multi-hand-over per request, and partial hand-overs are a normal outcome with a remainder left on the card. | `migrations/0007_request_queue_dispensing.sql`, `stock.ts` (`state: "partial"`), `deduct-plan.ts` |
| PK12 | The export/import template is a **fixed 41 columns**, parsed positionally with named index constants, and warns on a column-count mismatch. `pack_size` is column index 4. **Amended** by [`stock-report-export-spec.md`](./stock-report-export-spec.md) (E2/E3/E5): the day block follows the selected month, so the width is **`12 + D` columns** for `D` = 28–31 days (**40–43**), and the importer derives `D` from the header rather than assuming 31. | `import/csv-parser.ts` (`buildInventoryTemplateHeaders`, `detectLayout`, `COL_STOCK_ON_HAND = 5`), `import/import.ts` (INSERT column list at line 481), `import/migrations.test.ts:87` |
| PK13 | Identity is the five parts joined — `name`, `strength_value`, `strength_unit`, `form`, `pack_size` — as both a canonical and a label key, plus a legacy `name + dosage` fallback before the backfill has run. **Changing the text of `pack_size` changes identity.** | `domain/identity.ts`, `features/inventory/creation/draft.ts` (`identityKeysOf`) |
| PK14 | `dosage_missing` was repurposed to mean **"details incomplete"** = any of the four strength parts blank. | `0005_strength_fields.sql` comment, `domain/strength.ts` (`isDetailsIncomplete`) |
| PK15 | A run-once startup backfill splits legacy `dosage` into the four strength columns, guarded by an `app_meta` row so it never runs twice. The old `dosage` column is dropped by the backfill after it reads it. | `0005_strength_fields.sql` (spec §6.2 option A / §6.3), `features/inventory/data/strength-backfill.ts`, `features/inventory/creation/identity.ts` (reads `dosage` as fallback) |
| PK16 | Migrations are **append-only** and registered by version in Rust. Eleven exist (0001–0011), so the next free version is **0012**. | `src-tauri/migrations/`, `src-tauri/src/lib.rs` (`db_migrations()`) |
| PK17 | Analytics count quantity in the unit the deduction wrote, out of `dispensing_events` (`(item_id, date)` aggregate); Low-Stock compares `qty` against the item's own `threshold`. | `deduct-stock.ts` (`recordDispensing`), `domain/low-stock.ts`, `0002_inventory.sql` (`threshold INTEGER NOT NULL DEFAULT 20`) |
| PK18 | The quick-deduct surface has **no unit field at all** — a plain number — while its plan line already shows unit wording. | `quick-stock-deduct.md` §F2 ("Unit — **Not asked**. Taken silently from the item"), `components/quick-deduct-modal.tsx` |
| PK19 | **The reference dataset is in the repo.** The derived August 2026 workbook the importer already ships an end-to-end test for holds **85 medications**, and column E (`pack_size`) is the column this feature has to survive. | `AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx` (repo root), `import/august-2026-import.test.ts` (85 rows, 134 events, real SQLite engine) |
| PK20 | Row 2 of that derived workbook **is the request's own example**: `Acetylcysteine` · `600` · `mg` · `sachet` · `(10/box)`. | `sheet1.xml`, row 2 (`A2`–`E2`) |
| PK21 | Across its 85 `pack_size` cells: **44** carry a `(N/box)` group, **1** is `(100/tab)` (a real number with the container named as the dose form), **5** are the `N’s` idiom (`20’s`, `100’s`, `(30’s)`, `(25’s)`), **15** are bulk/liquid or injection prose (`60ml suspension`, `for injection`, `mg/325mg tab`), and **20** are blank. | counted from the workbook's `xl/worksheets/sheet1.xml`; §11 pins the numbers as a test |
| PK22 | **4 of the 44 `(N/box)` cells have a blank `form` and carry the group after other text** — `mg tab (30/box)`, `Flavored Sachet (30/box)`, `mg/ 30 mg cap (30/box)`, and a bare `(35/box)`. A parse anchored to the start of the cell would miss the first three. | rows 52, 66, 67, 19 |
| PK23 | The workbook's form column is not clean either: casing varies (`Caps`, `Vial`, `Suspension`) and one row's form is **`piece/bx`**, which is not in `MEDICINE_FORMS` at all. | rows 62, 83, 84 …; `domain/vocabulary.ts` |
| PK24 | The workbook is read by the `xlsx` library (`utils.sheet_to_csv`), which **decodes XML entities** — `100&#8217;s` reaches the app as `100’s` (a curly apostrophe). The `N’s` rule must match the decoded text. | `import/xlsx-parser.ts` (`inventoryXlsxToCsv`) |
| PK25 | The Low-Stock row already shows a level, but **unitlessly**: a meter, `20 / 20`, a bare threshold, a bare gap and a bare reorder suggestion — none of which say whether the number is sachets, tablets or boxes. | `components/low-stock-list.tsx` (`QuantityBar`, `GapDisplay`, `rowAriaLabel`), `domain/low-stock.ts` (`calculateSuggestedQty`) |
| PK26 | **The clinic's original workbook is `AUGUST 2026 inventory.xlsx`** — three sheets (`july`, `august r`, `AUGUST`) whose columns are `NAME OF MEDICATION`, **`DOSAGE` (one free-text cell)**, `stock on hand`, days 1–31, `total dispensed`, `stock remaining`. Strength, form **and pack all live in that single `DOSAGE` cell**: row 2 is `Acetylcysteine` → `600 mg sachet (10/box)`, row 3 is `Allopurinol` → `100mg tabs`. It is **source data from the doctor and is read-only**. | `AUGUST 2026 inventory.xlsx` (`xl/workbook.xml`, `xl/sharedStrings.xml` indices 0–3) |
| PK27 | The file the app actually imports is a **derived** workbook — `AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx`: single sheet, 41 columns, inline strings. There is **no converter in the repo**, so the split from `DOSAGE` into `strength_value` / `strength_unit` / `form` / `pack_size` is a step outside the app. | the two workbooks side by side; `import/xlsx-parser.ts` |
| PK28 | **`pack_size` is the split's leftover bucket, not a pack column.** `splitDosage` keeps anything the fixed vocabularies cannot place "verbatim in the last slot it could belong to rather than dropped" — which is exactly why the column holds `mg tab (30/box)`, `100’s`, `60ml suspension` and `for injection` (PK21). Reading it as pack data is reading a bucket. | `domain/strength.ts` (`splitDosage` — the `packSize = form.rest` line and the module note) |
| PK29 | The app imports `workbook.SheetNames[0]`. For the original three-sheet workbook that is **`july`**, not the August grid — so **the original cannot be imported as-is**; the derived single-sheet file is what the pipeline feeds it. | `import/xlsx-parser.ts` (`const [firstSheetName] = workbook.SheetNames`), `import-month.ts` (reads the month out of the *file name*, "AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx") |
| PK30 | **Nothing in the app writes the source workbook.** The only xlsx writer is the app's own export (`export-xlsx.ts`), which produces a separate file. | `import/export-xlsx.ts`, `admin/data/components/export-card.tsx` |

---

## 3. Goals

- **G1 — One item per medicine + strength + form + pack.** `600 mg sachet (10/box)` stays one row; `100 mg tab` is a different row. Nothing merges, nothing splits.
- **G2 — One multiplier, stored once.** `pack_qty` + `pack_unit` on the item; the **dose form is the base unit** (`sachet`, `tab`, `cap`, …) that `inventory_items.qty` and `inventory_batches.qty` count in.
- **G3 — Convert at the edges, store base units in the middle.** Requests and stock-in may be *written* in boxes; the shelf, the batches, the dispensing records and `dispensing_events` are **always base units**.
- **G4 — Render so a human can check the number.** `2 box (20 sachet)` wherever a conversion happened, so a mis-key is visible rather than silent.
- **G5 — No regression to identity, the 41-column round-trip, or existing stock arithmetic.** Existing SKUs, `display_name`s, thresholds and reports keep their meanings.

## 4. Non-goals

- **N1 — No nested packaging.** One level only: base unit → one pack. A box of 10 strips of 10 tabs is out of scope (D22).
- **N2 — No cross-strength grouping.** `600 mg sachet` and `100 mg tab` are not linked, listed, or rolled up together anywhere (D16).
- **N3 — No merging of existing duplicates.** If a database already holds two near-identical rows, this spec does not reconcile them.
- **N4 — No conversion for bulk measures.** `120 ml syrup`, `15 g ointment` have no meaningful pack multiple; their pack fields stay blank and no conversion is attempted (E6).
- **N5 — No "opened box" entity.** Breaking bulk leaves no separate loose-stock bucket; base units are base units.
- **N6 — No change to the `threshold` column's meaning** (it stays base units, D13) or to status derivation, `needs_batch`, FEFO order, or the partial-hand-over rule.
- **N7 — The clinic's workbook is never modified.** `AUGUST 2026 inventory.xlsx` and every file derived from it are read-only inputs. Nothing in this spec asks the doctor, or the clinic, to clean up a `DOSAGE` cell, rename a container, or re-export — the app reads what it is given (PK26, PK30, D31).
- **N8 — No guessing a container.** `100’s` never becomes `box` by inference, and a prose cell never becomes a number (§F1 rule 4, D28).
- **N9 — No converter.** Turning the multi-sheet original into the 41-column template is an existing step outside the app (PK27); this spec does not add, remove or automate it, and does not claim the original imports directly (PK29).

---

## 5. Decisions taken in the interview

| ID | Decision | Value chosen |
|----|----------|--------------|
| D1 | The pain being solved | **Stock is counted per sachet/tablet while orders and deliveries come in boxes — the numbers never line up** |
| D2 | Item model | **One item**: the dose form is the base unit, the box size is a multiplier stored on it |
| D3 | Scope | **All six surfaces**: item fields, dispensing math, request units, display labels, import/export, reports |
| D4 | `pack_qty` / `pack_unit` storage | **New columns beside the existing free-text `pack_size`**; the pair is what math reads, the text stays for display/identity |
| D5 | Base unit of stock | **The dose form in `form`** (`sachet`, `tab`, `cap`, …) — derived, no new base-unit column |
| D6 | Backfill of existing pack text | **Conservative** — parse only unambiguous `(N/unit)`; leave everything else alone and flag it for review |
| D7 | Template columns | **`pack_qty` + `pack_unit` become real template columns**; the parser must keep accepting the old 41-column files |
| D8 | Request unit field | **Item-aware dropdown**: the base unit (from `form`) plus the item's `pack_unit` |
| D9 | Dispensing math | **Convert to base units at the stock check** — `2 box × 10 = 20 sachets` is what the batch and the item lose |
| D10 | Box request on an item with a blank pack | **Block**, and offer to dispense in base units instead |
| D11 | What the log/receipt shows | **Store base units; render `2 box (20 sachet)`** in the log, detail and toast |
| D12 | Stock-in direction | **Type a number + unit** (`5` `box` → 50 base units stored) |
| D13 | Threshold unit | **Base units** (`20` means 20 sachets); the Low-Stock page may render a pack equivalent when it divides evenly |
| D14 | Reports and analytics | **Base units, always** — 2 boxes counts as 20 so trends stay comparable |
| D15 | `form = box` collision | **Discourage**: if `form` is `box`, the pack fields must be empty and the box is itself the base unit |
| D16 | Different strengths | **Stay fully separate items; nothing changes** |
| D17 | Pack vocabulary | **One shared vocabulary** — `box · strip · pack · carton · bottle · tube` — read by both the item form and the request unit list |
| D18 | Identity | **The structured pack stays part of identity** — `(10/box)` and `(30/box)` remain two products |
| D19 | Repack while stock exists | **Allowed** with an audit entry; existing stock is left alone |
| D20 | Requiredness | **Optional but flagged**: a pack-forming item (`sachet`, `tab`, `cap`, …) with a blank pack reads as "details incomplete" |
| D21 | Bulk liquids | No pack fields, no conversion, no flag (see N4) |
| D22 | Packaging depth | **One level only** (N1) |
| D23 | Short quantity on a box request | **Hand over what is there as loose base units** and keep the remainder outstanding — the existing partial rule (PK11) |
| D24 | The `pack_size` text mirror | **Derived on write** — the forms write `10/box` from the pair so labels, identity and export are unchanged |
| D25 | Rollout | **One piece**: migration + item fields + request units + dispensing math + reports together |
| D26 | Column placement in the template | **Append the two new columns to the end** (`pack_qty`, `pack_unit`), leaving every existing index constant untouched (§7.4) |
| D27 | Where the parse looks for the group | **Anywhere in the cell**, not only at the start — the real workbook has `mg tab (30/box)` (PK22). Leftover text is preserved verbatim and ignored by arithmetic |
| D28 | A number whose container is unstated — `100’s`, `(30’s)`, `(100/tab)` | **Parse the number, leave `pack_unit` blank, flag the row for review** — never assume `box` from `100’s`, and never set `pack_unit` to the base unit. 6 rows in the reference workbook |
| D29 | What the Low-Stock alert shows | **The level in both units** — `20 sachet (2 box)` in the Current cell, base units on the meter/threshold/gap, and the reorder suggestion offered in packs (F11) |
| D30 | A pack with no dose form | **Valid** — `(35/box)` with a blank `form` still fills the pair; the base unit falls back to `unit` until a form is recorded, and the row is flagged |
| D31 | The source workbook | **Read-only, always.** Ambiguity is surfaced as a review flag in the app; the clinic's file is never edited, and no pack cleanup is ever asked of the doctor (N7) |
| D32 | What the backfill reads | **`pack_size` as a leftover bucket** (PK28): look for a `(N/container)` group, and if the cell is prose or a strength/form fragment, infer nothing and flag the row. No independent re-parsing of the original `DOSAGE` text |

---

## 6. Functional specification

### F1 — The conversion module (new, pure)

`features/inventory/domain/pack-size.ts` — the single place the multiplier is interpreted, so the item form, the request form, the deduction and the reports cannot disagree.

```ts
export interface PackParts {
  packQty: number | string;   // "10" from a form, 10 from a row, "" when untyped
  packUnit: string;           // "box"
}

/** The multiple a pack stands for. 1 when unknown or meaningless. */
export function packFactor(item: PackParts): number;

/** True when the pair is usable for arithmetic: qty is an integer > 1 and the unit is non-blank. */
export function hasPack(item: PackParts): boolean;

/** Is this unit the pack unit, the base unit, or neither? */
export function unitKind(unit: string, item: {form: string; packUnit: string}): "base" | "pack" | "unknown";

/** Chosen unit + typed qty → base units. `null` when the conversion cannot be made. */
export function toBaseUnits(qty: number, unit: string, item): number | null;

/** The rendered mixed form: `2 box (20 sachet)`, or `20 sachet` when there is no pack. */
export function describeQuantity(baseQty: number, item): string;

/** `10/box` — the derived `pack_size` text (D24). */
export function packSizeText(parts: PackParts): string;

/**
 * The conservative parse for the backfill.
 *
 *   `"(10/box)"`      → `{ qty: 10, unit: "box" }`   (container named)
 *   `"mg tab (30/box)"` → `{ qty: 30, unit: "box" }` (group matched anywhere, D27)
 *   `"100’s"`         → `{ qty: 100, unit: "" }`     (container unstated → flag, D28)
 *   `"(100/tab)"`     → `{ qty: 100, unit: "" }`     (container unstated → flag, D28)
 *   `"60ml suspension"`, `"for injection"` → `null`   (leave the row alone, flag it)
 */
export function parsePackSize(text: string): { qty: number; unit: string } | null;
```

Rules the module must hold:

1. **`packFactor` returns 1 when the pair is unusable** — blank qty, blank unit, non-integer qty, qty ≤ 0, or qty 1. A factor of 1 means "no conversion happens", never "multiply by nothing".
2. **`toBaseUnits` returns `null` rather than guessing** when the requested unit cannot be placed. That `null` is what F5's block is made of — the module never silently treats a box as a single (that is the ×10 bug being fixed).
3. **`describeQuantity` never invents precision.** `13` base units with a factor of 10 renders `13 sachet` (or `1 box + 3 sachet` — see OQ3), never `1.3 box`, unless the caller asks for the decimal form.
4. **`parsePackSize` is deliberate about the token after the slash**, and its result is a pair *or* a "number only":
   - **container token** (`box`, `strip`, `pack`, `carton`, `bottle`, `tube`, `vial`, `ampule`, `nebule`) → `{ qty: N, unit: token }`, no review flag. The group is matched **anywhere in the cell** (D27), so `mg tab (30/box)` parses.
   - **dose-form token** (`100/tab`, `(30’s)`, `20’s`) → the number is real but the **container is unstated**, so the result is `{ qty: N, unit: "" }`: `pack_qty` is filled, `pack_unit` stays blank, and the row is flagged for review (D28). The `pack_unit` is **never** set to the base unit — that would make `unitKind` unable to tell a pack word from a base word.
   - **anything else** (`60ml`, `120 ml`, a decimal, a second measure, prose) → `null` = leave the row completely alone and flag it (D6).

### F2 — Inventory item fields

- `InventoryItem` (`features/inventory/types.ts`) gains `packQty: number` and `packUnit: string`; `packSize` stays as the rendered text.
- `ProductDraft` (`creation/draft.ts`) gains the same pair; `newProductDraft()` seeds `packQty: ""`, `packUnit: ""`.
- `IdentityInput` / `identityKeysOf` need no change: identity keeps reading the **text** field, which the writers now derive from the pair (D24). This is what keeps `identityKey` byte-compatible (PK13).
- Read/write happens in `hooks/use-inventory-items.ts`, `creation/commit-creation.ts`, `hooks/use-stock-mutations.ts` and `domain/item-update.ts` alongside the existing `pack_size` handling.

### F3 — The item form (new product, edit panel, stock-in wizard, delivery sheet)

- A **pack quantity** number input and a **pack unit** select (the shared vocabulary, D17) sit next to the existing pack-size display.
- The pack-size text field becomes **read-only/derived**: it shows `10/box` from the pair (D24). Where a row's text cannot be parsed and the pair is blank, the text is shown but the row is flagged (F9).
- Validation (§F7) runs in `creation/validate-draft.ts`, `components/stock-in-wizard/validation.ts` and `domain/item-update.ts`, so the wizard, the sheet, the new-product form and the edit panel all refuse the same shapes.
- Paste/import of a grid (`creation/paste.ts`) gains `packQty` / `packUnit` columns; the paste column map is the one place a header name is bound to a field, so it is updated rather than forked.

### F4 — Stock-in converts into base units

- The delivery sheet's quantity cell (`add-inventory/delivery-sheet/batch-row.tsx`) and the wizard's quantity step get a **unit toggle beside the number**: the base unit and the item's `pack_unit`.
- While typing, the cell shows the conversion beneath it: `5 box` → `= 50 sachet` (D12). The value **stored** is 50; the batch row, the item total and `needs_batch` are all base units as they are today.
- Without a usable pack (blank pair), the toggle offers only the base unit, and the box option is disabled with the reason shown.
- A batch is never stored in mixed units: the conversion happens before the row is committed, so `inventory_batches.qty` keeps its current single-number meaning.

### F5 — Requests written in packs

- `features/requests/request-units.ts` gains an **item-aware** unit list: `requestUnitsFor(item)` returns the base unit from `form` (via the existing `UNIT_BY_FORM`, extended) followed by the item's `pack_unit` (D8). The fixed `REQUEST_UNITS` list stays as the fallback for a row with no selected item.
- `new-request-modal.tsx` re-derives the row's unit whenever the medicine changes, using the existing `defaultUnitForItem` seam (line 236) so the prefill behaviour is preserved.
- **`qty` means whatever unit is selected.** The request row keeps `qty` + `unit` as written (no arithmetic in the form).
- **Conversion happens at the stock check.** `checkStockAsync` (`features/requests/stock.ts`) and `planDeduction` (`deduct-stock.ts`) resolve the item, call `toBaseUnits(qty, unit, item)` and plan against base units from then on. `planDeduct` (`domain/deduct-plan.ts`) is untouched — it already receives base-unit numbers.
- **When the conversion returns `null`** (`2 box` on an item with a blank pack, or a unit that is neither the base unit nor the pack unit), the check returns a distinct state and the dispense modal **blocks** with: *"This item has no pack size recorded, so 2 box cannot be converted. Dispense in sachet instead, or set the pack size in Inventory."* plus a one-click "Dispense 2 sachet instead" affordance if the requested number is still plausible (D10).
- `StockState` gains `"pack-unknown"` alongside `no-inventory-item` / `no-batch` / `ok` / `partial`, and `stockStateLabel` renders it.
- **Partial hand-overs keep working** (D23): a `1 box` request on 7 remaining sachets takes 7 and leaves 3 outstanding. The remainder is expressed in base units on the card (OQ3 covers the exact wording).

### F6 — What a hand-over writes

Unchanged in schema, changed in meaning — because everything is base units now:

| Write | Value |
|-------|-------|
| `dispensing_records.qty` | Base units taken (`20`) |
| `inventory_batches.qty` decrement | Base units per FEFO take |
| `inventory_items.qty` | Base units, with `status`/`needs_batch` recomputed as today |
| `dispensing_events.qty` | Base units (D14) — so Dashboard and Reports compare apples to apples (PK17) |
| `audit_log.detail` | Mixed wording: `Dispensed 20 sachet (2 box) on request REQ-2026-0042 …` |

### F7 — Validation rules

| # | Rule | Where |
|---|------|-------|
| V1 | `pack_unit` set but `pack_qty` blank / 0 / negative / non-integer → **error** | creation, edit panel, wizard |
| V2 | `pack_qty` > 1 but `pack_unit` blank → **error** (a bare multiple is meaningless) | creation, edit panel, wizard |
| V3 | `pack_qty = 1` → **allowed, warned**: "a pack of 1 is the same as the base unit" | creation |
| V4 | `form` is `box` **and** the pack pair is set → **error** (D15) | creation, edit panel |
| V5 | `form` is a bulk form (`syrup`, `suspension`, `susp`, `ointment`, `cream`, `gel`, `lotion`, `solution`, `spray`, `drops`) → **warn only** when a pack is set | creation |
| V6 | `pack_unit` not in the shared vocabulary → **error** in the form; on import, folded to `""` with a warning | creation, import |
| V7 | A pack-forming item (`sachet`, `tab`, `tabs`, `tablet`, `cap`, `caps`, `capsule`, `piece`) with a blank pack → **flagged "details incomplete"**, never blocked (D20) | `isDetailsIncomplete` |

**On V7 and the blast radius:** today `isDetailsIncomplete` means "one of the four strength parts is blank" and drives `dosage_missing` (PK14). Extending it to include the pack for pack-forming forms changes what that flag means for **existing** rows and for the lists/filters that read it. Either that extension is made and the lists accept more "incomplete" rows, or a second flag is introduced. See **OQ4**.

### F8 — Display and rendering

- **Item lists** (`inventory-list.tsx`, `low-stock-list.tsx`, `expiry-list.tsx`, `stock-detail-modal.tsx`): the Name cell keeps `composeListLabel` (`Paracetamol 500 mg`) and the pack is rendered in its existing column as `10/box`. No new columns.
- **Item detail** (`inventory-detail.tsx`): a `Pack` row reading `10 box` (or the derived text), plus `Stock as base units: 100 sachet`.
- **Request card / detail**: `2 box (20 sachet)` whenever the row's unit is the pack unit, so the number on the card matches the shelf (G4). The existing `{item.qty} {item.unit}` renders (`request-card.tsx:70`, `request-detail-modal.tsx:280`) go through one shared helper instead of string interpolation.
- **Dispense modal** (`dispense-request-modal.tsx`): the plan line names both, e.g. `20 sachet (2 box) from batch B-4412 (exp 2027-01) · 30 sachet left on the shelf`.
- **Dispensing Log** (`features/admin/dispensing/*`): the Quantity cell renders `20 sachet (2 box)`; the expanded detail keeps the batch/expiry rows as they are. Search and export follow — the export writes the base number **and** the mixed label (OQ5).
- **Toasts** (`use-request-board.ts`, quick deduct): `Dispensed 20 sachet (2 box) — 3 sachet still outstanding`.
- **Low-Stock page**: `2 box (20 sachet) left, at or below its threshold of 20 sachet` when the pack divides evenly, base units alone otherwise (D13).
- **Reports** (`top-dispensed-table.tsx`, `usage-donut-widget.tsx`, `stock-movement-widget.tsx`): numbers stay base units (D14); a pack-equivalent hint appears in the widget detail/table caption, not in the plotted value.
- **Quick deduct** (`quick-deduct-modal.tsx`, `use-quick-deduct.ts`): the form has no unit field (PK18), so its number stays **base units**; the plan line adds the pack equivalent (`10 sachet = 1 box`) and the item search results show `10/box` beside the name so the number being typed is unambiguous.

### F9 — `detailsIncomplete` and the "needs review" path

- The conservative backfill (F10) records every row it could not parse in a report with **two lists — `numbered` (a number with no container: `100’s`) and `unreadable` (prose: `60ml suspension`)**.
- It surfaces exactly the way the existing strength backfill does: run once from the root route's context (`routes/__root.tsx` → `ensureStrengthBackfill()`), then a toast that reports the count and points at Stock Management for the review. The pack version is `ensurePackSizeBackfill()`, a second entry in the same context with its own toast, so the two reports cannot be confused with each other.
- Those rows remain usable in every flow that does not need a conversion; only a **pack-worded request or stock-in** is blocked (D10).

### F10 — Backfill

- A new pure module `features/inventory/data/pack-size-backfill.ts`, modelled on `strength-backfill.ts`.
- **It reads a leftover bucket, not a pack column** (PK28): the cell it parses is `splitDosage`'s "kept verbatim in the last slot it could belong to" output. So the backfill's job is to spot a recognizable `(N/container)` group inside whatever landed there (D32) — never to assume the cell *is* a pack size. A row the splitter already marked `uncertain` is a strong candidate for a flag.
- Steps:
  - reads `id, form, pack_size, pack_qty, pack_unit` from `inventory_items`;
  - for a row with an empty pair, tries `parsePackSize(pack_size)` (F1 rule 4);
  - when the container is named, writes the pair **and leaves `pack_size` exactly as it was** — rewriting the text would change every identity key built from that row (PK13);
  - when only the number is readable (`100’s`, `(100/tab)`), writes `pack_qty` alone, leaves `pack_unit` blank, and reports the row as **"container not stated"** (D28);
  - on failure, writes nothing and reports the row (`{ id, name, packSize, reason }`) for review;
  - records itself in `app_meta` under a new key (e.g. `pack_size_backfill`) so it never runs twice (PK15).
- Because the strength backfill may drop the legacy `dosage` column, the pack backfill must not depend on `dosage` — it reads `pack_size`, `form` and `name` only.
- **Expected outcomes on the reference workbook (PK21), which §11 pins as a test:**

  | Input shape | Rows | Backfill result |
  |---|---|---|
  | `(100/box)`, `(10/box)`, `(30/box)`, `(35/box)` — including the three with blank forms and leading text | **44** | pair filled (`qty` + `box`); text left byte-identical; no review flag |
  | `(100/tab)`, `20’s`, `100’s`, `(30’s)`, `(25’s)` | **6** | number filled, `pack_unit` blank, flagged for review (D28) |
  | `60ml suspension`, `for injection`, `mg/325mg tab`, … | **15** | untouched, flagged; text and identity unchanged |
  | no pack cell at all | **20** | untouched, blank, not flagged as pack-incomplete unless the form is pack-forming (V7) |

### F11 — The Low-Stock alert must say what the level is

"Show the level of each stock clearly" is a requirement of this spec, not a nicety: the moment a quantity can be read in two units, a bare `20 / 20` in the Current column is ambiguous — 20 of **what**? (PK25)

| Element | Today | After |
|---|---|---|
| Current cell (`QuantityBar`) | meter + `20 / 20` | meter (base units) + `20 sachet (2 box)` — or `13 sachet (1 box + 3 sachet)` when it does not divide evenly |
| Meter `aria-label` / `aria-valuenow` / `aria-valuemax` | `20 of 20 threshold` | same numbers, unit named: `20 of 20 sachet threshold` |
| Threshold cell | `20` | `20 sachet` — the stored value and its meaning are unchanged (D13) |
| Gap cell (`GapDisplay`) | `-5` / `+3` / `Out` | `-5 sachet` / `+3 sachet` / `Out` |
| Reorder action + suggestion | a bare number from `calculateSuggestedQty` | offered in packs: `Order 2 box (20 sachet)` when the suggestion divides evenly, base units otherwise; the stored value stays base units |
| Row `aria-label` (`LowStockRowItem`) | `… 20 on hand, threshold 20, 5 below threshold …` | the same sentence with units: `… 20 sachet (2 box) on hand, threshold 20 sachet, 5 sachet below threshold …` |
| Item cell | `Paracetamol 500 mg` (`composeListLabel`) | **unchanged** — the pack lives in the quantity cells, not in the name; no new columns (F8) |
| Status badge / edge bar / sorting / filters | base units | **unchanged** |

Rules:

1. **Every number keeps its stored base-unit value.** Only the rendering gains the pack parenthetical — so sorting (`LowStockSortKey.qty`, `threshold`, `gap`), the meter's proportions, the status classification and the low-stock filters cannot change because of a label.
2. **The parenthetical appears only when the item has a usable pack** (F1 `hasPack`) and only when it helps: exact multiples render `2 box`; a remainder renders `1 box + 3 sachet`, never `1.3 box` (F1 rule 3).
3. **A pack-less or incomplete item renders base units alone** plus its existing incomplete marker — the alert never hides or defers a low item for a data-quality reason (D20).
4. The same rendering is shared with the Inventory list, the item detail sheet and the expiry list, through one helper (`describeQuantity`) rather than four string interpolations.

---

## 7. Data model changes

### 7.1 `inventory_items`

```sql
-- 0012_pack_size_fields.sql
ALTER TABLE inventory_items ADD COLUMN pack_qty  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN pack_unit TEXT    NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_inventory_pack ON inventory_items (pack_qty, pack_unit);
```

- `pack_qty = 0` means **not recorded** (the same convention as the blank strings around it); a value of 2 or more means the pair is usable. `pack_qty = 1` is stored as written and warned about (V3).
- No `CHECK` constraint, matching the table's existing style — validation is the application's job (V1–V7) and an import must be able to land a legacy row regardless.
- **No unit column for stock.** The base unit is derived from `form` (D5); adding a column nobody edits would create a second source of truth for the same fact.
- **No change to `inventory_batches`.** Batches hold base units, as they already do.

### 7.2 `requests`

**No schema change is planned by default.** The row keeps `qty` + `unit` as written, and the deduction converts (D9). This is what makes a live card's meaning depend on the item's *current* pack size rather than the one it was written under — see **OQ1**, where persisting a base quantity on the request is the alternative.

### 7.3 Migration mechanics

- New file `apps/desktop/src-tauri/migrations/0012_pack_size_fields.sql`, registered as version **12** in `db_migrations()` (`src-tauri/src/lib.rs`).
- Append-only: 0001–0011 are shipped and must not be edited (PK16).
- The backfill is a **separate, run-once step** at startup (F10), not part of the migration — migrations run in Rust before any JavaScript, and the parser it needs is TypeScript (same reasoning as `0005_strength_fields.sql`'s comment).

### 7.4 Export / import template

- The template grows from 41 to **43 columns**: `pack_qty` and `pack_unit` are **appended after `supplier`** (indices 41 and 42), so:
  - `EXPECTED_COLUMNS` becomes `41 | 43` (both accepted, any other count warns exactly as it does today, PK12);
  - every existing positional constant (`COL_STOCK_ON_HAND = 5` … `COL_SUPPLIER = 40`) is unchanged, so a 41-column file parses byte-identically and the 33 daily columns keep their offsets;
  - the 43-column writer stays self-consistent and its header row names the two new columns.
- `INVENTORY_TEMPLATE_HEADERS` gains the two names; `import/types.ts` (`ParsedInventoryRow`) gains `packQty` / `packUnit`; `import.ts`'s INSERT column list (line 481) and `export-xlsx.ts` gain them; `migrations.test.ts`'s expected-column assertion (line 87) is updated.
- The shipped asset `docs/public/inventory - TEMPLATE.xlsx` is re-exported with the two columns and the count documented in the help docs.
- **Amended by [`stock-report-export-spec.md`](./stock-report-export-spec.md) (E2/E3/E5):** the day block is no longer fixed at 31. A file is **`12 + D` columns** for `D` = 28–31 day columns — **40–43** — where the trailing pair is `pack_qty` / `pack_unit`. `buildInventoryTemplateHeaders(days)` is the single shape authority for both the writer and the importer; `detectLayout` derives `D` from the header (`total_dispensed` marks the days' end), and the legacy 41-column file and the 31-day 43-column file still parse byte-identically. The shipped asset demonstrates the widest month (**31 days, 43 columns**); the app's Stock Report export varies the day block with the report's month picker.

---

## 8. UX specification

- **Pack fields** sit directly under the existing strength/form fields, in the same two-column rhythm the strength block already uses (`components/add-inventory/fields.tsx`, `stock-in-wizard/steps/step-details.tsx`).
- **The derived text is visible next to the pair** (`10` + `box` → `10/box`) so the operator sees exactly what the label will say — and, where the pair is empty and the stored text cannot be parsed, the text is shown with a "not structured" hint instead of being silently blank.
- **Unit toggles** (stock-in, request row) are the same segmented/select control the request form already uses for units — no new control vocabulary.
- **Live conversion text** (`= 50 sachet`) uses the muted caption style already used for helper text under form fields.
- **Wording is always "pack (base)" or "base (pack)"**, never a bare converted number, on every surface that shows a quantity (G4).
- **Accessibility:** the unit toggle and the pack inputs are labelled (`for`/`id` pairing as the existing fields do); the conversion line is a `polite` live region so a screen reader hears `= 50 sachet` as it changes; the block message (F5) is announced, not only shown.
- **Never block on the counter for a data-quality reason**: a pack-forming item with no pack is flagged in Inventory but is still dispensed in base units (D20, F5's alternative action).

---

## 9. Edge cases

| # | Case | Expected behaviour |
|---|------|--------------------|
| E1 | `600 mg sachet (10/box)`, 100 sachets on hand, request `2 box` | Item total and batches lose **20**; log/receipt reads `20 sachet (2 box)`; 80 left. |
| E2 | Same item, request `3 sachet` | Base-unit wording; 3 deducted; no pack arithmetic, no "0.3 box" anywhere. |
| E3 | Same item, request `1 box`, only 7 sachets left | 7 taken loose, 3 outstanding on the card (D23); wording per OQ3; nothing blocks. |
| E4 | `2 box` on an item whose pack pair is blank | Blocked with the D10 message and a "Dispense 2 sachet instead" action. **Nothing is written.** |
| E5 | `2 box` where the pack file says `10 sachet` but the request's unit is `strip` (neither base nor pack) | Blocked as in E4 — the unit cannot be placed. |
| E6 | `120 ml syrup`, request `1 unit` | No pack exists; base unit is `unit`; behaves exactly as today. |
| E7 | `(100/tab)` text, backfill could not parse it | Pair stays blank, row reported for review, text unchanged so identity is unchanged. |
| E8 | `form = box` with a pack set | Validation error in the form (V4); an imported row that does this is flagged, not rejected. |
| E9 | `pack_qty = 1` | Allowed with a warning (V3); `packFactor` treats it as 1, so nothing double-counts. |
| E10 | Repack `10/box` → `30/box` with stock on the shelf | Allowed, audited, existing stock untouched (D19). Existing dispensing records already hold base units and stay correct. |
| E11 | Repack while a card is sitting in Approved written as `1 box` | The card re-reads the new factor at dispense time (no `qty_base` persisted — §7.2/OQ1). **Known consequence, flagged in OQ1.** |
| E12 | Quick deduct on a box item | Number is base units (PK18); plan line shows the pack equivalent; toast renders `20 sachet (2 box)`. |
| E13 | Stock-in `5 box` on a 10/box item | 50 stored on the batch and the item; the conversion line confirmed it before submit. |
| E14 | A batch of 3.5 boxes (35 sachets) | Batches hold whole base units; a non-integer base quantity is a validation error, as today. |
| E15 | Two pack units on one item (e.g. `box` and `strip`) | Not supported — one pack per item (N1/D22). The form offers one pack unit. |
| E16 | Pack unit typed with different casing/whitespace (`Box `) | Normalized against the shared vocabulary; a value outside it errors in the form (V6). |
| E17 | An item whose pack text and pair disagree after a hand-edit or an import | The pair wins for arithmetic; the text wins for identity and display. Reported by the backfill only where it can tell. |
| E18 | Item deleted after a request was written in packs | Unchanged: the request keeps its `qty`/`unit` text and dispenses as a no-inventory-item refusal, exactly as today. |
| E19 | A 43-column file imported into an older build | The older build warns on the column count exactly as it does today (PK12) and imports the first 41 — data loss is visible, not silent. |
| E20 | Threshold `20` on a 10/box item, 20 sachets left | Low stock; the page may read `2 box (20 sachet) left, at or below its threshold of 20 sachet` (D13). |
| E21 | Reports for a month where the item was repacked mid-month | Totals stay comparable because every day was counted in base units (D14). |
| E22 | `mg tab (30/box)` — a real workbook row with a blank `form` and text before the group | The pair fills `30` + `box`, because the group is matched anywhere (D27); the text is unchanged; the base unit is `unit` until a form is recorded and the row is flagged (D30). |
| E23 | `100’s`, `(30’s)`, `(100/tab)` — real workbook idioms | The number is parsed (`100`, `30`, `100`), `pack_unit` stays blank, the row is flagged (D28). A request written in `pack`/`box` is blocked until the container is named; base-unit requests work normally. |
| E24 | `60ml suspension`, `for injection`, `mg/325mg tab` — real workbook prose | Not parsed; row flagged; text, `display_name`, SKU and identity key all unchanged (E7). |
| E25 | `piece/bx` — a real workbook form value that is not in `MEDICINE_FORMS` | Treated as an unknown form (base unit `unit`, row flagged); the form picker must not silently rewrite it on save, only offer to fix it (PK23). |
| E26 | 13 sachets left on a 10/box low-stock item | The alert reads `13 sachet (1 box + 3 sachet)`; the meter, threshold and gap stay base units; the reorder suggestion renders in packs when it divides evenly (F11). |
| E27 | A low-stock item with no usable pack | The alert renders base units alone with the existing incomplete marker; nothing about its level is hidden (F11 rule 3). |

---

## 10. Files expected to change

**New**

- `apps/desktop/src-tauri/migrations/0012_pack_size_fields.sql` — §7.1
- `apps/desktop/src/features/inventory/domain/pack-size.ts` — the conversion module (F1)
- `apps/desktop/src/features/inventory/domain/pack-size.test.ts` — factor, conversion, describe, parse, the `null` paths
- `apps/desktop/src/features/inventory/data/pack-size-backfill.ts` + `.test.ts` — conservative backfill and its report (F10)

**Changed — schema, Rust & startup**

- `apps/desktop/src-tauri/src/lib.rs` — register version 12 in `db_migrations()`
- `apps/desktop/src/routes/__root.tsx` — run the pack backfill beside `ensureStrengthBackfill()` in the route context and report its two review lists in a toast (F9/F10)

**Changed — inventory domain & data**

- `features/inventory/types.ts` — `packQty`, `packUnit` on `InventoryItem`; `StockInPayload` gains the unit actually entered
- `features/inventory/domain/strength.ts` — `isDetailsIncomplete` (subject to OQ4), and a helper that renders `pack_size` from the pair
- `features/inventory/domain/vocabulary.ts` — the shared pack vocabulary (D17)
- `features/inventory/domain/item-update.ts` — validate and persist the pair; audit the repack (D19)
- `features/inventory/creation/draft.ts`, `commit-creation.ts`, `validate-draft.ts`, `paste.ts`, `sheet-types.ts`, `sheet-defaults.ts`, `identity.ts` — draft fields, validation, paste columns, identity read (`pack_size` fallback)
- `features/inventory/hooks/use-inventory-items.ts`, `use-stock-mutations.ts`, `use-item-update.ts`, `use-creation.ts` — read/write the pair; stock-in converts (F4)
- `features/inventory/data/create-item-with-batch.ts`, `strength-backfill.ts` (shared startup wiring)

**Changed — inventory UI**

- `components/add-inventory/new-product-form.tsx`, `fields.tsx`, `delivery-sheet/group-row.tsx`, `delivery-sheet/batch-row.tsx`, `sheet-cells.tsx`, `sheet-defaults-strip.tsx`
- `components/stock-in-wizard/steps/step-details.tsx`, `spec/step-review.tsx`, `types.ts`, `constants.ts`, `validation.ts`
- `components/item-edit-panel.tsx`, `inventory-detail.tsx`, `inventory-list.tsx`, `low-stock-list.tsx`, `low-stock-page.tsx`, `expiry-list.tsx`, `stock-detail-modal.tsx`
- `components/quick-deduct-modal.tsx`, `hooks/use-quick-deduct.ts` — plan line and search results (F8)

**Changed — requests & dispensing**

- `features/requests/request-units.ts` — item-aware list (F5)
- `features/requests/components/new-request-modal.tsx` — unit derived from the selected item
- `features/requests/stock.ts` — `pack-unknown` state, conversion before planning, `stockStateLabel`
- `features/requests/deduct-stock.ts` — convert, audit wording, snapshot unit clarity
- `features/requests/components/dispense-request-modal.tsx`, `dispense-batch-modal.tsx`, `request-card.tsx`, `request-detail-modal.tsx`, `hooks/use-request-board.ts` — mixed rendering (F8)
- `features/inventory/domain/deduct-plan.ts` — untouched arithmetic; only its inputs are guaranteed base units now

**Changed — admin, reports & docs**

- `features/admin/dispensing/rows.ts`, `export-dispensing.ts`, `components/dispensing-row-detail.tsx` — mixed rendering and export
- `features/admin/analytics/components/top-dispensed-table.tsx`, `usage-donut-widget.tsx`, `stock-movement-widget.tsx` — base units with a pack hint (D14) (moved from `features/admin/reports/` in the stock-level-report spec; the deleted `export-reports.ts`'s stock section is succeeded by the Stock Report's Pack hint column, `features/admin/reports/stock-level-rows.ts`)
- `features/help/components/docs/sections/stock.tsx`, `dispensing.tsx` (+ the requests section) — explain base units vs packs in plain language
- `README.md`, `docs/public/inventory - TEMPLATE.xlsx`

**Changed — import/export**

- `features/inventory/import/csv-parser.ts` (headers, 41|43 tolerance, two new cells), `xlsx-parser.ts`, `import.ts` (read + INSERT), `export-xlsx.ts`, `types.ts`, and the matching tests (`csv-parser.test.ts`, `xlsx-parser.test.ts`, `export-xlsx.test.ts`, `import.test.ts`, `migrations.test.ts`, `strength-round-trip.test.ts`)

---

## 11. Verification

Automated:

- `pnpm check-types` clean; `pnpm test:frontend` green.
- `pnpm dlx ultracite check` clean (then `fix`).
- New unit coverage, at minimum: `pack-size.test.ts` (factor edge cases: blank, 0, 1, non-integer; `toBaseUnits` returning `null` for an unknown unit; `describeQuantity` for 7/10/13/20; `parsePackSize` for each fixture already in the repo — `(100/box)`, `(10/box)`, `(100/tab)`, `60ml`, `120 ml`), `pack-size-backfill.test.ts`, and the deduction tests in `deduct-stock.test.ts` extended with a box-wording request.
- Round-trip: `strength-round-trip.test.ts` and `import.test.ts` must prove that a 43-column export re-imports with **zero inserts** against a database created by the same build, and that a 41-column legacy file still parses.
- **Pinned workbook numbers (PK19–PK21).** Feeding `AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx` through the backfill must yield exactly **44 paired · 6 flagged-with-a-number · 15 unparseable flagged · 20 blank** out of 85 items, while the existing `august-2026-import.test.ts` expectations (85 items, 134 dispensing events, 85 distinct SKUs, the `Acetylcysteine` and `Atenolol` row values) stay green — proof that filling the pair changes no stored `pack_size` text, display name, SKU or identity key.
- **Low-Stock rendering:** a rendered-row test over `low-stock-list.tsx` asserting the Current cell reads `20 sachet (2 box)`, a remainder reads `1 box + 3 sachet`, and the meter's `aria-valuenow`/`aria-valuemax` are still the base-unit numbers (F11).

Manual walkthrough in `pnpm desktop:dev`:

1. Create `Paracetamol 600 mg sachet`, pack `10` `box`; the label reads `Paracetamol 600 mg sachet 10/box`.
2. Stock in `5 box`; the row shows `= 50 sachet` and Inventory reads 50 with `10/box`.
3. Create a second product `Paracetamol 100 mg tab`; the two stay separate rows with separate SKUs and stock.
4. Request `2 box` and dispense: stock drops by 20; the card, log, toast and receipt all read `20 sachet (2 box)`.
5. Request `3 sachet` on the same item and dispense: 3 deducted, wording stays in base units.
6. Request `1 box` with 7 left: 7 handed over, 3 outstanding on the card, nothing errors.
7. Request `2 box` on an item with a blank pack: blocked with the message, and the "dispense in base units" action works.
8. Set `form = box` and a pack: rejected by the form.
9. Edit the pack from `10/box` to `30/box`: allowed, an audit entry exists, existing stock is unchanged.
10. Quick deduct 10 on the box item: plan line shows `= 1 box`, toast reads `10 sachet (1 box)`.
11. Low-Stock page and Reports: the item appears with base-unit numbers and a pack hint; the threshold still reads as 20 sachet.
12. Export to xlsx (43 columns), wipe, re-import: identical items, no duplicates, no `details incomplete` regressions.
13. Resume a pre-change database (a copy with legacy `pack_size` text): the backfill pairs `(100/box)` rows, reports `60ml` rows, and identity keys do not shift (no duplicate items appear).
14. **Read-only on the source (N7/D31):** hash both workbooks before and after a full import + backfill run and confirm the hashes are unchanged — the app never writes to the clinic's file, and resolving a flagged pack is possible entirely inside the app.

---

## 12. Risks and follow-ups

- **Identity is coupled to `pack_size` text.** Any writer that renders the label differently (`10/box` vs `10 / box` vs `box of 10`) silently creates a second product. The mitigation is F1's `packSizeText` being the only writer and the conservative backfill never rewriting text — but a hand-typed import file can still introduce drift, and the importer's identity keys are the only thing standing between that and duplicates.
- **`isDetailsIncomplete` is shared.** Extending it to the pack (V7) changes a flag that other surfaces already trust. OQ4 has to be settled before implementation, not during.
- **Two request unit vocabularies in one list.** `REQUEST_UNITS` already holds `strip` and `pack`, while the item vocabulary holds `box`/`strip`/`pack`/`carton`/`bottle`/`tube`. Two words can mean the same container depending on which list the operator is looking at (OQ6).
- **Repack mid-flight.** Without a persisted base quantity on the request (OQ1), a card written as `1 box` read after a repack means something different from when it was written. The audit trail survives (base units are recorded at dispense), but the card's promise does not.
- **Partially-fulfilled box requests** have no tidy render (OQ3). `0.3 box` is ugly; `3 sachet` loses the pack framing; `1 box + 3 sachet` is a lie about the remainder.
- **Analytics are unweighted.** Counting base units makes 20 sachets comparable to 20 tablets, which is right for the shelf and arguably wrong for clinical volume (20 sachets ≠ 20 doses if the sachet is a 3-day course). Out of scope, worth revisiting in Reports.
- **The pack data's real provenance is an untested manual step.** The doctor's workbook carries `DOSAGE` as one free-text cell (PK26); a conversion outside the app splits it into the four columns, and `pack_size` catches whatever the vocabularies could not place (PK28). Nothing in the repo tests that conversion, so this spec's 44/6/15/20 split (PK21) is a property of *the derived file*, not of the clinic's sheet — a different month, or a different person doing the split, produces different leftovers. This is the strongest argument for the app's parse being conservative (D32) and for the flag being a review prompt rather than an error.
- **The original workbook cannot be imported as it stands.** The app takes `SheetNames[0]`, which for `AUGUST 2026 inventory.xlsx` is `july` (PK29), and it expects 41 columns rather than 3 sheets of `NAME OF MEDICATION` / `DOSAGE` / days. Reading the clinic's own file directly (a sheet picker, a `DOSAGE`-native import path) is a real opportunity but **deliberately out of scope here** (N9) — and it must never come at the cost of writing to the file.
- **The `detailsIncomplete`/pack-flag noise is small but real.** In the reference workbook, about **9 rows** are pack-forming with an unusable pack (5 number-only rows on `tab`/`tabs`, 4 blank on `tabs`/`caps`/`piece/bx`), so extending the existing flag (V7/OQ4) adds roughly 9–12 flagged rows out of 85 — tolerable, and the 15 prose rows are vials, ampules and suspensions, which are not pack-forming and stay unflagged. A different clinic's workbook could look worse; the flag is a review prompt, never a blocker.
- **Barcodes are not pack-aware.** A supplier's box barcode and its single-sachet barcode are different symbols pointing at one item. `barcode-input.tsx` / `use-barcode-wedge.ts` know nothing about packaging; a scan-to-stock-in future would need to decide which one it got.
- **The 41→43 growth is a one-way door for old builds.** An older binary importing a 43-column file drops the last two columns and warns (E19). Acceptable, but the help docs must tell operators not to move a new export to an older install.

### Open questions (one decision each, cheap to settle)

- **OQ1 — Convert at dispense time, or persist a base quantity on the request?** §7.2 keeps `requests` unchanged and converts at the stock check (D9 as chosen). Persisting `qty_base` at creation would make a live card immune to a later repack (E11) at the cost of one more column and a small write-path change. **The chosen answer was "convert at the stock check"; this asks whether that includes persisting the converted number.**
- **OQ2 — Template column placement.** D26 appends the two columns after `supplier` to avoid shifting 37 existing index constants. Inserting them logically after `pack_size` reads better in the sheet but requires a column-count-aware offset map for every existing constant.
- **OQ3 — How does a partially-fulfilled box request read?** `3 sachet still waiting` (base units, plain), `0.3 box still waiting` (fractional), or `3 sachet (0.3 box) still waiting` (mixed).
- **OQ4 — Do the pack fields join `detailsIncomplete`?** D20 says yes for pack-forming forms. The alternative is a separate flag (`packMissing`) so `dosage_missing` keeps its current meaning and no existing filter changes behaviour.
- **OQ5 — What does the Dispensing Log export write for quantity?** One numeric column in base units (sortable, analysable) plus a text "as dispensed" column, or a single mixed string (human, unsortable).
- **OQ6 — Does `REQUEST_UNITS` keep `strip` and `pack` once the item's `pack_unit` exists?** Keeping both means the request form can offer `pack` for one item and `box` for another meaning the same thing; dropping them means legacy rows with `unit = 'strip'` need a `toRequestUnit` fallback that still reads them.

---

## 13. Acceptance criteria

1. An inventory item can record a pack quantity and unit; the label (`display_name`) and the stored `pack_size` text read `10/box` without any manual text entry.
2. `inventory_items.qty` and `inventory_batches.qty` remain a single integer, and it always means **base units** (the dose form) for every item.
3. Stock-in accepts a quantity in packs and stores the converted base quantity, with the conversion visible before submit.
4. The request form offers the item's base unit and its pack unit, and a request written in packs is converted to base units before any stock moves.
5. A pack-worded request on an item with no usable pack size is blocked with a message naming the item and offering a base-unit alternative; nothing is written.
6. A completed hand-over records base units in `dispensing_records`, `dispensing_events`, the item and the batches, and renders `2 box (20 sachet)` on the card, in the log, in the receipt and in the toast.
7. A partially-available box request hands over the base units available and leaves the remainder outstanding on the card, exactly as a base-unit partial does today.
8. The quick-deduct surface keeps counting in base units and shows the pack equivalent in its plan line.
9. Requirements, Status, `needs_batch`, FEFO order and the low-stock rule are unchanged in behaviour; `threshold` remains base units and the Low-Stock page may render a pack equivalent only when it divides evenly.
10. Reports and the Dashboard count base units, so a month containing a repack stays internally comparable.
11. `form = box` with a pack is rejected by the item forms; a pack-forming item with no pack is flagged, never blocked.
12. `600 mg sachet (10/box)` and `100 mg tab` remain separate items, separate SKUs, separate stock — no merging, no grouping.
13. The conservative backfill pairs every unambiguous `(N/unit)` row, leaves the `pack_size` text byte-identical, reports what it could not parse, and never runs twice.
14. The xlsx template round-trips at 43 columns (export → import inserts nothing) and still parses legacy 41-column files without shifting any existing column.
15. Identity keys are unchanged for existing rows: after the migration and backfill, a re-import of the same data creates no duplicates.
16. `pnpm check-types` and `pnpm test:frontend` pass, and Ultracite is clean.
17. The Low-Stock alert states the unit on every number it shows: the Current cell reads `20 sachet (2 box)` (and `1 box + 3 sachet` for a remainder), the threshold cell reads `20 sachet`, the gap reads `-5 sachet`, the meter's accessible label names the unit, and the reorder suggestion is offered in packs — while the stored values, sorting, filtering and the meter's proportions remain base units (F11).
18. Importing `AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx` still produces 85 items, 134 dispensing events, 85 distinct SKUs and the same display names as before the change, and its backfill run reports the 44 / 6 / 15 / 20 split (PK21).
19. An unreadable pack — `100’s`, `60ml suspension`, or `mg tab (30/box)`'s blank form — never blocks a base-unit request and never silently becomes a factor of 1 (`packFactor` returns 1, but `toBaseUnits` for a pack-worded request returns `null`, which blocks with the D10 message).
20. **The clinic's workbook is untouched.** An import run leaves `AUGUST 2026 inventory.xlsx` and the derived `- TEMPLATE FORMAT.xlsx` byte-identical (verified by checksum before and after), the app never prompts the clinic to edit a `DOSAGE` cell, and no resolution of an ambiguous pack requires a change to either file (N7, D31).
21. Ambiguous pack data is resolvable inside the app — the operator can name the container for a flagged item (e.g. `100’s` → `100` + `box`) without editing any workbook — and until they do, that item is fully usable in base units.
