import { copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { migrateToCloud, readMigrationMarker } from "@/lib/sync/migration";
import { ensureDeviceId } from "@/lib/sync/offline-queue";
import { sqliteSyncDatabase } from "@/test/sync-database";

/**
 * One-shot maintenance runner — **not** part of `pnpm test`.
 *
 * Uploads the desktop database's existing contents to the sync Worker, the
 * spec's §6 "one-time migration". It talks to `POST /migrate/initial`, which
 * applies the same last-write-wins rules as any other push, so running it twice
 * is harmless and running it after the scheduled sync has already started is
 * harmless too.
 *
 * It lives outside `apps/desktop/vite.config.ts`'s `include` on purpose: a test
 * suite must never upload the clinic's data. Run it explicitly:
 *
 *     pnpm migrate-to-cloud
 *
 * Environment:
 *   SYNC_API_ENDPOINT   the Worker URL (required; the same variable the app
 *                       reads at build time)
 *   SYNC_TOKEN          optional shared secret, if the Worker sets one
 *   CMIS_DB             the sqlite file to upload (default: the dev app's)
 */

/**
 * The **dev** bundle identifier, matching `src-tauri/tauri.dev.conf.json`.
 *
 * This script reads the database and copies it, and it must never default to the
 * shipped app's folder by accident — the same rule `seed:demo` follows. Point
 * `CMIS_DB` at a file explicitly to target anything else.
 */
const APP_IDENTIFIER = "com.cmis.app.dev";
const DB_FILE = "cmis.db";

function defaultDbPath(): string {
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appData, APP_IDENTIFIER, DB_FILE);
  }
  if (process.platform === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      APP_IDENTIFIER,
      DB_FILE
    );
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(configHome, APP_IDENTIFIER, DB_FILE);
}

function log(...parts: unknown[]) {
  // eslint-disable-next-line no-console -- this runner reports to a human
  console.log(...parts);
}

it("uploads the desktop database to the cloud sync Worker", async () => {
  const endpoint = process.env.SYNC_API_ENDPOINT ?? "";
  const dbPath = process.env.CMIS_DB ?? defaultDbPath();

  log(`\n${"=".repeat(72)}`);
  log(`endpoint : ${endpoint || "(unset)"}`);
  log(`database : ${dbPath}`);

  if (endpoint === "") {
    log("skipped  : set SYNC_API_ENDPOINT to the Worker URL");
    return;
  }
  expect(
    existsSync(dbPath),
    `missing database ${dbPath} — launch the desktop app once so the SQL plugin creates it, or set CMIS_DB`
  ).toBe(true);

  // A file backup first: this script only reads, but it is the kind of step an
  // operator runs once, and a copy costs nothing.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${dbPath}.before-sync-migration-${stamp}`;
  copyFileSync(dbPath, backup);
  log(`backup   : ${backup}`);

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000");
  const sync = sqliteSyncDatabase(db);

  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((row) => String((row as { name: string }).name));
    expect(
      tables,
      "the database is not migrated — open the app once so sqlx applies migration 0014"
    ).toContain("sync_state");

    const deviceId = await ensureDeviceId(sync);
    log(`device   : ${deviceId}`);
    log(`already  : ${(await readMigrationMarker(sync)) ?? "never migrated"}`);

    const result = await migrateToCloud({
      db: sync,
      deviceId,
      endpoint,
      onProgress: (progress) => {
        log(
          `  sent ${String(progress.rows).padStart(4)} rows · ${progress.table}`
        );
      },
      token: process.env.SYNC_TOKEN,
    });

    log("\nRESULT");
    for (const [table, count] of Object.entries(result.tables)) {
      log(`  ${table.padEnd(19)} ${count}`);
    }
    log(`  ${"total".padEnd(19)} ${result.total}`);
    log(`  ${"conflicts".padEnd(19)} ${result.conflicts}`);
    log(`  ${"migrated at".padEnd(19)} ${result.migratedAt}`);

    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(
      await readMigrationMarker(sync),
      "the marker must be written, or the next automatic sync re-uploads everything"
    ).toBe(result.migratedAt);
  } finally {
    db.close();
  }

  log(`${"=".repeat(72)}\n`);
}, 300_000);
