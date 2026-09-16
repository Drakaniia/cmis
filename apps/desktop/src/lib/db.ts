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

export const WIPE_STATEMENTS = [
  "DELETE FROM dispensing_events",
  "DELETE FROM request_queue",
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
  }
}
