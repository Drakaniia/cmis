/**
 * The one normalizer for "does this medicine text name this inventory item?"
 * (stock-detail-modal-spec §11.1, decision 19).
 *
 * Request and dispensing rows store the medicine as free text, so an item is
 * identified by comparing normalised strings rather than by a foreign key. The
 * comparison has two directions and they must not drift apart:
 *
 * - `MEDICINE_WHERE_SQL` — the stored text is the item's own `name`/`dosage`
 *   and the bound value is the medicine string from a request. Used by the
 *   stock checks in `features/requests/stock.ts`.
 * - `REQUEST_MEDICINE_WHERE_SQL` — the stored text is the request's
 *   (`requests.medicine`) and the bound value is the item's display name. Used
 *   by the dispensing history query.
 *
 * Both normalise identically (`lower(trim(...))`) and both compare the item
 * against the stored display label, which is why they belong together: the
 * history query reports on the same matches the stock checks make.
 */

/**
 * The inventory-side predicate. Binds `medicineMatchParams(medicine)`.
 *
 * The stored `display_name` is checked **first**: it is the canonical label
 * (decision 18) and the strength backfill fills it for every row, including the
 * imported ones, so a request's medicine text resolves even when the strength
 * columns disagree about slots.
 *
 * The two legacy branches stay as fallbacks. `name || ' ' || dosage` is how this
 * app composed a medicine before the split, and the bare `name` is what rows
 * written before it still hold — with the `dosage` column deferred rather than
 * dropped (spec §6.2 option B), both remain valid for old data.
 */
export const MEDICINE_WHERE_SQL =
  "lower(trim(display_name)) = lower(trim(?)) OR lower(trim(name || ' ' || dosage)) = lower(trim(?)) OR lower(trim(name)) = lower(trim(?))";

/** The request-side mirror of {@link MEDICINE_WHERE_SQL}. Binds the item's display name. */
export const REQUEST_MEDICINE_WHERE_SQL =
  "lower(trim(r.medicine)) = lower(trim(?))";

/** The three `?` values `MEDICINE_WHERE_SQL` binds. */
export function medicineMatchParams(
  medicine: string
): [string, string, string] {
  return [medicine, medicine, medicine];
}

/** The single `?` value `REQUEST_MEDICINE_WHERE_SQL` binds. */
export function requestMedicineParams(displayName: string): [string] {
  return [displayName.trim()];
}
