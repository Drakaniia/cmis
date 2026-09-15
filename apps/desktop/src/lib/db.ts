import type Database from "@tauri-apps/plugin-sql";

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
