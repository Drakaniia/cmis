import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it } from "vitest";

import { importInventoryCsv } from "@/features/inventory/import/import";
import { inventoryXlsxToCsv } from "@/features/inventory/import/xlsx-parser";
import { REPO_ROOT } from "@/test/project-paths";

/**
 * One-shot maintenance runner — **not** part of `pnpm test`.
 *
 * It puts the converted monthly workbook into the *real* desktop database using
 * the app's own parser and importer, so what lands in SQLite is byte-for-byte
 * what the Data page's Import button would write. Then it re-runs the SELECTs the
 * app's pages issue, so a broken query shows up here instead of as an empty card
 * in the UI.
 *
 * It lives outside `apps/desktop/vite.config.ts`'s `include` on purpose: a test
 * suite must never write to the user's database. Run it explicitly:
 *
 *     cd apps/desktop
 *     npx vitest run --config ../../scripts/vitest.import.config.ts
 *
 * Environment:
 *   CMIS_WORKBOOK  path to the workbook  (default: the AUGUST 2026 export)
 *   CMIS_MONTH     dispensing month       (default: 2026-08)
 *   CMIS_DB        target sqlite file     (default: the app's config-dir DB)
 */

const DEFAULT_WORKBOOK = join(
  REPO_ROOT,
  "AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx"
);

const WORKBOOK = process.env.CMIS_WORKBOOK ?? DEFAULT_WORKBOOK;
const MONTH = process.env.CMIS_MONTH ?? "2026-08";

const APP_IDENTIFIER = "com.cmis.app";
const DB_FILE = "cmis.db";

/**
 * Mirrors tauri-plugin-sql's `path_mapper`: a `sqlite:<file>` connection string
 * resolves to `<app_config_dir>/<file>`, and the app's config dir is keyed by the
 * bundle identifier from `tauri.conf.json`.
 */
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

const DB_PATH = process.env.CMIS_DB ?? defaultDbPath();

/** The app's `DbLike` shape, backed by the same engine sqlx uses. */
function openDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  const bind = (params: unknown[] = []) => params as SQLInputValue[];
  return {
    all: <T>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...bind(params)) as T[],
    close: () => db.close(),
    execute: (sql: string, params: unknown[] = []) => {
      if (params.length === 0) {
        db.exec(sql);
        return Promise.resolve({});
      }
      return Promise.resolve(db.prepare(sql).run(...bind(params)));
    },
    one: <T>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).get(...bind(params)) as T,
    select: async <T>(sql: string, params: unknown[] = []): Promise<T> =>
      db.prepare(sql).all(...bind(params)) as T,
  };
}

function log(...parts: unknown[]) {
  // eslint-disable-next-line no-console -- this runner reports to a human
  console.log(...parts);
}

const REQUIRED_TABLES = [
  "dispensing_events",
  "inventory_batches",
  "inventory_items",
  "request_history",
  "requests",
];

it("imports the monthly workbook into the desktop database", async () => {
  log(`\n${"=".repeat(72)}`);
  log(`workbook : ${WORKBOOK}`);
  log(`month    : ${MONTH}`);
  log(`database : ${DB_PATH}`);

  if (!existsSync(WORKBOOK)) {
    log(
      `skipped  : workbook not present — place clinic file at ${WORKBOOK} or set CMIS_WORKBOOK (data is imported, not tracked)`
    );
    return;
  }
  expect(
    existsSync(DB_PATH),
    `missing database ${DB_PATH} — launch the desktop app once so the SQL plugin creates and migrates it, or set CMIS_DB`
  ).toBe(true);

  const before = statSync(DB_PATH);
  log(`size     : ${before.size} bytes (before import)`);

  //    app makes its own in-database backup tables; this is the belt to that.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileBackup = `${DB_PATH}.backup-${stamp}`;
  copyFileSync(DB_PATH, fileBackup);
  log(`backup   : ${fileBackup}`);

  const db = openDb(DB_PATH);

  try {
    const tables = db
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .map((row) => row.name);
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    expect(
      missing,
      `database is not migrated (missing ${missing.join(", ")}) — the app registers migrations in src-tauri/src/lib.rs; open the app once so sqlx applies them`
    ).toEqual([]);

    const preRun = db.one<{ items: number; events: number }>(
      `SELECT (SELECT COUNT(*) FROM inventory_items) AS items,
              (SELECT COUNT(*) FROM dispensing_events) AS events`
    );
    log(`before   : ${preRun.items} items, ${preRun.events} dispensing events`);

    const csv = inventoryXlsxToCsv(new Uint8Array(readFileSync(WORKBOOK)));
    const result = await importInventoryCsv(csv, db, { month: MONTH });

    log("\nIMPORT RESULT");
    for (const [key, value] of Object.entries(result)) {
      if (key === "warnings") {
        continue;
      }
      log(`  ${key.padEnd(17)} ${value}`);
    }
    log(`  warnings          ${result.warnings.length}`);
    for (const warning of result.warnings.slice(0, 10)) {
      log(
        `      · row ${warning.row} ${warning.column}: ${warning.raw} → ${String(
          warning.coerced
        )} (${warning.reason})`
      );
    }

    expect(result.imported).toBeGreaterThan(0);
    expect(result.inserted + result.updated).toBe(result.imported);

    // 3) Re-run the queries the app's pages issue, so a broken SELECT surfaces
    //    here rather than as a silently empty card.
    log("\nPAGE QUERIES");

    // Mirrors the app's own query, which orders by the strength pair because
    // `dosage` is no longer read anywhere (strength spec §6.2 option B: the
    // column is left in place but inert).
    const inventory = db.all<{
      display_name: string;
      form: string;
      name: string;
      pack_size: string;
      qty: number;
      status: string;
      strength_unit: string;
      strength_value: string;
    }>(
      "SELECT * FROM inventory_items ORDER BY name COLLATE NOCASE, strength_value COLLATE NOCASE, form COLLATE NOCASE"
    );
    log(
      `  Stock Management      ${inventory.length} rows (ORDER BY name NOCASE)`
    );

    // The four stored columns are the whole point of the change: assert the
    const incomplete = inventory.filter(
      (row) =>
        row.strength_value.trim() === "" ||
        row.strength_unit.trim() === "" ||
        row.form.trim() === "" ||
        row.pack_size.trim() === ""
    ).length;
    const unlabelled = inventory.filter(
      (row) => row.display_name.trim() === ""
    ).length;
    log(
      `  strength columns      ${inventory.length - incomplete} complete, ${incomplete} incomplete`
    );
    log(`  display_name blank    ${unlabelled}`);
    for (const row of inventory.slice(0, 5)) {
      log(`      · ${row.display_name || "(none)"}`);
    }
    expect(unlabelled).toBe(0);
    expect(incomplete).toBeLessThan(inventory.length);

    const statuses = db.all<{ status: string; c: number }>(
      "SELECT status, COUNT(*) AS c FROM inventory_items GROUP BY status ORDER BY c DESC"
    );
    log(
      `  status mix            ${statuses
        .map((row) => `${row.status}=${row.c}`)
        .join(" ")}`
    );

    const dash = db.one<{
      items: number;
      low: number;
      pending: number;
      expiring: number;
      needs_batch: number;
    }>(
      `SELECT (SELECT COUNT(*) FROM inventory_items) AS items,
              (SELECT COUNT(*) FROM inventory_items WHERE status='low') AS low,
              (SELECT COUNT(*) FROM requests WHERE status='pending') AS pending,
              (SELECT COUNT(*) FROM inventory_batches WHERE julianday(expiry) - julianday('now') <= 30) AS expiring,
              (SELECT COUNT(*) FROM inventory_items WHERE needs_batch=1) AS needs_batch`
    );
    log(
      `  Home dashboard        items=${dash.items} low=${dash.low} pending=${dash.pending} expiring30d=${dash.expiring} needsBatch=${dash.needs_batch}`
    );

    const movement = db.all<{ date: string; total: number }>(
      "SELECT date, SUM(qty) as total FROM dispensing_events WHERE month = ? GROUP BY date ORDER BY date",
      [MONTH]
    );
    log(
      `  Reports movement      ${movement.length} days, ${movement.reduce(
        (sum, row) => sum + row.total,
        0
      )} units total`
    );

    const top = db.all<{ name: string; qty: number }>(
      "SELECT i.id as id, COALESCE(NULLIF(trim(i.display_name), ''), i.name || ' ' || i.dosage) as name, i.sku as sku, i.category as category, SUM(d.qty) as qty FROM dispensing_events d JOIN inventory_items i ON d.item_id=i.id WHERE d.month=? GROUP BY i.id ORDER BY qty DESC LIMIT 5",
      [MONTH]
    );
    log("  Top dispensed         ");
    for (const row of top) {
      log(`      ${String(row.qty).padStart(4)}  ${row.name}`);
    }

    const usage = db.all<{ category: string | null; total: number }>(
      "SELECT i.category as category, SUM(d.qty) as total FROM dispensing_events d JOIN inventory_items i ON d.item_id=i.id WHERE d.month=? GROUP BY i.category ORDER BY total DESC",
      [MONTH]
    );
    log(
      `  Usage by category     ${usage
        .slice(0, 5)
        .map((row) => `${row.category ?? "∅"}=${row.total}`)
        .join(" ")}`
    );

    const batches = db.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM inventory_batches"
    );
    log(
      `  Expiry Alerts         ${batches.c} batches → ${
        batches.c === 0
          ? "empty until batches are added (expected: the import sets needs_batch=1)"
          : "batches present"
      }`
    );

    const integrity = db.one<{ integrity_check: string }>(
      "PRAGMA integrity_check"
    );
    log(`  integrity_check       ${integrity.integrity_check}`);

    expect(integrity.integrity_check).toBe("ok");
    expect(
      db.one<{ c: number }>("SELECT COUNT(*) AS c FROM inventory_items").c
    ).toBe(result.imported);
  } finally {
    db.close();
  }

  log(`${"=".repeat(72)}\n`);
}, 300_000);
