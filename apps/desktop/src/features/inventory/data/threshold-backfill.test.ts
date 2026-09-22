import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "@/test/project-paths";
import type { DbLike } from "../creation/db-like";
import {
  backfillThresholds,
  THRESHOLD_BACKFILL_META_KEY,
} from "./threshold-backfill";

/**
 * The threshold backfill runs against a database built from the **real** migration
 * files, because the thing worth guarding is the interaction between the column
 * defaults (`threshold INTEGER NOT NULL DEFAULT 20`) and the union of the two
 * columns it moves — not a hand-built fixture that already looks the way the test
 * wants.
 */

function applyMigrations(raw: DatabaseSync): void {
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    raw.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
  }
}

function adapter(raw: DatabaseSync): DbLike {
  return {
    execute: (sql, params = []) => {
      raw.prepare(sql).run(...(params as SQLInputValue[]));
      return Promise.resolve(undefined);
    },
    select: <T>(sql: string, params: unknown[] = []) =>
      Promise.resolve(
        raw.prepare(sql).all(...(params as SQLInputValue[])) as T
      ),
  };
}

interface SeedItem {
  id: string;
  name: string;
  qty?: number;
  supplier?: string | null;
  threshold?: number;
}

interface SeedEvent {
  day: number;
  itemId: string;
  month: string;
  qty: number;
}

function openWith(items: SeedItem[], events: SeedEvent[] = []) {
  const raw = new DatabaseSync(":memory:");
  applyMigrations(raw);
  for (const item of items) {
    raw
      .prepare(
        `INSERT INTO inventory_items (id, sku, name, qty, supplier, threshold, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')`
      )
      .run(
        item.id,
        `SKU-${item.id}`,
        item.name,
        item.qty ?? 0,
        item.supplier ?? null,
        item.threshold ?? 20
      );
  }
  for (const event of events) {
    raw
      .prepare(
        `INSERT INTO dispensing_events (item_id, date, day, month, qty)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        event.itemId,
        `${event.month}-${String(event.day).padStart(2, "0")}`,
        event.day,
        event.month,
        event.qty
      );
  }
  return { db: adapter(raw), raw };
}

interface StoredRow {
  id: string;
  status: string;
  threshold: number;
}

function stored(raw: DatabaseSync): StoredRow[] {
  return raw
    .prepare("SELECT id, status, threshold FROM inventory_items ORDER BY id")
    .all() as unknown as StoredRow[];
}

describe("backfillThresholds", () => {
  it("derives from the latest recorded month and leaves a chosen value alone", async () => {
    const { db, raw } = openWith(
      [
        { id: "a", name: "Acetylcysteine", qty: 100, supplier: "HealthPlus" },
        { id: "b", name: "Chosen", qty: 100, threshold: 5 },
      ],
      [
        // An older month with far more usage must not win.
        { day: 1, itemId: "a", month: "2026-07", qty: 999 },
        { day: 1, itemId: "a", month: "2026-08", qty: 31 },
        { day: 2, itemId: "a", month: "2026-08", qty: 31 },
      ]
    );

    const report = await backfillThresholds(db, { force: true });

    // 62 over 31 days = 2/day; HealthPlus leads in 2 days + 3 safety = 5 days.
    const byId = new Map(stored(raw).map((row) => [row.id, row]));
    expect(byId.get("a")?.threshold).toBe(10);
    // A threshold that is not the default was set deliberately.
    expect(byId.get("b")?.threshold).toBe(5);
    expect(report.updated).toBe(1);
    expect(report.kept).toBe(1);
  });

  it("moves status with the threshold so a row is not stranded as in stock", async () => {
    const { db, raw } = openWith(
      [{ id: "a", name: "Busy", qty: 25 }],
      [
        { day: 1, itemId: "a", month: "2026-08", qty: 31 },
        { day: 2, itemId: "a", month: "2026-08", qty: 31 },
        { day: 3, itemId: "a", month: "2026-08", qty: 31 },
      ]
    );

    // 93/day-by-month ≈ 3/day × 10 days of cover = 30, so 25 on hand is now low.
    await backfillThresholds(db, { force: true });

    expect(stored(raw)[0]).toMatchObject({ status: "low", threshold: 30 });
  });

  it("counts items the recorded month shows no dispensing for", async () => {
    const { db, raw } = openWith([
      { id: "a", name: "Never dispensed", qty: 12 },
      { id: "b", name: "Empty shelf", qty: 0 },
    ]);

    const report = await backfillThresholds(db, { force: true });

    expect(report.noUsage).toBe(2);
    expect(report.updated).toBe(2);
    const byId = new Map(stored(raw).map((row) => [row.id, row]));
    expect(byId.get("a")).toMatchObject({ status: "in", threshold: 0 });
    expect(byId.get("b")).toMatchObject({ status: "out", threshold: 0 });
  });

  it("records the run-once flag and skips a later run", async () => {
    const { db, raw } = openWith(
      [{ id: "a", name: "Busy", qty: 100 }],
      [{ day: 1, itemId: "a", month: "2026-08", qty: 31 }]
    );

    await backfillThresholds(db, { force: true });

    const flag = raw
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .get(THRESHOLD_BACKFILL_META_KEY) as { value: string } | undefined;
    expect(flag?.value).toBeTruthy();

    // A hand correction after the flag is set must survive.
    await db.execute("UPDATE inventory_items SET threshold = 7 WHERE id = 'a'");
    const report = await backfillThresholds(db);

    expect(report.updated).toBe(0);
    expect(stored(raw)[0].threshold).toBe(7);
  });

  it("is idempotent: a second forced run changes nothing", async () => {
    const { db, raw } = openWith(
      [
        { id: "a", name: "Busy", qty: 100, supplier: "VitaLabs" },
        { id: "b", name: "Quiet", qty: 3 },
      ],
      [{ day: 1, itemId: "a", month: "2026-08", qty: 31 }]
    );

    await backfillThresholds(db, { force: true });
    const first = stored(raw);

    await backfillThresholds(db, { force: true });

    expect(stored(raw)).toEqual(first);
  });
});
