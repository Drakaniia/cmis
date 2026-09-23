import type Database from "@tauri-apps/plugin-sql";
import { isTauriRuntime } from "./open-external";

const DB_URL = "sqlite:cmis.db";

let databasePromise: Promise<Database> | null = null;

/**
 * Singleton accessor for `sqlite:cmis.db`.
 * Caches the `Database.load` promise so every query reuses one
 * IPC handle instead of paying open+ migration cost per call.
 * Resets on failure so a later call can retry.
 */
export function getDb(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = (async () => {
      // The browser preview has no Tauri, so the SQL plugin cannot load and every
      // query would throw. There the dev server's own SQLite answers instead.
      //
      // A `tauri dev` window is served by that same dev server, so the Tauri
      // check is what keeps the desktop app on its real database; the Vitest
      // check keeps mocked-database tests off the network.
      if (
        import.meta.env.DEV &&
        import.meta.env.MODE !== "test" &&
        !isTauriRuntime()
      ) {
        const { default: PreviewDatabase } = await import("./preview-db");
        return (await PreviewDatabase.load(DB_URL)) as unknown as Database;
      }

      const { default: SqlDatabase } = await import("@tauri-apps/plugin-sql");
      return SqlDatabase.load(DB_URL) as Promise<Database>;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    }) as Promise<Database>;
  }
  return databasePromise;
}

/** For tests or explicit teardown — clears cached handle. */
export function resetDbForTesting(): void {
  databasePromise = null;
}

/**
 * Close the SQL plugin connection before a whole-file restore swap
 * (backup-restore spec F10.4). The plugin holds the live `cmis.db` open, so
 * renaming over it with a live pool would fail or corrupt. Best-effort: a
 * missing handle is already closed.
 */
export async function closeDb(): Promise<void> {
  const pending = databasePromise;
  databasePromise = null;
  if (!pending) {
    return;
  }
  try {
    const db = await pending;
    await (
      db as unknown as { close?: (name?: string) => Promise<unknown> }
    ).close?.();
  } catch {
    // already closed or never opened — the swap proceeds regardless
  }
}

/**
 * Wipe order is FK-safe: children before parents.
 *
 * `requests` is the real table name: the previous `request_queue` was a label no
 * migration ever created, so that statement was a silent no-op and Wipe All Data
 * never actually cleared the queue.
 *
 * All operational tables are cleared so Analytics returns to an empty state:
 * - `dispensing_events` + `audit_log` (stock-in `after_json.received`) drive
 *   Stock Movement (`useStockMovement`)
 * - `inventory_items` + `dispensing_events` drive Low-Stock Trend
 *   (`useLowStockTrend` / `reconstructLowStock`)
 * - `inventory_batches` drives Expiry Timeline
 * Leaving any of them (and `audit_log` in particular) makes the charts show
 * pre-wipe history after a destructive reset.
 *
 * `audit_log` is cleared here and then a single "Wiped all data" entry is
 * re-inserted after the loop, so the destructive action remains auditable
 * without preserving its historical `stock-in` rows.
 */
export const WIPE_STATEMENTS = [
  "DELETE FROM dispensing_records",
  "DELETE FROM request_notes",
  "DELETE FROM request_history",
  "DELETE FROM dispensing_events",
  "DELETE FROM requests",
  "DELETE FROM inventory_batches",
  "DELETE FROM trash_records",
  "DELETE FROM audit_log",
  "DELETE FROM inventory_items",
  "VACUUM",
] as const;

const CMIS_KEYS = [
  "cmis-zoom",
  "cmis-sidebar-collapsed",
  "cmis-density",
  "cmis-panel-ratio",
  "cmis-help-hint",
] as const;

/**
 * Puts the shipped taxonomy back after a settings reset.
 *
 * "Also reset categories" has to actually reach them: they are rows now
 * (migration 0006), not React state that a reload would drop. The defaults are
 * written back in the same breath, so the dropdowns are not left empty — a wipe
 * should return the app to a first launch, not to a state no launch can produce.
 *
 * Best-effort: a database from before that migration has no table to clear, and
 * that must not turn a completed wipe into a failure.
 */
async function reseedCategories(db: unknown): Promise<void> {
  try {
    const { DEFAULT_CATEGORY_NAMES, seedCategoryId } = await import(
      "@/features/inventory/domain/categories"
    );
    const conn = db as {
      execute: (sql: string, params?: unknown[]) => Promise<unknown>;
    };
    const now = new Date().toISOString();
    const marks = DEFAULT_CATEGORY_NAMES.map(() => "(?, ?, ?, ?)").join(", ");
    await conn.execute("DELETE FROM categories");
    await conn.execute(
      `INSERT OR IGNORE INTO categories (id, name, created_at, updated_at) VALUES ${marks}`,
      DEFAULT_CATEGORY_NAMES.flatMap((name) => [
        seedCategoryId(name),
        name,
        now,
        now,
      ])
    );
  } catch {
    // ignore - the categories table may not exist yet
  }
}

export async function wipeAllData(opts?: {
  resetSettings?: boolean;
}): Promise<void> {
  const db = await getDb();
  for (const stmt of WIPE_STATEMENTS) {
    const d = db as unknown as {
      exec?: (s: string) => Promise<unknown>;
      execute?: (s: string) => Promise<unknown>;
    };
    if (typeof d.exec === "function") {
      // biome-ignore lint/performance/noAwaitInLoops: FK-safe sequential wipe must run in order
      await d.exec(stmt);
    } else if (typeof d.execute === "function") {
      await d.execute(stmt);
    } else {
      await (db as unknown as { exec: (s: string) => Promise<unknown> }).exec(
        stmt
      );
    }
  }
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("cmis-")) {
      localStorage.removeItem(k);
    }
  }
  for (const k of CMIS_KEYS) {
    localStorage.removeItem(k);
  }
  // Written after the tables are empty, so the log explains the empty database.
  // The preceding `DELETE FROM audit_log` ensures analytics sources
  // (`stock-in` rows) do not survive a wipe; this single entry is the
  // remaining audit trail. Failing here would report a data loss that did not occur.
  const { recordAudit } = await import("@/features/admin/audit/write-audit");
  await recordAudit(
    db as unknown as {
      execute: (s: string, p?: unknown[]) => Promise<unknown>;
    },
    {
      action: "settings",
      detail:
        "Wiped all data — inventory, batches, requests, dispensing and Trash cleared; audit log reset",
      targetKind: "settings",
    },
    { bestEffort: true }
  );
  try {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore("updater.json");
    await store.set("lastCheckedAt", null);
    await store.save();
  } catch {
    // ignore - updater store may not exist in test or non-Tauri env
  }
  if (opts?.resetSettings) {
    try {
      const d = db as unknown as {
        exec?: (s: string) => Promise<unknown>;
        execute?: (s: string) => Promise<unknown>;
      };
      if (typeof d.exec === "function") {
        await d.exec("DELETE FROM app_meta");
      } else if (typeof d.execute === "function") {
        await d.execute("DELETE FROM app_meta");
      }
    } catch {
      // ignore - app_meta may not exist
    }
    try {
      await import("@/features/admin/settings/hooks/use-settings");
    } catch {
      // ignore - settings hook is handled by caller resetting DEFAULT_SETTINGS
    }
    await reseedCategories(db);
  }
}
