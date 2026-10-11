/**
 * CMIS Cloud Sync — the offline queue.
 *
 * The queue is not a list in memory; it is the database itself. Everything this
 * device changes is already stamped by migration 0014's triggers and every hard
 * delete already left a tombstone, so "what do I still owe the cloud?" is a
 * query: rows newer than my cursor, plus tombstones newer than my delete
 * cursor. That is what makes the queue survive a crash, a kill, and a laptop
 * that closes mid-edit — the failure modes an in-memory array loses. Nothing in
 * this module can be lost by dying at the wrong moment, because nothing in it
 * is written before it is needed.
 *
 * The cursors live in `sync_state` (also migration 0014) and are only advanced
 * after the server has acknowledged the push, so a failed request re-sends
 * rather than skips.
 */

import {
  formatPushCursor,
  parsePushCursor,
  readStateValue,
  scanRowsForPush,
  scanTombstonesForPush,
  writeStateValue,
} from "./scan";
import { SYNC_TABLE_NAMES, SYNC_TABLES, syncTableSpec } from "./schema";
import type {
  SyncDatabase,
  SyncDelete,
  SyncTableChange,
  SyncTableName,
} from "./types";

const PUSH_PREFIX = "push:";
const PULL_PREFIX = "pull:";
const DELETE_SUFFIX = "__deleted__";
const DEVICE_ID_KEY = "device_id";

/**
 * One family of cursors: the high-water marks for one direction.
 *
 * The push family encodes `<timestamp>|<rowid>` (see `scan.ts`); the pull family
 * is a bare timestamp, because the server compares it in SQL and the wire format
 * is shared. The engine treats both as opaque strings — only `scan.ts` knows how
 * to read one.
 */
export interface SyncCursors {
  deleted: string;
  rows: Partial<Record<SyncTableName, string>>;
}

/**
 * Push and pull cursors are *separate*, and that separation is load-bearing.
 *
 * A row can be sent and still not be adopted by the server (it lost to a newer
 * copy there). If one cursor served both directions, the client's next pull
 * would start above that row's timestamp and never receive the version that won
 * — the other device's edit would be lost until something else touched the row.
 * Two cursors say exactly what each one means: `push` is "rows I have already
 * handed over", `pull` is "rows the server has already handed me".
 */
export interface SyncCursorState {
  pull: SyncCursors;
  push: SyncCursors;
}

export interface CollectedChanges {
  cursors: SyncCursors;
  /** `true` when a table hit the page limit and has more to send. */
  hasMore: boolean;
  /** Rows plus deletes in this payload, for the queue-depth display. */
  size: number;
  tables: SyncTableChange[];
}

/**
 * This device's durable id, created on first use.
 *
 * It is stamped on the tombstones this device writes and sent with every
 * request, so a conflict can name the machine it came from and a client can
 * recognise its own echoes.
 */
export async function ensureDeviceId(
  db: SyncDatabase,
  create: () => string = () => {
    const uuid = globalThis.crypto?.randomUUID;
    if (typeof uuid === "function") {
      return uuid.call(globalThis.crypto);
    }
    return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
): Promise<string> {
  const existing = await readStateValue(db, DEVICE_ID_KEY);
  if (existing !== null && existing !== "") {
    return existing;
  }
  const created = create();
  await writeStateValue(db, DEVICE_ID_KEY, created);
  return created;
}

async function readFamily(
  db: SyncDatabase,
  prefix: string
): Promise<SyncCursors> {
  const rows: Partial<Record<SyncTableName, string>> = {};
  for (const table of SYNC_TABLE_NAMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one round trip per table, and the table list is fixed at eight — batching these would save nothing measurable and lose the per-table failure
    rows[table] = (await readStateValue(db, `${prefix}${table}`)) ?? "";
  }
  return {
    deleted: (await readStateValue(db, `${prefix}${DELETE_SUFFIX}`)) ?? "",
    rows,
  };
}

async function writeFamily(
  db: SyncDatabase,
  prefix: string,
  cursors: SyncCursors
): Promise<void> {
  for (const table of SYNC_TABLE_NAMES) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential upserts against a single key/value table
    await writeStateValue(db, `${prefix}${table}`, cursors.rows[table] ?? "");
  }
  await writeStateValue(db, `${prefix}${DELETE_SUFFIX}`, cursors.deleted);
}

export async function readCursors(db: SyncDatabase): Promise<SyncCursorState> {
  return {
    pull: await readFamily(db, PULL_PREFIX),
    push: await readFamily(db, PUSH_PREFIX),
  };
}

/** Records that the server has acknowledged everything up to `cursors`. */
export async function writePushCursors(
  db: SyncDatabase,
  cursors: SyncCursors
): Promise<void> {
  await writeFamily(db, PUSH_PREFIX, cursors);
}

/** Records what the server has handed back. */
export async function writePullCursors(
  db: SyncDatabase,
  cursors: SyncCursors
): Promise<void> {
  await writeFamily(db, PULL_PREFIX, cursors);
}

/**
 * Everything this device has changed since its cursors, ready to push.
 *
 * `limit` is the spec's `OFFLINE_QUEUE_MAX_SIZE`: it caps one pass rather than
 * refusing to sync, and `hasMore` tells the caller another pass is due
 * immediately. A table that hits the cap advances its cursor to the last row it
 * actually sent, so the next pass continues where this one stopped (and the
 * overlap window in `scan.ts` means the boundary row cannot be skipped).
 *
 * This device's *own* tombstones are included. They are the whole point of a
 * push — the server does not know about a delete until it is told — and the
 * direction that has to ignore them is the pull, where they are already applied.
 */
export async function collectLocalChanges(
  db: SyncDatabase,
  opts: { limit: number }
): Promise<CollectedChanges> {
  const cursors = (await readCursors(db)).push;
  const next: SyncCursors = { deleted: cursors.deleted, rows: {} };
  const tables: SyncTableChange[] = [];
  let size = 0;
  let hasMore = false;

  for (const spec of SYNC_TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: one scan per table, in dependency order, each with its own cursor
    const page = await scanRowsForPush(
      db,
      spec.name,
      parsePushCursor(cursors.rows[spec.name] ?? ""),
      opts.limit
    );
    next.rows[spec.name] = formatPushCursor(page.cursor);
    hasMore = hasMore || page.hasMore;
    size += page.rows.length;
    if (page.rows.length > 0) {
      tables.push({ rows: page.rows, table: spec.name });
    }
  }

  const tombstones = await scanTombstonesForPush(
    db,
    parsePushCursor(cursors.deleted),
    opts.limit
  );
  next.deleted = formatPushCursor(tombstones.cursor);
  hasMore = hasMore || tombstones.hasMore;
  size += tombstones.rows.length;

  const byTable = new Map<SyncTableName, SyncDelete[]>();
  for (const entry of tombstones.rows) {
    const list = byTable.get(entry.table) ?? [];
    list.push({
      deletedAt: entry.deletedAt,
      deviceId: entry.deviceId ?? null,
      rowKey: entry.rowKey,
    });
    byTable.set(entry.table, list);
  }
  for (const [table, deletes] of byTable) {
    tables.push({ deletes, table });
  }

  return { cursors: next, hasMore, size, tables };
}

/** Rows and deletes still waiting to be sent, for the settings panel. */
export async function pendingChangeCount(
  db: SyncDatabase,
  cursors: SyncCursors
): Promise<{ deletes: number; rows: number }> {
  let rows = 0;
  for (const table of SYNC_TABLE_NAMES) {
    const spec = syncTableSpec(table);
    if (!spec) {
      continue;
    }
    // The same predicate the scan uses, so "12 waiting" and the next pass agree.
    const cursor = parsePushCursor(cursors.rows[table] ?? "");
    // biome-ignore lint/performance/noAwaitInLoops: one count per table; the queue depth is a status read, not a hot path
    const [row] = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) AS count FROM ${table}
        WHERE (${spec.updatedAtSql()} > ?)
           OR (${spec.updatedAtSql()} = ? AND rowid > ?)`,
      [cursor.stamp, cursor.stamp, cursor.rowId]
    );
    rows += Number(row?.count ?? 0);
  }
  const cursor = parsePushCursor(cursors.deleted);
  const [deleted] = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM sync_tombstones
      WHERE (deleted_at > ?) OR (deleted_at = ? AND rowid > ?)`,
    [cursor.stamp, cursor.stamp, cursor.rowId]
  );
  return { deletes: Number(deleted?.count ?? 0), rows };
}

/**
 * Drops the tombstones a successful push has handed over.
 *
 * The bound is the pushed *cursor*, not a bare timestamp: a page that stopped
 * mid-millisecond leaves a tombstone at exactly the cursor's timestamp, and
 * deleting it would throw away a delete that was never sent. `(deleted_at <
 * stamp) OR (deleted_at = stamp AND rowid <= rowid)` is exactly "everything the
 * server has seen".
 */
export async function prunePushedTombstones(
  db: SyncDatabase,
  cursor: string
): Promise<number> {
  const { rowId, stamp } = parsePushCursor(cursor);
  if (stamp === "" && rowId === 0) {
    return 0;
  }
  const where = "(deleted_at < ?) OR (deleted_at = ? AND rowid <= ?)";
  const before = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM sync_tombstones WHERE ${where}`,
    [stamp, stamp, rowId]
  );
  await db.execute(`DELETE FROM sync_tombstones WHERE ${where}`, [
    stamp,
    stamp,
    rowId,
  ]);
  return Number(before[0]?.count ?? 0);
}
