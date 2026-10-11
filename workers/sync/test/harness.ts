/**
 * Test harness: a real SQLite database standing in for D1.
 *
 * The point of the Worker tests is that they exercise the *same* SQL the
 * deployed Worker runs — including migration 0014's triggers, the `char(31)`
 * content keys and the conflict guards. A hand-written stub that returns canned
 * rows would prove nothing about any of that, so the stand-in is `node:sqlite`
 * with every migration file applied in order, plus the `prepare/bind/all/run`
 * surface `d1.ts` expects.
 *
 * Real D1 is SQLite, so the only difference between this and production is where
 * the bytes live — which is exactly the kind of difference a test should be
 * allowed to have.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { SyncDatabase } from "../../../apps/desktop/src/lib/sync/types";
import type { D1DatabaseLike } from "../src/env";

/** `workers/sync/test` → repository root. */
const HERE = import.meta.dirname;
export const REPO_ROOT = resolve(HERE, "..", "..", "..");
export const MIGRATIONS_DIR = join(
  REPO_ROOT,
  "apps",
  "desktop",
  "src-tauri",
  "migrations"
);

/** Truncates a statement so a failure message stays readable. */
export function shorten(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 90);
}

export interface FakeD1 extends D1DatabaseLike {
  db: DatabaseSync;
}

/**
 * D1's prepared-statement surface over `node:sqlite`.
 *
 * `all()` returns `{ results }` and `run()` returns the change info, which is
 * what `d1Database()` reads. Statements are re-prepared per call, matching D1
 * (which has no persistent handles) rather than caching here.
 */
export function fakeD1(db: DatabaseSync): FakeD1 {
  const bind = (params: unknown[]) => params as SQLInputValue[];
  return {
    db,
    prepare: (sql: string) => {
      let bound: unknown[] = [];
      const statement = {
        all: <T>() => {
          const results = db.prepare(sql).all(...bind(bound)) as T[];
          return Promise.resolve({ results });
        },
        bind: (...values: unknown[]) => {
          bound = values;
          return statement;
        },
        run: async () => db.prepare(sql).run(...bind(bound)),
      };
      return statement;
    },
  };
}

/**
 * A device database: every migration applied, `PRAGMA foreign_keys` on (D1 and
 * the desktop both enforce them; SQLite does not by default).
 */
export function openDeviceDatabase(path = ":memory:"): {
  db: DatabaseSync;
  sync: SyncDatabase;
} {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of migrationFiles()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return { db, sync: sqliteSyncDatabase(db) };
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** The two methods `lib/sync` needs, over `node:sqlite`. */
export function sqliteSyncDatabase(db: DatabaseSync): SyncDatabase {
  const bind = (params: unknown[] = []) => params as SQLInputValue[];
  return {
    execute: async (sql, params) => db.prepare(sql).run(...bind(params)),
    select: async <T>(sql: string, params?: unknown[]): Promise<T> =>
      db.prepare(sql).all(...bind(params)) as T,
  };
}

/** An `Env` for `handleRequest`, with an optional expected token. */
export function workerEnv(
  d1: FakeD1,
  syncToken?: string
): { DB: D1DatabaseLike; SYNC_TOKEN?: string } {
  return { DB: d1, ...(syncToken ? { SYNC_TOKEN: syncToken } : {}) };
}
