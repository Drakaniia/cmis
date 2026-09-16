import { getOperatorName } from "@/features/admin/audit/operator";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { deriveStatus } from "../import/inventory-status";
import type { DbLike } from "./db-like";
import { insertRow, insertRows, type Row } from "./rows";

/**
 * Trash: deletion as an extract-and-snapshot, never a flag (spec §8, §10.3).
 *
 * Nothing is destroyed on delete. The item (or batch), its batches and its
 * dispensing events are serialised into one `trash_records` row and the live
 * rows are removed — which is why every existing query in the app is already
 * correct for "hidden everywhere except Trash" with no `deleted_at` filter.
 *
 * Two rules this module holds deliberately, both because the importer writes
 * `needs_batch = 1` with no batch rows at all (`import/import.ts`):
 *
 * 1. `item.qty` is the source of truth. A batch delete **subtracts** from it and
 *    never rebuilds it from the remaining batches — rebuilding would silently
 *    zero the entire imported inventory on the first batch delete.
 * 2. A restore puts the stored `qty` back; only `status` is re-derived.
 */

export type TrashKind = "item" | "batch";

export type { Row } from "./rows";

/** A parsed snapshot, ready to replay. */
interface ItemSnapshot {
  batches: Row[];
  dispensingEvents: Row[];
  item: Row;
  kind: "item";
}

interface BatchSnapshot {
  batch: Row;
  item: Row | null;
  kind: "batch";
}

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

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === "function") {
    return uuid.call(globalThis.crypto);
  }
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The label the rest of the app shows for a product. */
export function productLabel(item: Row): string {
  const display = text(item.display_name).trim();
  if (display) {
    return display;
  }
  const name = text(item.name).trim();
  const dosage = text(item.dosage).trim();
  return dosage ? `${name} ${dosage}` : name;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** `3 batches · 450 units` / `200 units · exp 2027-03-01` — the Trash Detail column. */
export function describeTrashEntry(entry: TrashEntry): string {
  if (entry.kind === "batch") {
    const expiry = entry.expiry ? ` · exp ${entry.expiry}` : "";
    return `${entry.totalQty} units${expiry}`;
  }
  const batches =
    entry.batchCount === 0
      ? "No batches"
      : `${entry.batchCount} ${plural(entry.batchCount, "batch", "batches")}`;
  return `${batches} · ${entry.totalQty} units`;
}

function pluralBatches(count: number): string {
  return `${count} ${plural(count, "batch", "batches")}`;
}

function pluralRecords(count: number): string {
  return `${count} ${plural(count, "record", "records")}`;
}

function nextFreeSku(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function parseSnapshot(raw: string): BatchSnapshot | ItemSnapshot | null {
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

async function loadTrashRow(
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

function auditExtra(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  return trimmed ? ` — ${trimmed}` : "";
}

async function insertTrashRecord(
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

/**
 * Moves a product — its batches and its dispensing history — into Trash.
 *
 * Children are deleted explicitly rather than trusted to `ON DELETE CASCADE`,
 * so the snapshot stays authoritative for what a restore has to put back.
 */
export async function softDeleteItem(
  db: DbLike,
  itemId: string,
  opts: DeleteOptions = {}
): Promise<DeleteSummary> {
  const items = await db.select<Row[]>(
    "SELECT * FROM inventory_items WHERE id = ? LIMIT 1",
    [itemId]
  );
  const [item] = items;
  if (!item) {
    throw new Error("Item not found — it may already be in Trash.");
  }

  const batches = await db.select<Row[]>(
    "SELECT * FROM inventory_batches WHERE item_id = ? ORDER BY expiry, batch",
    [itemId]
  );
  const dispensingEvents = await db.select<Row[]>(
    "SELECT * FROM dispensing_events WHERE item_id = ? ORDER BY date",
    [itemId]
  );

  const label = productLabel(item);
  const totalQty = batches.reduce((sum, row) => sum + num(row.qty), 0);
  const trashId = newId();

  await insertTrashRecord(
    db,
    {
      entityId: itemId,
      itemId,
      kind: "item",
      label,
      reason: opts.reason,
      restoreHint: `SKU was ${text(item.sku)}`,
      snapshot: JSON.stringify({
        batches,
        dispensingEvents,
        item,
        kind: "item",
      }),
      trashId,
    },
    opts.actor
  );

  await db.execute("DELETE FROM dispensing_events WHERE item_id = ?", [itemId]);
  await db.execute("DELETE FROM inventory_batches WHERE item_id = ?", [itemId]);
  await db.execute("DELETE FROM inventory_items WHERE id = ?", [itemId]);

  // Atomic: a deletion must never exist without its audit row (spec §11.3).
  await recordAudit(db, {
    action: "correction",
    before: {
      batches: batches.length,
      category: text(item.category),
      dispensingRecords: dispensingEvents.length,
      name: label,
      qty: num(item.qty),
      sku: text(item.sku),
      status: text(item.status),
    },
    detail: `Deleted ${label} → Trash — ${pluralBatches(batches.length)}, ${pluralRecords(dispensingEvents.length)}${auditExtra(opts.reason)}`,
    reason: (opts.reason ?? "").trim() ? (opts.reason ?? null) : null,
    targetId: itemId,
    targetKind: "item",
  });

  return {
    batchCount: batches.length,
    dispensingCount: dispensingEvents.length,
    label,
    totalQty,
    trashId,
  };
}

/**
 * Moves one batch into Trash and corrects the product's qty by subtraction
 * (spec §10.3) — the same arithmetic `useStockOutMutation` already applies.
 */
export async function softDeleteBatch(
  db: DbLike,
  ref: BatchRef,
  opts: DeleteOptions = {}
): Promise<BatchDeleteSummary> {
  const batches =
    "batchId" in ref
      ? await db.select<Row[]>(
          "SELECT * FROM inventory_batches WHERE id = ? LIMIT 1",
          [ref.batchId]
        )
      : await db.select<Row[]>(
          "SELECT * FROM inventory_batches WHERE item_id = ? AND batch = ? LIMIT 1",
          [ref.itemId, ref.batchName]
        );
  const [batch] = batches;
  if (!batch) {
    throw new Error("Batch not found — it may already be in Trash.");
  }

  const itemId = text(batch.item_id);
  const items = await db.select<Row[]>(
    "SELECT * FROM inventory_items WHERE id = ? LIMIT 1",
    [itemId]
  );
  const [item] = items;
  if (!item) {
    throw new Error("Product not found for this batch.");
  }

  const batchId = text(batch.id);
  const batchQty = num(batch.qty);
  const qtyBefore = num(item.qty);
  const qtyAfter = Math.max(0, qtyBefore - batchQty);
  const threshold = num(item.threshold);
  const productName = productLabel(item);
  const trashId = newId();

  await insertTrashRecord(
    db,
    {
      entityId: batchId,
      itemId,
      kind: "batch",
      label: `${text(batch.batch)} · ${batchQty} units`,
      reason: opts.reason,
      restoreHint: `Batch of ${productName}`,
      snapshot: JSON.stringify({ batch, item, kind: "batch" }),
      trashId,
    },
    opts.actor
  );

  await db.execute("DELETE FROM inventory_batches WHERE id = ?", [batchId]);

  const remaining = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM inventory_batches WHERE item_id = ?",
    [itemId]
  );
  const needsBatch = (remaining[0]?.c ?? 0) === 0 ? 1 : 0;
  const status = deriveStatus(qtyAfter, threshold);

  await db.execute(
    "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = ?, updated_at = ? WHERE id = ?",
    [qtyAfter, status, needsBatch, nowIso(), itemId]
  );

  await recordAudit(db, {
    action: "correction",
    after: { needsBatch, qty: qtyAfter, status },
    before: { qty: qtyBefore, status: text(item.status) },
    detail: `Deleted batch ${text(batch.batch)} from ${productName} — ${batchQty} units (${qtyBefore} → ${qtyAfter})${auditExtra(opts.reason)}`,
    reason: (opts.reason ?? "").trim() ? (opts.reason ?? null) : null,
    targetId: batchId,
    targetKind: "batch",
  });

  return {
    batchCount: 1,
    dispensingCount: 0,
    itemId,
    label: `${text(batch.batch)} · ${batchQty} units`,
    productName,
    qtyAfter,
    qtyBefore,
    totalQty: batchQty,
    trashId,
  };
}

/** Which SKUs are already out there, needed to offer a suffixed one on collision. */
async function skuState(
  db: DbLike,
  excludeId: string
): Promise<{ taken: Set<string>; takenBy: Map<string, string> }> {
  const rows = await db.select<{ id: string; name: string; sku: string }[]>(
    "SELECT id, name, sku FROM inventory_items"
  );
  const taken = new Set<string>();
  const takenBy = new Map<string, string>();
  for (const { id, name, sku } of rows) {
    if (id === excludeId) {
      continue;
    }
    taken.add(sku);
    takenBy.set(sku, name);
  }
  return { taken, takenBy };
}

/**
 * True undo of a product delete: item → batches → dispensing events (parent
 * first, FK-safe), then the trash row goes away.
 *
 * The stored `qty` is restored as-is; only `status` is re-derived, because
 * rebuilding qty from batches would zero any product that was imported without
 * batches — the same trap §10.3 documents for batch delete.
 */
export async function restoreItem(
  db: DbLike,
  trashId: string,
  opts: { actor?: string; skuOverride?: string } = {}
): Promise<RestoreResult> {
  const record = await loadTrashRow(db, trashId);
  if (!record) {
    return {
      message: "This entry is no longer in Trash.",
      ok: false,
      reason: "not-found",
    };
  }
  if (record.kind !== "item") {
    return {
      message: "Use the batch restore for this entry.",
      ok: false,
      reason: "kind-mismatch",
    };
  }

  const snapshot = parseSnapshot(record.snapshot);
  if (snapshot?.kind !== "item") {
    return {
      message: "This snapshot is unreadable and cannot be restored.",
      ok: false,
      reason: "kind-mismatch",
    };
  }

  const { batches, dispensingEvents, item } = snapshot;
  const itemId = text(item.id);
  const originalSku = text(item.sku);
  const { taken, takenBy } = await skuState(db, itemId);
  const override = opts.skuOverride?.trim();

  if (override && taken.has(override)) {
    return {
      message: `${override} is also in use.`,
      ok: false,
      reason: "sku-taken",
      suggestedSku: nextFreeSku(originalSku, taken),
      takenBy: takenBy.get(override) ?? "another product",
    };
  }
  if (!override && taken.has(originalSku)) {
    const holder = takenBy.get(originalSku) ?? "another product";
    return {
      message: `${originalSku} is in use by "${holder}".`,
      ok: false,
      reason: "sku-taken",
      suggestedSku: nextFreeSku(originalSku, taken),
      takenBy: holder,
    };
  }

  const qty = num(item.qty);
  const threshold = num(item.threshold);
  await insertRow(db, "inventory_items", {
    ...item,
    needs_batch: batches.length === 0 ? 1 : 0,
    qty,
    sku: override ?? originalSku,
    status: deriveStatus(qty, threshold),
    updated_at: nowIso(),
  });
  await insertRows(db, "inventory_batches", batches);
  await insertRows(db, "dispensing_events", dispensingEvents);

  await db.execute("DELETE FROM trash_records WHERE id = ?", [trashId]);

  const { label } = record;
  await recordAudit(db, {
    action: "correction",
    after: {
      batches: batches.length,
      dispensingRecords: dispensingEvents.length,
      qty,
      sku: override ?? originalSku,
    },
    detail: `Restored ${label} from Trash`,
    targetId: itemId,
    targetKind: "item",
  });

  return { kind: "item", label, ok: true };
}

/**
 * Restores a single batch and puts its qty back on the product — the exact
 * inverse of `softDeleteBatch`. A batch whose product is itself in Trash brings
 * the product back with it (the product snapshot already carries every batch).
 */
export async function restoreBatch(
  db: DbLike,
  trashId: string
): Promise<RestoreResult> {
  const record = await loadTrashRow(db, trashId);
  if (!record) {
    return {
      message: "This entry is no longer in Trash.",
      ok: false,
      reason: "not-found",
    };
  }
  if (record.kind !== "batch") {
    return {
      message: "Use the product restore for this entry.",
      ok: false,
      reason: "kind-mismatch",
    };
  }

  const snapshot = parseSnapshot(record.snapshot);
  if (snapshot?.kind !== "batch") {
    return {
      message: "This snapshot is unreadable and cannot be restored.",
      ok: false,
      reason: "kind-mismatch",
    };
  }

  const { batch } = snapshot;
  const itemId = text(batch.item_id);
  const items = await db.select<Row[]>(
    "SELECT * FROM inventory_items WHERE id = ? LIMIT 1",
    [itemId]
  );
  const [item] = items;

  if (!item) {
    const parentTrash = await db.select<{ id: string }[]>(
      "SELECT id FROM trash_records WHERE kind = 'item' AND entity_id = ? LIMIT 1",
      [itemId]
    );
    const parentId = parentTrash[0]?.id;
    if (!parentId) {
      return {
        message:
          "The product for this batch is no longer in inventory, and it is not in Trash.",
        ok: false,
        reason: "product-missing",
      };
    }
    return await restoreItem(db, parentId);
  }

  await insertRow(db, "inventory_batches", batch);
  await db.execute("DELETE FROM trash_records WHERE id = ?", [trashId]);

  const batchQty = num(batch.qty);
  const qtyBefore = num(item.qty);
  const qty = qtyBefore + batchQty;
  const threshold = num(item.threshold);
  await db.execute(
    "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = 0, updated_at = ? WHERE id = ?",
    [qty, deriveStatus(qty, threshold), nowIso(), itemId]
  );

  const label = `${text(batch.batch)} · ${batchQty} units`;
  await recordAudit(db, {
    action: "correction",
    after: { qty },
    before: { qty: qtyBefore },
    detail: `Restored batch ${label} to ${productLabel(item)} from Trash`,
    targetId: text(batch.id),
    targetKind: "batch",
  });

  return { kind: "batch", label, ok: true };
}

/**
 * Permanent removal of a single Trash entry.
 *
 * A purged batch does **not** touch `item.qty` again: the subtraction already
 * happened when it was deleted, so repeating it here would double-count.
 */
async function purgeOne(db: DbLike, trashId: string): Promise<PurgeSummary> {
  const record = await loadTrashRow(db, trashId);
  const summary: PurgeSummary = {
    batches: 0,
    dispensingRecords: 0,
    products: 0,
  };
  if (!record) {
    return summary;
  }
  const snapshot = parseSnapshot(record.snapshot);

  if (record.kind === "batch") {
    await db.execute("DELETE FROM inventory_batches WHERE id = ?", [
      record.entity_id,
    ]);
    summary.batches = 1;
  } else {
    const itemId = record.entity_id;
    const isItemSnapshot = snapshot?.kind === "item";
    await db.execute("DELETE FROM dispensing_events WHERE item_id = ?", [
      itemId,
    ]);
    await db.execute("DELETE FROM inventory_batches WHERE item_id = ?", [
      itemId,
    ]);
    await db.execute("DELETE FROM inventory_items WHERE id = ?", [itemId]);
    summary.products = 1;
    summary.batches = isItemSnapshot ? snapshot.batches.length : 0;
    summary.dispensingRecords = isItemSnapshot
      ? snapshot.dispensingEvents.length
      : 0;
  }

  await db.execute("DELETE FROM trash_records WHERE id = ?", [trashId]);

  await recordAudit(db, {
    action: "correction",
    detail: `Permanently deleted ${record.label} — removed from Trash for good`,
    targetId: record.entity_id,
    targetKind: record.kind === "batch" ? "batch" : "item",
  });

  return summary;
}

export async function purgeTrash(
  db: DbLike,
  trashIds: string[]
): Promise<PurgeSummary> {
  // Independent entries, so they can go in parallel — inside one entry the
  // order stays children-before-parent, which is what `purgeOne` guarantees.
  const parts = await Promise.all(trashIds.map((id) => purgeOne(db, id)));
  return parts.reduce<PurgeSummary>(
    (total, part) => ({
      batches: total.batches + part.batches,
      dispensingRecords: total.dispensingRecords + part.dispensingRecords,
      products: total.products + part.products,
    }),
    { batches: 0, dispensingRecords: 0, products: 0 }
  );
}
