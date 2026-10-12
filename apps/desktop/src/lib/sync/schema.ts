/**
 * CMIS Cloud Sync — the table registry.
 *
 * One description per synced table, used by the desktop client (to scan for
 * changes and to apply them) and by the Worker (to do exactly the same on D1).
 * Nothing here is platform-specific, so the Worker bundles this file straight
 * out of the app's source tree and there is only one definition of "what a row
 * key is" to get wrong.
 *
 * Two ideas make the rest of the engine small:
 *
 * 1. **Effective timestamp.** Change detection never reads `updated_at`
 *    directly; it reads `COALESCE(updated_at, <the table's own event time>)`.
 *    Migration 0014 backfills most rows, but the fallback is what makes a row
 *    that predates the column — or one written by a path nobody instrumented —
 *    still belong to the timeline instead of sitting at NULL forever, which in
 *    SQL is "not newer than anything" and therefore never synced.
 *
 * 2. **Row key.** A parent table is keyed by its primary key. A request's
 *    children are not: `saveRequest` rewrites them wholesale
 *    (DELETE + INSERT), so their AUTOINCREMENT ids change on every save and two
 *    devices editing the same request would agree on nothing. Their identity is
 *    their content, built from the same columns in the same order by the
 *    triggers in migration 0014 and by `rowKey()` below. `schema.test.ts` pins
 *    the two together against a real database.
 */

import type { SyncDelete, SyncRow, SyncTableName } from "./types";

/** The separator `char(31)` in migration 0014's delete triggers. */
export const UNIT_SEPARATOR = "\u001f";

/** Fallback timestamp for a row with no event time at all — "oldest". */
export const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * The newest local migration (`0014_sync_metadata.sql`). Sent with every
 * request so a Worker running against an older D1 can refuse the write instead
 * of applying a payload whose columns it does not have.
 */
export const SCHEMA_VERSION = 14;

export interface SyncTableSpec {
  /**
   * Columns that must never be written from a payload. Today that is only the
   * request children's AUTOINCREMENT `id`: their rows are identified by content,
   * so two devices inserting the same note must not fight over a rowid.
   */
  applyExcludeColumns: string[];
  /** JS mirror of `updatedAtSql`, for cursors and conflict reporting. */
  effectiveUpdatedAt: (row: SyncRow) => string | null;
  /**
   * Primary-key column, or `null` when rows are keyed by content. A `null`
   * parent is impossible — a child table only ever has a parent.
   */
  keyColumn: string | null;
  name: SyncTableName;
  /**
   * The foreign key a child row needs, or `null` for a table nothing depends on.
   * A pulled child whose parent is not here yet is skipped rather than inserted
   * into a constraint violation — the next pass brings it once the parent has
   * landed.
   *
   * `optional` marks a *nullable* link: a column the schema declares with
   * `ON DELETE SET NULL` rather than a child's `NOT NULL` parent. That is
   * deliberately a different case, because the row is the record and the link is
   * only a convenience, so a missing parent drops the link instead of
   * withholding the row. It is also what the database itself does when the
   * parent is deleted, so both ends agree on what a link with no target means.
   */
  parent: {
    column: string;
    /** `true` when a missing parent drops the link instead of the row. */
    optional?: boolean;
    table: SyncTableName;
  } | null;
  /** JS mirror of `rowKeySql`, for tests and conflict reporting. */
  rowKey: (row: SyncRow) => string;
  /** Key expression for a SQL statement, over `prefix + column`. */
  rowKeySql: (prefix?: string) => string;
  /** Change-timestamp expression for a SQL statement, over `prefix + column`. */
  updatedAtSql: (prefix?: string) => string;
}

/** First of the values that is a non-empty string, else `null`. */
function firstStamp(...values: (number | string | null | undefined)[]) {
  for (const value of values) {
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }
  return null;
}

function text(value: number | string | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function join(parts: (number | string | null)[]): string {
  return parts.map(text).join(UNIT_SEPARATOR);
}

/**
 * Tables in foreign-key order: a referenced table before its referrers.
 * Upserts apply in this order (so every foreign key resolves) and deletes
 * apply in reverse (so a child is gone before its parent is).
 *
 * Note `requests` sits *after* `inventory_items`: `requests.item_id`
 * references `inventory_items(id)`, so pushing requests onto an empty
 * database first fails the FK check on D1. The `parent` field alone does
 * not capture this — it only links content-keyed children — hence the
 * explicit position. `parent` is declared as well, as an *optional* link, so
 * that a pull whose item has not arrived (a page boundary, or an item this
 * device deleted) lands the request with a NULL link instead of aborting the
 * whole run on a foreign-key violation.
 */
export const SYNC_TABLES: SyncTableSpec[] = [
  {
    applyExcludeColumns: [],
    effectiveUpdatedAt: (row) => firstStamp(row.updated_at, row.created_at),
    keyColumn: "id",
    name: "categories",
    parent: null,
    rowKey: (row) => text(row.id),
    rowKeySql: (prefix = "") => `${prefix}id`,
    updatedAtSql: (prefix = "") =>
      `COALESCE(${prefix}updated_at, ${prefix}created_at)`,
  },
  {
    applyExcludeColumns: [],
    effectiveUpdatedAt: (row) => firstStamp(row.updated_at, row.created_at),
    keyColumn: "id",
    name: "vocabulary_terms",
    parent: null,
    rowKey: (row) => text(row.id),
    rowKeySql: (prefix = "") => `${prefix}id`,
    updatedAtSql: (prefix = "") =>
      `COALESCE(${prefix}updated_at, ${prefix}created_at)`,
  },
  {
    applyExcludeColumns: [],
    effectiveUpdatedAt: (row) => firstStamp(row.updated_at, row.created_at),
    keyColumn: "id",
    name: "inventory_items",
    parent: null,
    rowKey: (row) => text(row.id),
    rowKeySql: (prefix = "") => `${prefix}id`,
    updatedAtSql: (prefix = "") =>
      `COALESCE(${prefix}updated_at, ${prefix}created_at)`,
  },
  {
    applyExcludeColumns: [],
    effectiveUpdatedAt: (row) =>
      firstStamp(row.updated_at, row.archived_at, row.submitted_at),
    keyColumn: "id",
    name: "requests",
    // A nullable link, not a child's parent: `0009_request_item_id.sql` declares
    // it `ON DELETE SET NULL`. A request must land even when its item cannot.
    parent: { column: "item_id", optional: true, table: "inventory_items" },
    rowKey: (row) => text(row.id),
    rowKeySql: (prefix = "") => `${prefix}id`,
    // A request is re-stamped by migration 0014's triggers on every save; the
    // fallbacks only order the rows that predate the column.
    updatedAtSql: (prefix = "") =>
      `COALESCE(${prefix}updated_at, ${prefix}archived_at, ${prefix}submitted_at)`,
  },
  {
    applyExcludeColumns: [],
    // Deliberately the epoch rather than the parent's timestamp: a batch cursor
    // that inherited "now" would let this device's untouched copy overwrite the
    // other device's edit (see migration 0014's note on the backfill).
    effectiveUpdatedAt: (row) => firstStamp(row.updated_at) ?? EPOCH,
    keyColumn: "id",
    name: "inventory_batches",
    parent: { column: "item_id", table: "inventory_items" },
    rowKey: (row) => text(row.id),
    rowKeySql: (prefix = "") => `${prefix}id`,
    updatedAtSql: (prefix = "") => `COALESCE(${prefix}updated_at, '${EPOCH}')`,
  },
  {
    applyExcludeColumns: ["id"],
    effectiveUpdatedAt: (row) => firstStamp(row.updated_at, row.at),
    keyColumn: null,
    name: "request_history",
    parent: { column: "request_id", table: "requests" },
    rowKey: (row) =>
      join([
        row.request_id,
        row.at,
        row.actor,
        row.from_status,
        row.to_status,
        row.note,
      ]),
    rowKeySql: (prefix = "") =>
      [
        `${prefix}request_id`,
        `${prefix}at`,
        `${prefix}actor`,
        `COALESCE(${prefix}from_status, '')`,
        `${prefix}to_status`,
        `COALESCE(${prefix}note, '')`,
      ].join(" || char(31) || "),
    updatedAtSql: (prefix = "") => `COALESCE(${prefix}updated_at, ${prefix}at)`,
  },
  {
    applyExcludeColumns: ["id"],
    effectiveUpdatedAt: (row) => firstStamp(row.updated_at, row.at),
    keyColumn: null,
    name: "request_notes",
    parent: { column: "request_id", table: "requests" },
    rowKey: (row) => join([row.request_id, row.at, row.author, row.text]),
    rowKeySql: (prefix = "") =>
      [
        `${prefix}request_id`,
        `${prefix}at`,
        `${prefix}author`,
        `${prefix}text`,
      ].join(" || char(31) || "),
    updatedAtSql: (prefix = "") => `COALESCE(${prefix}updated_at, ${prefix}at)`,
  },
  {
    applyExcludeColumns: ["id"],
    effectiveUpdatedAt: (row) => firstStamp(row.updated_at, row.at),
    keyColumn: null,
    name: "dispensing_records",
    parent: { column: "request_id", table: "requests" },
    rowKey: (row) =>
      join([row.request_id, row.at, row.batch, row.expiry, row.qty, row.staff]),
    rowKeySql: (prefix = "") =>
      [
        `${prefix}request_id`,
        `${prefix}at`,
        `${prefix}batch`,
        `${prefix}expiry`,
        `${prefix}qty`,
        `${prefix}staff`,
      ].join(" || char(31) || "),
    updatedAtSql: (prefix = "") => `COALESCE(${prefix}updated_at, ${prefix}at)`,
  },
];

export const SYNC_TABLE_NAMES: SyncTableName[] = SYNC_TABLES.map(
  (table) => table.name
);

const SPEC_BY_NAME = new Map<SyncTableName, SyncTableSpec>(
  SYNC_TABLES.map((spec) => [spec.name, spec])
);

/** The spec for a table, or `undefined` for a table this build does not sync. */
export function syncTableSpec(name: string): SyncTableSpec | undefined {
  return SPEC_BY_NAME.get(name as SyncTableName);
}

/** Narrowing helper for values arriving from the network. */
export function isSyncTableName(value: string): value is SyncTableName {
  return SPEC_BY_NAME.has(value as SyncTableName);
}

/**
 * SQL identifiers are interpolated into statements, so anything that is not a
 * plain lower-case column name is refused rather than escaped. Column names come
 * from `PRAGMA table_info` on the receiving side, never from the payload, but
 * this is the check that keeps that promise honest.
 */
const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

export function isSafeIdentifier(value: string): boolean {
  return IDENTIFIER_RE.test(value);
}

/** SQLite's quote for a string literal: only `'` needs doubling. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The tombstone a hard delete of `row` would write, for the audit log and the
 * tests. `deleted_at` is the caller's clock, not read from the row.
 */
export function tombstoneFor(
  table: SyncTableName,
  row: SyncRow,
  deletedAt: string,
  deviceId: string | null = null
): SyncDelete {
  const spec = syncTableSpec(table);
  if (!spec) {
    throw new Error(`unknown sync table: ${table}`);
  }
  return { deletedAt, deviceId, rowKey: spec.rowKey(row) };
}
