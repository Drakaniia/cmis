import type { InventoryItem } from "../../types";

/**
 * A category is a name, not a fixed union: the list is data now (migration
 * 0006), so the wizard can offer one the operator added a moment ago.
 */
export type InventoryCategory = string;

/**
 * The wizard's own draft.
 *
 * `unit` is gone (decision 8): the old dropdown offered `tablet`/`capsule`/… and
 * went nowhere, because no column existed for it. The four strength fields
 * replace it, and Step 4's review shows their composed label so the operator can
 * see what will be stored.
 */
export interface StockInDraft {
  batch: string;
  category: InventoryCategory;
  expiry: string;
  form: string;
  identifier: string;
  isNew: boolean;
  itemId: string | null;
  name: string;
  notes: string;
  /**
   * The structured pack pair (pack-size F2, F3). `""` means "not recorded",
   * which pairs with a blank `packUnit`; `packSize` stays the rendered text and
   * is derived from the pair on write (D24).
   */
  packQty: number | "";
  packSize: string;
  packUnit: string;
  /**
   * **Always base units** (D12, F4): the quantity step may be typed in packs,
   * but the conversion happens before the draft is built, so the batch row, the
   * item total and `needs_batch` keep their single-number base-unit meaning.
   */
  qty: number;
  strengthUnit: string;
  strengthValue: string;
  supplier: string | null;
}

/** Which unit the quantity step is being typed in (F4). */
export type QuantityUnit = "base" | "pack";

/**
 * Everything the quantity cell needs to offer and explain its unit toggle, as
 * one value — so the wizard owns the conversion and the step only renders it.
 */
export interface QuantityUnitControl {
  /** The item's base unit, from its dose form (`sachet`, `tab`, …). */
  baseUnit: string;
  /** `"50 sachet"` while a pack conversion is in play, otherwise `null`. */
  conversionLabel: string | null;
  onSelect: (unit: QuantityUnit) => void;
  packUnit: string;
  /** True when the item has a usable pack pair, so the pack option is offered. */
  packUnitAvailable: boolean;
  /** The unit actually in force — `base` whenever no usable pack exists. */
  selected: QuantityUnit;
}

export interface StockInWizardProps {
  initialItemId?: string | null;
  items: InventoryItem[];
  onConfirm: (payload: StockInDraft) => void;
  onOpenChange: (v: boolean) => void;
  open: boolean;
  originRect?: DOMRect | null;
}

/** Step 2 fields as one value, so "prefill from an item" is stated once. */
export interface StepDetailsState {
  category: InventoryCategory;
  form: string;
  name: string;
  packQty: number | "";
  packSize: string;
  packUnit: string;
  strengthUnit: string;
  strengthValue: string;
}
