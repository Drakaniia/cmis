import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { SyncDatabase } from "@/lib/sync/types";
import { migrationFiles } from "./migration-files";
import { MIGRATIONS_DIR } from "./project-paths";

/**
 * Test helper: a real SQLite database with every migration applied.
 *
 * Sync's correctness depends on migration 0014's triggers — `updated_at`
 * stamping, the `char(31)` content keys, the tombstones — so a test that stubs
 * the database would be testing nothing that matters. These tests open the same
 * engine the desktop app talks to, run the same SQL files in the same order, and
 * then break the rules a sync has to survive (a burst of saves, delete-and-
 * rewrite, a wipe) against it.
 *
 * `PRAGMA foreign_keys` is on because D1 and `tauri-plugin-sql` both have it on;
 * SQLite's default is off, and a cascade test that quietly did nothing would be
 * worse than no test.
 */
export function openSyncedDatabase(): {
  db: DatabaseSync;
  sync: SyncDatabase;
} {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of migrationFiles()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return { db, sync: sqliteSyncDatabase(db) };
}

export function sqliteSyncDatabase(db: DatabaseSync): SyncDatabase {
  const bind = (params: unknown[] = []) => params as SQLInputValue[];
  return {
    execute: async (sql, params) => db.prepare(sql).run(...bind(params)),
    select: async <T>(sql: string, params?: unknown[]): Promise<T> =>
      db.prepare(sql).all(...bind(params)) as T,
  };
}

/**
 * Marks everything the migrations seeded as already sent.
 *
 * A freshly migrated database is not empty: 0006 seeds `categories` and 0013
 * seeds `vocabulary_terms`, and both carry an `updated_at` from migration time.
 * That is real pending work in production (a first sync does upload the shipped
 * taxonomy once), but it is noise in a test about one item — so the tests that
 * care about their own rows clear it first.
 */
export async function flushSeedBacklog(sync: SyncDatabase): Promise<void> {
  const { collectLocalChanges, writePushCursors } = await import(
    "@/lib/sync/offline-queue"
  );
  const collected = await collectLocalChanges(sync, { limit: 10_000 });
  await writePushCursors(sync, collected.cursors);
}

/** A timestamp later than any migration seed, for rows a test creates itself. */
export const AFTER_SEEDS = "2030-01-01T00:00:00.000Z";

/** A `fetch` that answers with canned JSON and records what it was asked. */
export function stubFetch(
  handler: (
    url: string,
    init: RequestInit
  ) => {
    body?: unknown;
    status?: number;
    statusText?: string;
  }
): { calls: { body: unknown; url: string }[]; fetchImpl: typeof fetch } {
  const calls: { body: unknown; url: string }[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ body, url });
    const response = handler(url, init ?? {});
    const status = response.status ?? 200;
    return Promise.resolve(
      new Response(
        response.body === undefined ? "" : JSON.stringify(response.body),
        {
          status,
          statusText: response.statusText ?? (status === 200 ? "OK" : "Error"),
        }
      )
    );
  }) as typeof fetch;
  return { calls, fetchImpl };
}
