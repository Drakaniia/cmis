/**
 * CMIS Cloud Sync — the one-time migration of data that predates sync.
 *
 * Strictly speaking this is not required for correctness: the first ordinary
 * push sends everything the cursors have never seen, and a fresh device's
 * cursors start empty. It exists because the spec asks for an explicit,
 * verifiable step (§6) and because "the switch was flipped and it quietly
 * uploaded 4,000 rows" is a worse story for a clinic than
 * `pnpm migrate-to-cloud`, which says what it sent.
 *
 * It is deliberately idempotent: it pushes the *whole* dataset, the server
 * applies it with the same last-write-wins guards as any other push, and it then
 * advances the local cursors to the high-water marks it just sent so the next
 * scheduled sync does not repeat the upload.
 */

import { isNewer } from "./conflict-resolver";
import { writePushCursors } from "./offline-queue";
import {
  newestTimestamp,
  readStateValue,
  scanRowsByRowId,
  scanTombstones,
  writeStateValue,
} from "./scan";
import { SCHEMA_VERSION, SYNC_TABLES } from "./schema";
import type {
  SyncDatabase,
  SyncDelete,
  SyncPushRequest,
  SyncPushResponse,
  SyncTableChange,
  SyncTableName,
} from "./types";

const MIGRATED_AT_KEY = "migrated_at";

/** Trailing slashes on an operator-typed endpoint, stripped once per run. */
const TRAILING_SLASH_RE = /\/+$/u;

export interface MigrationProgress {
  batches: number;
  rows: number;
  table: SyncTableName;
}

export interface MigrationResult {
  conflicts: number;
  deviceId: string;
  migratedAt: string;
  tables: Partial<Record<SyncTableName, number>>;
  total: number;
}

/** When this device last uploaded its pre-sync data, or `null`. */
export async function readMigrationMarker(
  db: SyncDatabase
): Promise<string | null> {
  const value = await readStateValue(db, MIGRATED_AT_KEY);
  return value === null || value === "" ? null : value;
}

/** `true` once this device has uploaded its pre-sync data. */
export async function isMigrated(db: SyncDatabase): Promise<boolean> {
  return (await readMigrationMarker(db)) !== null;
}

/**
 * Every row and tombstone, batched per table.
 *
 * Rows are paged by `rowid`, not by timestamp: this walk has to be *exact*, and
 * a timestamp cursor cannot separate rows written in the same millisecond (a
 * workbook import writes thousands) — nor is there an overlap window here to
 * catch the ones a page boundary left behind.
 */
export async function* iterateInitialPayload(
  db: SyncDatabase,
  batchSize: number
): AsyncGenerator<SyncTableChange[], void, void> {
  for (const spec of SYNC_TABLES) {
    let afterRowId = 0;
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: pages are read in order so the rowid keyset stays exact; this runs once per device
      const page = await scanRowsByRowId(db, spec.name, afterRowId, batchSize);
      if (page.rows.length === 0) {
        break;
      }
      yield [{ rows: page.rows, table: spec.name }];
      afterRowId = page.cursor;
      if (!page.hasMore) {
        break;
      }
    }
  }

  let deletedSince = "";
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: tombstones are paged in order so the cursor advances monotonically, once per device
    const page = await scanTombstones(db, deletedSince, batchSize);
    if (page.rows.length === 0) {
      break;
    }
    const byTable = new Map<SyncTableName, SyncDelete[]>();
    for (const entry of page.rows) {
      const list = byTable.get(entry.table) ?? [];
      list.push({
        deletedAt: entry.deletedAt,
        deviceId: entry.deviceId ?? null,
        rowKey: entry.rowKey,
      });
      byTable.set(entry.table, list);
    }
    yield [...byTable].map(([table, deletes]) => ({ deletes, table }));
    deletedSince = page.cursor;
    if (!page.hasMore) {
      break;
    }
  }
}

export interface MigrateOptions {
  batchSize?: number;
  db: SyncDatabase;
  deviceId: string;
  endpoint: string;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: MigrationProgress) => void;
  token?: string;
}

/**
 * Uploads this device's data to `POST /migrate/initial`.
 *
 * Batched, each batch acknowledged before the next is sent, so a failure
 * halfway leaves a partial — but *convergent* — cloud copy: re-running the
 * command re-sends everything (the server's upserts are idempotent) and the
 * counts it prints say what landed.
 */
export async function migrateToCloud(
  options: MigrateOptions
): Promise<MigrationResult> {
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("This runtime has no fetch implementation");
  }
  const batchSize = options.batchSize ?? 500;
  const url = `${options.endpoint.replace(TRAILING_SLASH_RE, "")}/migrate/initial`;
  const tables: Partial<Record<SyncTableName, number>> = {};
  let total = 0;
  let conflicts = 0;
  let batches = 0;

  for await (const batch of iterateInitialPayload(options.db, batchSize)) {
    const body: SyncPushRequest = {
      deviceId: options.deviceId,
      schemaVersion: SCHEMA_VERSION,
      tables: batch,
    };
    const response = await doFetch(url, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      method: "POST",
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `migrate/initial failed: ${response.status} ${response.statusText}${
          text === "" ? "" : ` — ${text.slice(0, 300)}`
        }`
      );
    }
    conflicts += (JSON.parse(text) as SyncPushResponse).conflicts.length;
    batches += 1;
    for (const change of batch) {
      const sent = change.rows?.length ?? change.deletes?.length ?? 0;
      if (sent === 0) {
        continue;
      }
      tables[change.table] = (tables[change.table] ?? 0) + sent;
      total += sent;
      options.onProgress?.({ batches, rows: sent, table: change.table });
    }
  }

  const migratedAt = new Date().toISOString();
  await writeStateValue(options.db, MIGRATED_AT_KEY, migratedAt);
  await advanceCursorsToSent(options.db);
  return { conflicts, deviceId: options.deviceId, migratedAt, tables, total };
}

/**
 * Moves the *push* cursors to the high-water marks the migration just uploaded.
 *
 * Without this the next scheduled sync re-sends the whole database, which is
 * correct but pointless: the server already has it and every row would be
 * refused as "not strictly newer".
 *
 * The *pull* cursors are deliberately left where they were. A device that
 * migrates data up is not thereby up to date — the cloud may hold records this
 * device has never seen, and some of them carry timestamps older than the newest
 * row here. Advancing the pull cursor would step over exactly those.
 */
export async function advanceCursorsToSent(db: SyncDatabase): Promise<void> {
  const rows: Partial<Record<SyncTableName, string>> = {};
  for (const spec of SYNC_TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: one aggregate per table, eight in total
    rows[spec.name] = (await newestTimestamp(db, spec.name)) ?? "";
  }
  let deleted = "";
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: tombstones are paged in order so the cursor advances monotonically
    const page = await scanTombstones(db, deleted, 1000);
    if (page.rows.length === 0) {
      break;
    }
    deleted = isNewer(page.cursor, deleted) ? page.cursor : deleted;
    if (!page.hasMore) {
      break;
    }
  }
  await writePushCursors(db, { deleted, rows });
}

/** Forgets the migration marker, so the command can be run again on purpose. */
export async function resetMigrationMarker(db: SyncDatabase): Promise<void> {
  await writeStateValue(db, MIGRATED_AT_KEY, "");
}
