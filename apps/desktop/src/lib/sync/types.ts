/**
 * CMIS Cloud Sync — the shapes that cross the wire.
 *
 * These types are shared by the desktop client (`lib/sync`), the Cloudflare
 * Worker (`workers/sync`) and the integration tests, so the Worker and the
 * client cannot drift into two dialects of the same protocol. Keep the module
 * free of platform imports (no React, no `@tauri-apps/*`, no `@/` aliases) —
 * the Worker bundles it directly out of the app's source tree.
 */

/** The tables `docs/cloud-sync-spec.md` §4 puts in scope (plus `categories`). */
export type SyncTableName =
  | "categories"
  | "dispensing_records"
  | "inventory_batches"
  | "inventory_items"
  | "request_history"
  | "request_notes"
  | "requests"
  | "vocabulary_terms";

/** One row, as SQLite hands it back. */
export type SyncRow = Record<string, number | string | null>;

/** A hard delete, identified by the row key rather than by SQLite's rowid. */
export interface SyncDelete {
  deletedAt: string;
  deviceId?: string | null;
  rowKey: string;
}

/** Changes for one table, in both directions. */
export interface SyncTableChange {
  cursor?: string;
  deletes?: SyncDelete[];
  hasMore?: boolean;
  rows?: SyncRow[];
  table: SyncTableName;
}

/** `POST /sync/push` and `POST /migrate/initial`. */
export interface SyncPushRequest {
  deviceId: string;
  schemaVersion: number;
  tables: SyncTableChange[];
}

/** Why a row was not applied. `local` is the device that pushed it. */
export type SyncConflictResolution =
  | "deleted-newer"
  | "remote-newer"
  | "row-newer";

export interface SyncConflict {
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
  resolution: SyncConflictResolution;
  rowKey: string;
  table: SyncTableName;
}

export interface SyncPushResponse {
  applied: Partial<Record<SyncTableName, number>>;
  conflicts: SyncConflict[];
  ok: true;
  serverTime: string;
  skipped: Partial<Record<SyncTableName, number>>;
}

/** `POST /sync/pull`. */
export interface SyncPullRequest {
  cursors: {
    deleted: string;
    rows: Partial<Record<SyncTableName, string>>;
  };
  deviceId: string;
  limit?: number;
  schemaVersion: number;
}

/**
 * Deletes come back grouped inside `tables` (the same shape a push uses), so
 * there is one spelling of "which table is this tombstone for" in the protocol.
 */
export interface SyncPullResponse {
  deletedCursor: string;
  hasMore: boolean;
  ok: true;
  serverTime: string;
  tables: SyncTableChange[];
}

/** `GET /sync/status`. */
export interface SyncStatusResponse {
  counts: Partial<Record<SyncTableName, number>>;
  /** When the pre-sync upload ran, if it ever has. */
  initialMigratedAt?: string | null;
  lastWriteAt: string | null;
  ok: true;
  schemaVersion: number;
  serverTime: string;
  /** Summed `qty` where the table has one (inventory rows + batches). */
  totals?: Partial<Record<SyncTableName, number>>;
}

export interface SyncErrorResponse {
  error: string;
  ok: false;
}

/**
 * The only database surface sync needs: two methods, both of them already on
 * `tauri-plugin-sql`'s `Database`. Narrowing to this is what lets the same
 * engine run against the desktop's SQLite handle, the Worker's D1 binding, and
 * an in-memory `node:sqlite` database in tests.
 */
export interface SyncDatabase {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  select: <T>(sql: string, params?: unknown[]) => Promise<T>;
}

/** What an apply pass did, for the status line and the audit log. */
export interface SyncApplyOutcome {
  applied: number;
  conflicts: SyncConflict[];
  skipped: number;
}
