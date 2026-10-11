/**
 * CMIS Cloud Sync Worker — D1, wearing the shape the engine already speaks.
 *
 * `lib/sync` was written against two methods (`select` / `execute`) because that
 * is all `tauri-plugin-sql` needs; this adapter is the entire cost of running
 * that same engine against D1. No query in the engine knows which of the two
 * databases it is talking to.
 */

import { resetColumnCacheForTests } from "../../../apps/desktop/src/lib/sync/changes";
import type { SyncDatabase } from "../../../apps/desktop/src/lib/sync/types";
import type { D1DatabaseLike } from "./env";

export function d1Database(db: D1DatabaseLike): SyncDatabase {
  return {
    execute: async (sql, params) =>
      db
        .prepare(sql)
        .bind(...(params ?? []))
        .run(),
    select: async <T>(sql: string, params?: unknown[]): Promise<T> => {
      const result = await db
        .prepare(sql)
        .bind(...(params ?? []))
        .all<T>();
      return (result.results ?? []) as T;
    },
  };
}

/**
 * A Worker isolate is long-lived and D1's schema is fixed, so the column lists
 * read with `PRAGMA table_info` are cached per isolate — but never between them,
 * which is what keeps a redeployed schema correct without a cache-busting flag.
 */
export function resetWorkerCaches(): void {
  resetColumnCacheForTests();
}
