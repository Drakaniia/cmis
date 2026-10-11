/**
 * CMIS Cloud Sync — the reads: what changed, and the cursors that say where
 * this device got to.
 *
 * Shared by the desktop client (against SQLite) and the Worker (against D1).
 * Both scans are `> cursor ORDER BY cursor`, so a device that has been offline
 * for a month pays for the rows it missed and not for the table.
 *
 * Both scans carry an honest boundary case: rows that share a timestamp with
 * the last row of a page. The cursor is a single timestamp, so a second page
 * starting at `> last` cannot see them — which is why the client always asks
 * from `cursor - OVERLAP_MS` rather than from the cursor itself. Re-applying a
 * row is a no-op (the conflict resolver rejects anything not strictly newer),
 * so the overlap costs a few bytes and removes a class of silently-missed
 * change.
 */

import { isSafeIdentifier, isSyncTableName, syncTableSpec } from "./schema";
import type { SyncDatabase, SyncDelete, SyncRow, SyncTableName } from "./types";

/** How far back of the cursor the client re-reads, in milliseconds. */
export const OVERLAP_MS = 5 * 60 * 1000;

/** Page size for one table in one direction, unless the caller says otherwise. */
export const DEFAULT_PAGE_SIZE = 500;

export interface ScanPage<T> {
  cursor: string;
  hasMore: boolean;
  rows: T[];
}

/** A tombstone plus the table it belongs to, which the wire format needs. */
export interface ScannedTombstone extends SyncDelete {
  table: SyncTableName;
}

function rewind(stamp: string): string {
  if (stamp === "") {
    return stamp;
  }
  const parsed = Date.parse(stamp);
  if (Number.isNaN(parsed)) {
    return "";
  }
  return new Date(parsed - OVERLAP_MS).toISOString();
}

/**
 * The `since` bound for a scan: the stored cursor, rewound by the overlap
 * window. A cursor of `""` means "everything" and stays that way.
 *
 * Used in both directions. Without the rewind, two rows sharing a timestamp
 * across a page boundary means the second one is never read again: the cursor
 * has already moved to that exact timestamp, and `>` excludes the row that was
 * left behind. Re-reading a few minutes of history is cheap because re-applying
 * a row this device already holds is refused by the conflict resolver.
 */
export function rewindCursor(cursor: string): string {
  return rewind(cursor);
}

/**
 * Rows of one table whose effective timestamp is newer than `since`.
 *
 * `ORDER BY` the timestamp and then `rowid`, so a page boundary is at least
 * deterministic; see `rewindCursor` for why the bound is re-read rather than
 * trusted as exact.
 */
export async function scanRows(
  db: SyncDatabase,
  table: SyncTableName,
  since: string,
  limit = DEFAULT_PAGE_SIZE
): Promise<ScanPage<SyncRow>> {
  const spec = syncTableSpec(table);
  if (!(spec && isSafeIdentifier(table))) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const stamp = spec.updatedAtSql();
  const rows = await db.select<SyncRow[]>(
    `SELECT * FROM ${table}
      WHERE ${stamp} > ?
      ORDER BY ${stamp} ASC, rowid ASC
      LIMIT ?`,
    [since, limit]
  );
  const last = rows.at(-1);
  return {
    cursor: last ? (spec.effectiveUpdatedAt(last) ?? since) : since,
    hasMore: rows.length === limit,
    rows,
  };
}

/**
 * Keyset pagination by `rowid`, for the one-time migration.
 *
 * The migration sends the *whole* table, so a timestamp cursor would be the
 * wrong tool twice over: it cannot distinguish rows sharing a timestamp (three
 * inventory items entered in the same millisecond would arrive as two), and
 * there is no overlap window to catch the stragglers. `rowid` is unique by
 * definition, so `rowid > ?` has no boundary case at all.
 */
export async function scanRowsByRowId(
  db: SyncDatabase,
  table: SyncTableName,
  afterRowId: number,
  limit = DEFAULT_PAGE_SIZE
): Promise<{ cursor: number; hasMore: boolean; rows: SyncRow[] }> {
  if (!isSafeIdentifier(table)) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const rows = await db.select<(SyncRow & { rowid: number })[]>(
    `SELECT rowid AS rowid, * FROM ${table}
      WHERE rowid > ?
      ORDER BY rowid ASC
      LIMIT ?`,
    [afterRowId, limit]
  );
  const last = rows.at(-1);
  return {
    cursor: last ? Number(last.rowid) : afterRowId,
    hasMore: rows.length === limit,
    // `rowid` is the pagination handle, not a column: shipping it in the payload
    // would name a column the other side does not have.
    rows: rows.map(stripRowId),
  };
}

function stripRowId<T extends SyncRow>(row: T & { rowid?: number }): T {
  const { rowid: _rowid, ...rest } = row;
  return rest as T;
}

/**
 * A push cursor: the last *and* the rowid within it.
 *
 * Two parts because one is not enough. The timestamp alone cannot separate rows
 * written in the same millisecond — an import, a demo seed, or one board drag
 * saving several cards — so the row at the boundary would be pushed and the one
 * beside it never sent. `rowid` breaks the tie exactly, and it is unique by
 * definition.
 *
 * The encoding is local only. It lives in `sync_state` and never goes on the
 * wire, so the protocol keeps its plain timestamps and one client cannot change
 * the cursor format for the server or anyone else.
 */
export interface PushCursor {
  rowId: number;
  stamp: string;
}

export function parsePushCursor(text: string): PushCursor {
  const index = text.lastIndexOf("|");
  if (index < 0) {
    // A bare timestamp (or `""`) is read as "nothing at this rowid yet".
    return { rowId: 0, stamp: text };
  }
  const rowId = Number(text.slice(index + 1));
  return {
    rowId: Number.isFinite(rowId) ? rowId : 0,
    stamp: text.slice(0, index),
  };
}

export function formatPushCursor(cursor: PushCursor): string {
  return `${cursor.stamp}|${cursor.rowId}`;
}

/**
 * Rows to push: newer than the stored cursor, in keyset order.
 *
 * The predicate is `(stamp > ?) OR (stamp = ? AND rowid > ?)`, which is exact —
 * no overlap window, no re-sending, and no boundary row left behind.
 */
export async function scanRowsForPush(
  db: SyncDatabase,
  table: SyncTableName,
  cursor: PushCursor,
  limit = DEFAULT_PAGE_SIZE
): Promise<{ cursor: PushCursor; hasMore: boolean; rows: SyncRow[] }> {
  const spec = syncTableSpec(table);
  if (!(spec && isSafeIdentifier(table))) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const stamp = spec.updatedAtSql();
  const rows = await db.select<(SyncRow & { rowid: number })[]>(
    `SELECT rowid AS rowid, * FROM ${table}
      WHERE (${stamp} > ?) OR (${stamp} = ? AND rowid > ?)
      ORDER BY ${stamp} ASC, rowid ASC
      LIMIT ?`,
    [cursor.stamp, cursor.stamp, cursor.rowId, limit]
  );
  const last = rows.at(-1);
  return {
    cursor: last
      ? {
          rowId: Number(last.rowid),
          stamp: spec.effectiveUpdatedAt(last) ?? cursor.stamp,
        }
      : cursor,
    hasMore: rows.length === limit,
    rows: rows.map(stripRowId),
  };
}

/**
 * Tombstones to push, by the same exact keyset.
 *
 * They need it for the same reason the rows do, and one more: the pruning that
 * follows a successful push removes everything at or below the cursor, so a
 * tombstone left behind at the boundary would not merely be late — it would be
 * deleted locally and never sent. The compound cursor is what separates "sent"
 * from "sent or skipped".
 */
export async function scanTombstonesForPush(
  db: SyncDatabase,
  cursor: PushCursor,
  limit = DEFAULT_PAGE_SIZE
): Promise<{ cursor: PushCursor; hasMore: boolean; rows: ScannedTombstone[] }> {
  const rows = await db.select<RawTombstone[] & { rowid: number }[]>(
    `SELECT rowid AS rowid, table_name, row_key, deleted_at, device_id
       FROM sync_tombstones
      WHERE (deleted_at > ?) OR (deleted_at = ? AND rowid > ?)
      ORDER BY deleted_at ASC, rowid ASC
      LIMIT ?`,
    [cursor.stamp, cursor.stamp, cursor.rowId, limit]
  );
  const last = rows.at(-1);
  return {
    cursor: last
      ? { rowId: Number(last.rowid), stamp: last.deleted_at }
      : cursor,
    hasMore: rows.length === limit,
    rows: rows
      .map((row) => toScannedTombstone(row))
      .filter((row): row is ScannedTombstone => row !== null),
  };
}

interface RawTombstone {
  deleted_at: string;
  device_id: string | null;
  row_key: string;
  rowid: number;
  table_name: string;
}

function toScannedTombstone(row: RawTombstone): ScannedTombstone | null {
  // A tombstone for a table this build does not sync is skipped rather than
  // misfiled: it belongs to a newer build's table list.
  if (!isSyncTableName(row.table_name)) {
    return null;
  }
  return {
    deletedAt: row.deleted_at,
    deviceId: row.device_id,
    rowKey: row.row_key,
    table: row.table_name,
  };
}

/**
 * Tombstones newer than `since`.
 *
 * Each entry carries the table it belongs to, because the wire format groups
 * deletes by table and the client cannot usefully guess: `row_key` is a primary
 * key for a parent and a content key for a request's children.
 */
export async function scanTombstones(
  db: SyncDatabase,
  since: string,
  limit = DEFAULT_PAGE_SIZE
): Promise<ScanPage<ScannedTombstone>> {
  const rows = await db.select<RawTombstone[]>(
    `SELECT table_name, row_key, deleted_at, device_id FROM sync_tombstones
      WHERE deleted_at > ?
      ORDER BY deleted_at ASC
      LIMIT ?`,
    [since, limit]
  );
  const mapped = rows
    .map((row) => toScannedTombstone(row))
    .filter((row): row is ScannedTombstone => row !== null);
  const last = rows.at(-1);
  return {
    cursor: last?.deleted_at ?? since,
    hasMore: rows.length === limit,
    rows: mapped,
  };
}

/** Row count per synced table, for `/sync/status` and the settings panel. */
export async function countRows(
  db: SyncDatabase,
  table: SyncTableName
): Promise<number> {
  if (!isSafeIdentifier(table)) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const rows = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM ${table}`
  );
  return Number(rows[0]?.count ?? 0);
}

/** The newest effective timestamp in a table, for `/sync/status`. */
export async function newestTimestamp(
  db: SyncDatabase,
  table: SyncTableName
): Promise<string | null> {
  const spec = syncTableSpec(table);
  if (!(spec && isSafeIdentifier(table))) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const rows = await db.select<{ latest: string | null }[]>(
    `SELECT MAX(${spec.updatedAtSql()}) AS latest FROM ${table}`
  );
  return rows[0]?.latest ?? null;
}

/**
 * `sync_state` accessors. The table is created by migration 0014 and exists on
 * both ends: the client keeps its cursors and device id there, the Worker keeps
 * the one-time migration marker.
 */
export async function readStateValue(
  db: SyncDatabase,
  key: string
): Promise<string | null> {
  try {
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM sync_state WHERE key = ? LIMIT 1",
      [key]
    );
    return rows[0]?.value ?? null;
  } catch {
    // A database that predates migration 0014 has no table to read. Callers
    // treat `null` as "nothing recorded yet", which is true.
    return null;
  }
}

export async function writeStateValue(
  db: SyncDatabase,
  key: string,
  value: string
): Promise<void> {
  await db.execute(
    "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}
