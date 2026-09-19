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
  packSize: string;
  qty: number;
  strengthUnit: string;
  strengthValue: string;
  supplier: string | null;
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
  packSize: string;
  strengthUnit: string;
  strengthValue: string;
}
