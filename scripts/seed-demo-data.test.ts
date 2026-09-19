/**
 * Seeds the **real desktop database** with demo data for every page, so the app
 * can be screen-recorded with populated screens instead of empty states.
 *
 * One-shot maintenance runner — **not** part of `pnpm test`.
 *
 * The dataset lives in `scripts/seed-demo-data.json` (data, not code) and every
 * value in it is written straight into SQLite. Nothing in the app renders it
 * from a `.ts` file: the pages read the same tables they read in production, so
 * what is recorded is the real data layer, not a fixture.
 *
 * Run from `apps/desktop` (so `@/test/project-paths` can find `src-tauri`):
 *
 *     npx vitest run --config ../../scripts/vitest.seed.config.ts
 *
 * Or from the repository root:
 *
 *     pnpm seed:demo
 *
 * Environment:
 *   CMIS_DB   target sqlite file  (default: the app's config-dir DB)
 *
 * The run is destructive by design: it clears the operational tables, Trash and
 * the audit log before repopulating them, so every recording starts from the
 * same, known state. A timestamped copy of the database file is taken first.
 */

import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it } from "vitest";

import { seedCategoryId } from "@/features/inventory/domain/categories";
import {
  composeDisplayName,
  isDetailsIncomplete,
} from "@/features/inventory/domain/strength";
import { deriveStatus } from "@/features/inventory/import/inventory-status";
import { daysElapsed, monthRange } from "@/lib/month";
import { REPO_ROOT } from "@/test/project-paths";

// ─── Database location ──────────────────────────────────────────────────────

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
const DATASET_PATH = join(REPO_ROOT, "scripts", "seed-demo-data.json");

// ─── Dataset shape ──────────────────────────────────────────────────────────

interface SeedBatch {
  batch: string;
  expiry: string;
  qty: number;
  supplier?: string | null;
}

interface SeedItem {
  batches?: SeedBatch[];
  category: string;
  dispensingPattern?: number[];
  /** Signed difference between the recorded total and the daily grid. */
  dispensingVariance?: number;
  form?: string;
  name: string;
  notes?: string | null;
  packSize?: string;
  sku: string;
  stockOnHand?: number;
  stockRemaining?: number;
  strengthUnit?: string;
  strengthValue?: string;
  supplier?: string | null;
  threshold?: number;
}

interface SeedHistory {
  at: string;
  by: string;
  from: string | null;
  note?: string | null;
  to: string;
}

interface SeedNote {
  at: string;
  author: string;
  text: string;
}

interface SeedDispensing {
  at: string;
  batch: string;
  qty: number;
  staff: string;
}

interface SeedRequest {
  deniedNote?: string | null;
  deniedReason?: string | null;
  dispensing?: SeedDispensing[];
  history?: SeedHistory[];
  id: string;
  itemSku: string;
  notes?: SeedNote[];
  qty: number;
  reason: string;
  requestor: { email?: string; id?: string; name?: string };
  source?: string;
  status: string;
  submittedAt: string;
  unit: string;
}

interface SeedAudit {
  action: string;
  actor: string;
  after?: Record<string, unknown> | null;
  at: string;
  before?: Record<string, unknown> | null;
  branch?: string;
  correctionOf?: string | null;
  detail: string;
  reason?: string | null;
  requestRef?: string | null;
  targetKind?: string | null;
  targetRequest?: string | null;
  targetSku?: string | null;
}

interface SeedTrash {
  batch: string;
  deletedAt: string;
  deletedBy: string;
  expiry: string;
  itemSku: string;
  kind: string;
  qty: number;
  reason?: string | null;
  supplier?: string | null;
}

interface SeedDataset {
  asOf?: string | null;
  audit?: SeedAudit[];
  categories: string[];
  description?: string;
  dispensingMonths?: string[];
  items: SeedItem[];
  requests?: SeedRequest[];
  trash?: SeedTrash[];
}

// ─── Time resolution ────────────────────────────────────────────────────────

const RELATIVE = /^([+-])(\d+)([mhdw])$/;

const UNIT_MS: Record<string, number> = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  w: 604_800_000,
};

/**
 * `"-3h"` / `"+21d"` / `"now"` are offsets from the anchor so a re-seed always
 * looks freshly populated; anything else is taken as an absolute timestamp.
 */
function resolveStamp(
  value: string | null | undefined,
  anchor: number
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const text = value.trim();
  if (text === "now") {
    return new Date(anchor).toISOString();
  }
  const match = RELATIVE.exec(text);
  if (!match) {
    return text;
  }
  const sign = match[1] === "-" ? -1 : 1;
  const amount = Number(match[2]) * (UNIT_MS[match[3] as string] ?? 0);
  return new Date(anchor + sign * amount).toISOString();
}

/** A `YYYY-MM-DD` date, for columns the app parses with `new Date(...)`. */
function resolveDate(value: string, anchor: number): string {
  const iso = resolveStamp(value, anchor) ?? new Date(anchor).toISOString();
  return iso.slice(0, 10);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function monthOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function weekdayOf(month: string, day: number): number {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex - 1, day).getDay();
}

/** `"current"` resolves to the month the seed is run in. */
function resolveMonths(spec: string[] | undefined, now: Date): string[] {
  const list = spec && spec.length > 0 ? spec : ["current"];
  const resolved = list.map((month) =>
    month === "current" ? monthOf(now) : month
  );
  return [...new Set(resolved)];
}

// ─── Database access ────────────────────────────────────────────────────────

interface SeedDb {
  all: <T>(sql: string, params?: unknown[]) => T[];
  close: () => void;
  exec: (sql: string) => void;
  insert: (sql: string, params?: unknown[]) => void;
}

function openDb(path: string): SeedDb {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");

  const bind = (params: unknown[] = []) => params as SQLInputValue[];
  return {
    all: <T>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...bind(params)) as T[],
    close: () => db.close(),
    exec: (sql: string) => db.exec(sql),
    insert: (sql: string, params: unknown[] = []) => {
      if (params.length === 0) {
        db.exec(sql);
        return;
      }
      db.prepare(sql).run(...bind(params));
    },
  };
}

/**
 * Children first, parents last. `trash_records` and `audit_log` are cleared too:
 * this is a clean slate, and a leftover log would describe rows that no longer
 * exist. `app_meta` is left alone so the run-once strength backfill does not try
 * to re-split rows this seed already wrote complete.
 */
const WIPE_STATEMENTS = [
  "DELETE FROM dispensing_records",
  "DELETE FROM request_notes",
  "DELETE FROM request_history",
  "DELETE FROM requests",
  "DELETE FROM dispensing_events",
  "DELETE FROM inventory_batches",
  "DELETE FROM inventory_items",
  "DELETE FROM trash_records",
  "DELETE FROM audit_log",
  "DELETE FROM categories",
];

const REQUIRED_TABLES = [
  "audit_log",
  "categories",
  "dispensing_events",
  "dispensing_records",
  "inventory_batches",
  "inventory_items",
  "request_history",
  "request_notes",
  "requests",
  "trash_records",
];

// ─── Seeding ────────────────────────────────────────────────────────────────

interface SeedCounts {
  audit: number;
  batches: number;
  categories: number;
  dispensingEvents: number;
  inventory: number;
  requests: number;
  trash: number;
}

function seedCategories(db: SeedDb, names: string[], nowIso: string): number {
  for (const name of names) {
    db.insert(
      "INSERT OR IGNORE INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [seedCategoryId(name), name, nowIso, nowIso]
    );
  }
  return names.length;
}

interface SeededItem {
  category: string;
  displayName: string;
  id: string;
  name: string;
  sku: string;
}

function seedItems(
  db: SeedDb,
  dataset: SeedDataset,
  months: string[],
  now: Date,
  anchor: number,
  counts: SeedCounts
): SeededItem[] {
  const nowIso = now.toISOString();
  const seeded: SeededItem[] = [];

  dataset.items.forEach((item, itemIndex) => {
    const id = `item-${item.sku}`;
    const parts = {
      form: item.form ?? "",
      name: item.name,
      packSize: item.packSize ?? "",
      strengthUnit: item.strengthUnit ?? "",
      strengthValue: item.strengthValue ?? "",
    };
    const displayName = composeDisplayName(parts);
    const batches = item.batches ?? [];

    // Quantity is the batches where there are any, and the recorded stock-in
    // value otherwise — exactly the distinction the importer draws, so a
    // no-batch item keeps its qty and still reports `needs_batch`.
    const batchQty = batches.reduce((sum, batch) => sum + batch.qty, 0);
    const qty = batches.length > 0 ? batchQty : (item.stockOnHand ?? 0);
    const threshold = item.threshold ?? 20;
    const pattern = item.dispensingPattern ?? [];

    // Dispensing grid: the pattern gives a Sun–Sat daily rate, applied across
    // every seeded month so the trend charts and the sparkline have movement.
    // Built here rather than written here — `dispensing_events.item_id` is a
    // foreign key, so the item row has to land first.
    const grid: { date: string; day: number; month: string; qty: number }[] =
      [];
    let dispensedTotal = 0;
    for (const month of months) {
      const days = daysElapsed(month, now);
      for (let day = 1; day <= days; day += 1) {
        const rate = pattern[weekdayOf(month, day)] ?? 0;
        if (rate <= 0) {
          continue;
        }
        grid.push({ date: `${month}-${pad2(day)}`, day, month, qty: rate });
        dispensedTotal += rate;
      }
    }

    // A non-zero variance records the "counted vs system" disagreement the
    // Stock Adjustments card surfaces (`total_mismatch`, migration 0002).
    const variance = item.dispensingVariance ?? 0;
    const totalDispensed = dispensedTotal + variance;
    const status = deriveStatus(qty, threshold);
    db.insert(
      `INSERT INTO inventory_items
         (id, sku, name, dosage, dosage_missing, stock_on_hand, total_dispensed,
          stock_remaining, daily_sum, total_mismatch, qty, status, needs_batch,
          category, supplier, threshold, is_no_stock, created_at, updated_at,
          strength_value, strength_unit, form, pack_size, display_name, notes)
       VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.sku,
        item.name.trim(),
        isDetailsIncomplete(parts) ? 1 : 0,
        qty,
        totalDispensed,
        item.stockRemaining ?? qty,
        dispensedTotal,
        variance === 0 ? 0 : 1,
        qty,
        status,
        batches.length === 0 ? 1 : 0,
        item.category,
        item.supplier ?? null,
        threshold,
        qty === 0 ? 1 : 0,
        nowIso,
        nowIso,
        parts.strengthValue.trim(),
        parts.strengthUnit.trim(),
        parts.form.trim(),
        parts.packSize.trim(),
        displayName,
        item.notes ?? null,
      ]
    );
    counts.inventory += 1;
    seeded.push({
      category: item.category,
      displayName,
      id,
      name: item.name,
      sku: item.sku,
    });

    batches.forEach((batch, batchIndex) => {
      db.insert(
        `INSERT INTO inventory_batches (id, item_id, batch, expiry, qty, supplier, notes)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [
          `batch-${itemIndex}-${batchIndex}`,
          id,
          batch.batch,
          resolveDate(batch.expiry, anchor),
          batch.qty,
          batch.supplier ?? item.supplier ?? null,
        ]
      );
      counts.batches += 1;
    });

    for (const entry of grid) {
      db.insert(
        "INSERT INTO dispensing_events (item_id, date, day, month, qty) VALUES (?, ?, ?, ?, ?)",
        [id, entry.date, entry.day, entry.month, entry.qty]
      );
      counts.dispensingEvents += 1;
    }
  });

  return seeded;
}

function seedRequests(
  db: SeedDb,
  dataset: SeedDataset,
  itemsBySku: Map<string, SeededItem>,
  anchor: number,
  counts: SeedCounts
): void {
  for (const request of dataset.requests ?? []) {
    const item = itemsBySku.get(request.itemSku);
    if (!item) {
      throw new Error(
        `Request ${request.id} references unknown item ${request.itemSku}`
      );
    }

    db.insert(
      `INSERT INTO requests
         (id, requestor_name, requestor_id, requestor_email, medicine, category,
          qty, unit, reason, status, submitted_at, denied_reason, denied_note,
          source, item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.requestor.name ?? "",
        request.requestor.id ?? "",
        request.requestor.email ?? "",
        item.displayName,
        item.category,
        request.qty,
        request.unit,
        request.reason,
        request.status,
        resolveStamp(request.submittedAt, anchor),
        request.deniedReason ?? null,
        request.deniedNote ?? null,
        request.source ?? "queue",
        item.id,
      ]
    );
    counts.requests += 1;

    for (const entry of request.history ?? []) {
      db.insert(
        `INSERT INTO request_history (request_id, at, actor, from_status, to_status, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          request.id,
          resolveStamp(entry.at, anchor),
          entry.by,
          entry.from,
          entry.to,
          entry.note ?? null,
        ]
      );
    }

    for (const note of request.notes ?? []) {
      db.insert(
        "INSERT INTO request_notes (request_id, at, author, text) VALUES (?, ?, ?, ?)",
        [request.id, resolveStamp(note.at, anchor), note.author, note.text]
      );
    }

    for (const record of request.dispensing ?? []) {
      // The record stores the batch expiry as it stood at the hand-over; the
      // seed resolves it from the item's own batch so the log agrees with the
      // Expiry screen rather than inventing a date.
      const source = dataset.items.find(
        (candidate) => candidate.sku === item.sku
      );
      const batch = source?.batches?.find(
        (candidate) => candidate.batch === record.batch
      );
      db.insert(
        `INSERT INTO dispensing_records (request_id, at, batch, expiry, qty, staff)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          request.id,
          resolveStamp(record.at, anchor),
          record.batch,
          batch
            ? resolveDate(batch.expiry, anchor)
            : resolveDate("+180d", anchor),
          record.qty,
          record.staff,
        ]
      );
    }
  }
}

function seedAudit(
  db: SeedDb,
  dataset: SeedDataset,
  itemsBySku: Map<string, SeededItem>,
  requestIds: Set<string>,
  anchor: number,
  counts: SeedCounts
): void {
  (dataset.audit ?? []).forEach((entry, index) => {
    const targetId = entry.targetSku
      ? (itemsBySku.get(entry.targetSku)?.id ?? null)
      : (entry.targetRequest ?? null);
    const known = entry.targetRequest
      ? requestIds.has(entry.targetRequest)
      : true;
    db.insert(
      `INSERT INTO audit_log
         (id, at, action, actor, branch, detail, target_kind, target_id,
          before_json, after_json, reason, request_ref, correction_of)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aud-${String(index + 1).padStart(3, "0")}`,
        resolveStamp(entry.at, anchor),
        entry.action,
        entry.actor,
        entry.branch ?? "local",
        entry.detail,
        entry.targetKind ?? null,
        targetId,
        entry.before ? JSON.stringify(entry.before) : null,
        entry.after ? JSON.stringify(entry.after) : null,
        entry.reason ?? null,
        entry.requestRef ?? entry.targetRequest ?? null,
        entry.correctionOf ?? null,
      ]
    );
    counts.audit += 1;
    // A dangling request reference is a typo in the dataset, not a data shape
    // worth tolerating silently.
    expect(known, `audit row ${index + 1} references unknown request`).toBe(
      true
    );
  });
}

/**
 * Trash holds an extracted snapshot rather than a live row, so an entry can be
 * seeded without removing anything from inventory. The batch row is built from
 * the spec, and the parent item is the live one — the same snapshot shape
 * `softDeleteBatch` writes, so Restore and Purge both work on it.
 */
function seedTrash(
  db: SeedDb,
  dataset: SeedDataset,
  itemsBySku: Map<string, SeededItem>,
  anchor: number,
  counts: SeedCounts
): void {
  (dataset.trash ?? []).forEach((entry, index) => {
    const item = itemsBySku.get(entry.itemSku);
    if (!item) {
      throw new Error(`Trash entry references unknown item ${entry.itemSku}`);
    }
    const [itemRow] = db.all<Record<string, unknown>>(
      "SELECT * FROM inventory_items WHERE id = ? LIMIT 1",
      [item.id]
    );
    const batchRow = {
      batch: entry.batch,
      expiry: resolveDate(entry.expiry, anchor),
      id: randomUUID(),
      item_id: item.id,
      notes: null,
      qty: entry.qty,
      supplier: entry.supplier ?? null,
    };
    db.insert(
      `INSERT INTO trash_records
         (id, kind, entity_id, item_id, label, snapshot, deleted_at, deleted_by, reason, restore_hint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `trash-${String(index + 1).padStart(3, "0")}`,
        "batch",
        batchRow.id,
        item.id,
        `${entry.batch} · ${entry.qty} units`,
        JSON.stringify({ batch: batchRow, item: itemRow, kind: "batch" }),
        resolveStamp(entry.deletedAt, anchor),
        entry.deletedBy,
        entry.reason ?? null,
        `Batch of ${item.displayName}`,
      ]
    );
    counts.trash += 1;
  });
}

function runSeed(db: SeedDb, dataset: SeedDataset): SeedCounts {
  const now = new Date();
  const anchor = dataset.asOf
    ? new Date(dataset.asOf).getTime()
    : now.getTime();
  const months = resolveMonths(dataset.dispensingMonths, now);
  const nowIso = now.toISOString();
  const counts: SeedCounts = {
    audit: 0,
    batches: 0,
    categories: 0,
    dispensingEvents: 0,
    inventory: 0,
    requests: 0,
    trash: 0,
  };

  db.exec("BEGIN");
  try {
    for (const statement of WIPE_STATEMENTS) {
      db.exec(statement);
    }
    counts.categories = seedCategories(db, dataset.categories, nowIso);
    const items = seedItems(db, dataset, months, now, anchor, counts);
    const itemsBySku = new Map(items.map((item) => [item.sku, item]));
    seedRequests(db, dataset, itemsBySku, anchor, counts);
    const requestIds = new Set((dataset.requests ?? []).map((r) => r.id));
    seedAudit(db, dataset, itemsBySku, requestIds, anchor, counts);
    seedTrash(db, dataset, itemsBySku, anchor, counts);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // nothing useful to add — the original failure is reported below
    }
    throw error;
  }

  return counts;
}

function log(...parts: unknown[]): void {
  // The runner reports to a human at a terminal, so console output is the point.
  console.log(...parts);
}

it("seeds the desktop database with demo data for every page", () => {
  log(`\n${"=".repeat(72)}`);
  log(`dataset  : ${DATASET_PATH}`);
  log(`database : ${DB_PATH}`);

  expect(existsSync(DATASET_PATH), `missing dataset ${DATASET_PATH}`).toBe(
    true
  );
  expect(
    existsSync(DB_PATH),
    `missing database ${DB_PATH} — launch the desktop app once so the SQL plugin creates and migrates it, or set CMIS_DB`
  ).toBe(true);

  const before = statSync(DB_PATH);
  log(`size     : ${before.size} bytes (before wipe)`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileBackup = `${DB_PATH}.seed-backup-${stamp}`;
  copyFileSync(DB_PATH, fileBackup);
  log(`backup   : ${fileBackup}`);

  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as SeedDataset;

  const db = openDb(DB_PATH);

  try {
    const tables = db
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .map((row) => row.name);
    const missing = REQUIRED_TABLES.filter((name) => !tables.includes(name));
    expect(
      missing,
      `database is not migrated (missing ${missing.join(", ")}) — open the app once so sqlx applies the migrations`
    ).toEqual([]);

    const counts = runSeed(db, dataset);
    log("\nSEEDED");
    for (const [key, value] of Object.entries(counts)) {
      log(`  ${key.padEnd(17)} ${value}`);
    }

    // Every query below is the one its page issues. Asserting on them is what
    // keeps "it looks populated" honest: a broken JOIN shows up here rather than
    // as an empty card during the recording.
    log("\nPAGE QUERIES");

    const inventory = db.all<{ display_name: string; status: string }>(
      "SELECT * FROM inventory_items ORDER BY name COLLATE NOCASE, strength_value COLLATE NOCASE, form COLLATE NOCASE"
    );
    log(`  Stock Management      ${inventory.length} rows`);
    expect(inventory.length).toBeGreaterThan(0);

    const buckets = db.all<{ c: number; label: string }>(
      `SELECT COUNT(*) AS c,
              CASE WHEN julianday(expiry) - julianday('now') <= 30 THEN 'due'
                   WHEN julianday(expiry) - julianday('now') <= 90 THEN 'soon'
                   ELSE 'safe' END AS label
         FROM inventory_batches WHERE expiry IS NOT NULL AND expiry != ''
        GROUP BY label`
    );
    log(
      `  Expiry Alerts         ${buckets.map((row) => `${row.label}=${row.c}`).join(" ")}`
    );
    expect(
      db.all<{ c: number }>("SELECT COUNT(*) AS c FROM inventory_batches")[0]?.c
    ).toBeGreaterThan(0);

    const dashboard = db.all<{
      c: number;
      k: string;
    }>(
      `SELECT 'items' AS k, COUNT(*) AS c FROM inventory_items
        UNION ALL SELECT 'low', COUNT(*) FROM inventory_items WHERE status='low'
        UNION ALL SELECT 'pending', COUNT(*) FROM requests WHERE status='pending'
        UNION ALL SELECT 'expiring30d', COUNT(*) FROM inventory_batches WHERE julianday(expiry) - julianday('now') <= 30
        UNION ALL SELECT 'needsBatch', COUNT(*) FROM inventory_items WHERE needs_batch=1`
    );
    log(
      `  Home dashboard        ${dashboard.map((r) => `${r.k}=${r.c}`).join(" ")}`
    );

    const board = db.all<{ status: string; c: number }>(
      "SELECT status, COUNT(*) AS c FROM requests GROUP BY status ORDER BY status"
    );
    log(
      `  Request board         ${board.map((r) => `${r.status}=${r.c}`).join(" ")}`
    );
    expect(board.length).toBeGreaterThan(1);

    const logRows = db.all<{ at: string; batch: string; qty: number }>(
      `SELECT d.at, d.batch, d.qty
         FROM dispensing_records d
         JOIN requests r ON r.id = d.request_id
        ORDER BY d.at DESC`
    );
    log(`  Dispensing Log        ${logRows.length} records`);
    expect(logRows.length).toBeGreaterThan(0);

    // The app charts the month it is running in, so that is the month verified.
    const currentMonth = monthOf(new Date());
    const movement = db.all<{ date: string; total: number }>(
      "SELECT date, SUM(qty) AS total FROM dispensing_events WHERE month = ? GROUP BY date ORDER BY date",
      [currentMonth]
    );
    log(
      `  Reports movement      ${movement.length} days (${currentMonth}), ${movement.reduce((sum, row) => sum + row.total, 0)} units`
    );
    expect(movement.length).toBeGreaterThan(0);

    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const handOvers =
      db.all<{ c: number }>(
        "SELECT COUNT(*) AS c FROM dispensing_records WHERE at >= ?",
        [since24h]
      )[0]?.c ?? 0;
    const submissions =
      db.all<{ c: number }>(
        "SELECT COUNT(*) AS c FROM requests WHERE submitted_at >= ?",
        [since24h]
      )[0]?.c ?? 0;
    log(
      `  Home activity (24h)   ${handOvers} hand-overs + ${submissions} requests`
    );
    expect(handOvers + submissions).toBeGreaterThan(0);

    const [adjustments] = db.all<{
      discrepancies: number;
      flagged: number;
      transfers: number;
    }>(
      `SELECT (SELECT COUNT(*) FROM inventory_items WHERE total_mismatch = 1) AS discrepancies,
              (SELECT COUNT(*) FROM audit_log WHERE detail LIKE '%Transferred%') AS transfers,
              (SELECT COUNT(*) FROM inventory_batches WHERE julianday(expiry) - julianday('now') <= 30) AS flagged`
    );
    log(
      `  Stock adjustments     discrepancies=${adjustments?.discrepancies} transfers=${adjustments?.transfers} flagged=${adjustments?.flagged}`
    );
    expect(
      (adjustments?.discrepancies ?? 0) +
        (adjustments?.transfers ?? 0) +
        (adjustments?.flagged ?? 0)
    ).toBeGreaterThan(0);

    const trendDays = db.all<{ date: string }>(
      "SELECT DISTINCT date FROM dispensing_events WHERE month = ? ORDER BY date",
      [currentMonth]
    ).length;
    log(`  Low-stock trend       ${trendDays} days reconstructed`);
    expect(trendDays).toBeGreaterThan(1);

    const { end, start } = monthRange(currentMonth);
    const fulfillment = db.all<{
      category: string;
      dispensed: number;
      requested: number;
    }>(
      `SELECT i.category AS category, SUM(d.qty) AS dispensed,
              (SELECT COALESCE(SUM(r.qty), 0) FROM requests r
                WHERE r.category = i.category AND r.submitted_at >= ? AND r.submitted_at < ?) AS requested
         FROM dispensing_events d JOIN inventory_items i ON i.id = d.item_id
        WHERE d.month = ? GROUP BY i.category ORDER BY dispensed DESC LIMIT 8`,
      [start, end, currentMonth]
    );
    log(
      `  Dispensed vs requested ${fulfillment.map((row) => `${row.category} ${row.requested}/${row.dispensed}`).join(" · ")}`
    );
    expect(
      fulfillment.some((row) => row.requested > 0 && row.dispensed > 0)
    ).toBe(true);

    // Inbound movement, which the Stock Movement chart's "In" series reads.
    const inbound = db.all<{ date: string; total: number }>(
      `SELECT substr(a.at, 1, 10) AS date,
              SUM(CAST(json_extract(a.after_json, '$.received') AS INTEGER)) AS total
         FROM audit_log a
        WHERE a.action = 'stock-in' AND a.at >= ? AND a.at < ?
        GROUP BY date ORDER BY date`,
      [start, end]
    );
    log(
      `  Stock in (month)      ${inbound.length} days, ${inbound.reduce((sum, row) => sum + row.total, 0)} units received`
    );
    expect(inbound.length).toBeGreaterThan(0);

    const sizeBytes =
      (db.all<{ page_count: number }>("PRAGMA page_count")[0]?.page_count ??
        0) *
      (db.all<{ page_size: number }>("PRAGMA page_size")[0]?.page_size ?? 0);
    const snapshots = db.all<{ name: string }>(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE '%\\_backup\\_%' ESCAPE '\\'`
    ).length;
    log(
      `  System health         ${Math.round(sizeBytes / 1024)} KB database · ${snapshots} snapshots`
    );
    expect(sizeBytes).toBeGreaterThan(0);

    const sparkline = db.all<{ total: number }>(
      "SELECT date, SUM(qty) AS total FROM dispensing_events GROUP BY date ORDER BY date DESC LIMIT 7"
    );
    log(
      `  Dashboard sparkline   ${sparkline
        .map((row) => row.total)
        .reverse()
        .join(",")}`
    );

    const audit = db.all<{ action: string; c: number }>(
      "SELECT action, COUNT(*) AS c FROM audit_log GROUP BY action ORDER BY action"
    );
    log(
      `  Audit Log             ${audit.map((r) => `${r.action}=${r.c}`).join(" ")}`
    );
    expect(audit.length).toBeGreaterThan(1);

    const trash = db.all<{ label: string }>(
      "SELECT label FROM trash_records ORDER BY deleted_at DESC"
    );
    log(`  Trash                 ${trash.map((row) => row.label).join(" | ")}`);

    const categories = db.all<{ c: number; name: string }>(
      `SELECT c.name AS name, COUNT(i.id) AS c
         FROM categories c LEFT JOIN inventory_items i ON i.category = c.name
        GROUP BY c.name ORDER BY c.name COLLATE NOCASE`
    );
    log(
      `  Settings categories   ${categories.map((row) => `${row.name}=${row.c}`).join(" ")}`
    );

    const integrity = db.all<{ integrity_check: string }>(
      "PRAGMA integrity_check"
    );
    log(`  integrity_check       ${integrity[0]?.integrity_check}`);
    expect(integrity[0]?.integrity_check).toBe("ok");
  } finally {
    db.close();
  }

  log(`${"=".repeat(72)}\n`);
}, 120_000);
