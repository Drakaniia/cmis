import type { Row } from "../rows";

export type TrashKind = "item" | "batch";

/** A parsed snapshot, ready to replay. */
export interface ItemSnapshot {
  batches: Row[];
  dispensingEvents: Row[];
  item: Row;
  kind: "item";
}

export interface BatchSnapshot {
  batch: Row;
  item: Row | null;
  kind: "batch";
}

/** A trash row flattened for the UI — counts are computed from the snapshot. */
export interface TrashEntry {
  batchCount: number;
  deletedAt: string;
  deletedBy: string;
  dispensingCount: number;
  entityId: string;
  expiry: string | null;
  id: string;
  itemId: string | null;
  kind: TrashKind;
  label: string;
  reason: string | null;
  restoreHint: string | null;
  totalQty: number;
}

export interface DeleteOptions {
  /** Overrides the Settings → Operator name default. */
  actor?: string;
  /** Optional operator note, stored on the trash row and copied into the audit entry. */
  reason?: string | null;
}

/** What a soft delete removed, so the modal can read real numbers (§7.7). */
export interface DeleteSummary {
  batchCount: number;
  dispensingCount: number;
  label: string;
  totalQty: number;
  trashId: string;
}

export interface BatchDeleteSummary extends DeleteSummary {
  itemId: string;
  productName: string;
  qtyAfter: number;
  qtyBefore: number;
}

export type RestoreResult =
  | { kind: TrashKind; label: string; ok: true }
  | {
      message: string;
      ok: false;
      reason: "kind-mismatch" | "not-found" | "product-missing";
    }
  | {
      message: string;
      ok: false;
      reason: "sku-taken";
      suggestedSku: string;
      takenBy: string;
    };

export interface PurgeSummary {
  batches: number;
  dispensingRecords: number;
  products: number;
}

export type BatchRef =
  | { batchId: string }
  | { batchName: string; itemId: string };
