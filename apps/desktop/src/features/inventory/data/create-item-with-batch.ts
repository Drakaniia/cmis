import { getDb } from "@/lib/db";
import { isPackIncomplete, packSizeText } from "../domain/pack-size";
import {
  composeDisplayName,
  isDetailsIncomplete,
  type StrengthParts,
} from "../domain/strength";

/**
 * Creates a medication the inventory has never seen, plus its first batch.
 *
 * A brand-new item has no row to update, so it cannot go through the stock-in
 * mutation and is written directly instead. Returns the new id so the caller can
 * select it once the list refetches.
 *
 * Shared by all three pages that can stock in (Stock Management, Expiry Alerts,
 * Low-Stock Alerts) so "new item" means the same row shape everywhere.
 */

/** The threshold a product is born with, matching the import and creation paths. */
const NEW_ITEM_THRESHOLD = 20;

export interface NewItemWithBatch extends StrengthParts {
  batch: string;
  category: string;
  expiry: string;
  name: string;
  /**
   * The structured pack pair (pack-size F2/F3). Optional so a caller that does
   * not collect one leaves the item pack-less rather than writing a zero-unit
   * pair; `""` means "not recorded".
   */
  packQty?: number | "";
  packUnit?: string;
  /** Base units (D12) — a wizard-typed `5 box` arrives here as 50. */
  qty: number;
  /** Supplier is optional in the wizard; an absent one stores as ''. */
  supplier: string | null;
}

export function newItemId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `inv-${Date.now()}`;
}

/**
 * `SKU-PARA-40` — derived from the name and quantity, never renumbered later.
 *
 * A SKU minted here is the operator's from then on: the import path derives its
 * own from `strength_value` (decision 10), but neither path ever rewrites an
 * existing code.
 */
export function buildSkuForNewItem(name: string, qty: number): string {
  return `SKU-${name.slice(0, 4).toUpperCase()}-${qty}`;
}

export async function insertNewItemWithBatch(
  payload: NewItemWithBatch
): Promise<string> {
  const db = await getDb();
  const id = newItemId();
  const sku = buildSkuForNewItem(payload.name, payload.qty);
  const now = new Date().toISOString();
  const supplier = payload.supplier ?? "";
  // The pack text is derived from the pair when there is one, so a new item born
  // from the wizard's `10/box` stores `10/box` and the label follows (D24).
  const packQty =
    payload.packQty === undefined || payload.packQty === ""
      ? 0
      : payload.packQty;
  const packUnit = (payload.packUnit ?? "").trim();
  const derivedPackText = packSizeText({ packQty, packUnit });
  const parts: StrengthParts = {
    form: payload.form,
    packSize: derivedPackText === "" ? payload.packSize : derivedPackText,
    strengthUnit: payload.strengthUnit,
    strengthValue: payload.strengthValue,
  };
  const displayName = composeDisplayName({ ...parts, name: payload.name });

  // `dosage` is not written: it is the backfill's input, kept only until the
  // deferred drop migration lands (spec §6.2 option B).
  await db.execute(
    "INSERT INTO inventory_items (id, sku, name, strength_value, strength_unit, form, pack_size, pack_qty, pack_unit, display_name, dosage_missing, stock_on_hand, total_dispensed, stock_remaining, daily_sum, total_mismatch, qty, status, needs_batch, category, supplier, threshold, is_no_stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      sku,
      payload.name,
      parts.strengthValue,
      parts.strengthUnit,
      parts.form,
      parts.packSize,
      packQty,
      packUnit,
      displayName,
      // Repurposed as "details incomplete" (PK14), plus the pack pair for a
      // pack-forming item (V7) — the same rule the other write paths use.
      isDetailsIncomplete(parts) ||
      isPackIncomplete({ form: parts.form, packQty, packUnit })
        ? 1
        : 0,
      payload.qty,
      0,
      null,
      0,
      0,
      payload.qty,
      payload.qty > 0 ? "in" : "out",
      0,
      payload.category,
      supplier,
      NEW_ITEM_THRESHOLD,
      0,
      now,
      now,
    ]
  );

  if (payload.batch) {
    await db.execute(
      "INSERT INTO inventory_batches (id, item_id, batch, expiry, qty, supplier) VALUES (?, ?, ?, ?, ?, ?)",
      [`${id}-b`, id, payload.batch, payload.expiry, payload.qty, supplier]
    );
  }

  return id;
}
