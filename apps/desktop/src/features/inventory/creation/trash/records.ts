import { getOperatorName } from "@/features/admin/audit/operator";

import type { DbLike } from "../db-like";
import type {
  BatchSnapshot,
  ItemSnapshot,
  TrashEntry,
  TrashKind,
} from "./types";
import { nowIso, num, text } from "./utils";

interface TrashRecordRow {
  deleted_at: string;
  deleted_by: string;
  entity_id: string;
  id: string;
  item_id: string | null;
  kind: string;
  label: string;
  reason: string | null;
  restore_hint: string | null;
  snapshot: string;
}

export function parseSnapshot(
  raw: string
): BatchSnapshot | ItemSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      return parsed as BatchSnapshot | ItemSnapshot;
    }
  } catch {
    // A malformed snapshot must not take the Trash tab down with it.
  }
  return null;
}

interface SnapshotCounts {
  batchCount: number;
  dispensingCount: number;
  expiry: string | null;
  totalQty: number;
}

function snapshotCounts(
  snapshot: BatchSnapshot | ItemSnapshot | null
): SnapshotCounts {
  if (!snapshot) {
    return { batchCount: 0, dispensingCount: 0, expiry: null, totalQty: 0 };
  }
  if (snapshot.kind === "batch") {
    return {
      batchCount: 1,
      dispensingCount: 0,
      expiry: text(snapshot.batch.expiry).slice(0, 10) || null,
      totalQty: num(snapshot.batch.qty),
    };
  }
  return {
    batchCount: snapshot.batches.length,
    dispensingCount: snapshot.dispensingEvents.length,
    expiry: null,
    totalQty: snapshot.batches.reduce((sum, row) => sum + num(row.qty), 0),
  };
}

export function toTrashEntry(row: TrashRecordRow): TrashEntry {
  const snapshot = parseSnapshot(row.snapshot);
  const {
    deleted_at: deletedAt,
    deleted_by: deletedBy,
    entity_id: entityId,
    id,
    item_id: itemId,
    kind,
    label,
    reason,
    restore_hint: restoreHint,
  } = row;
  return {
    ...snapshotCounts(snapshot),
    deletedAt,
    deletedBy,
    entityId,
    id,
    itemId,
    kind: kind === "batch" ? "batch" : "item",
    label,
    reason,
    restoreHint,
  };
}

export async function listTrash(db: DbLike): Promise<TrashEntry[]> {
  const rows = await db.select<TrashRecordRow[]>(
    "SELECT * FROM trash_records ORDER BY deleted_at DESC"
  );
  return rows.map(toTrashEntry);
}

export async function loadTrashRow(
  db: DbLike,
  trashId: string
): Promise<TrashRecordRow | null> {
  const rows = await db.select<TrashRecordRow[]>(
    "SELECT * FROM trash_records WHERE id = ? LIMIT 1",
    [trashId]
  );
  const [row] = rows;
  return row ?? null;
}

export function auditExtra(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  return trimmed ? ` — ${trimmed}` : "";
}

export async function insertTrashRecord(
  db: DbLike,
  fields: {
    entityId: string;
    itemId: string | null;
    kind: TrashKind;
    label: string;
    reason?: string | null;
    restoreHint: string | null;
    snapshot: string;
    trashId: string;
  },
  actor?: string
): Promise<void> {
  await db.execute(
    "INSERT INTO trash_records (id, kind, entity_id, item_id, label, snapshot, deleted_at, deleted_by, reason, restore_hint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      fields.trashId,
      fields.kind,
      fields.entityId,
      fields.itemId,
      fields.label,
      fields.snapshot,
      nowIso(),
      actor ?? getOperatorName(),
      fields.reason ?? null,
      fields.restoreHint,
    ]
  );
}
