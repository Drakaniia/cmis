import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, REPO_ROOT } from "@/test/project-paths";
import { importInventoryCsv } from "../import/import";
import { inventoryXlsxToCsv } from "../import/xlsx-parser";
import type { DbLike } from "../creation/db-like";
import {
  backfillPackSizeFields,
  PACK_BACKFILL_META_KEY,
} from "./pack-size-backfill";

/**
 * The pack backfill runs against a database built from the **real** migration
 * files, and the pinned-count test feeds it the clinic's own converted workbook
 * (pack-size spec §11). That is deliberate: the failure this guards against is a
 * parser that satisfies a fixture and then rewrites the clinic's `pack_size`
 * text — which would silently fork every identity key (PK13).
 */

const WORKBOOK = join(
  REPO_ROOT,
  "AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx"
);
// Clinic data file — not tracked; pinned-count test runs only when present.
const HAS_WORKBOOK = existsSync(WORKBOOK);
const MONTH = "2026-08";

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
      Promise.resolve(raw.prepare(sql).all(...(params as SQLInputValue[])) as T),
  };
}

interface SeedRow {
  id: string;
  name: string;
  /** The leftover-bucket text as stored, or `""` for a blank cell. */
  packSize: string;
}

function openWith(rows: SeedRow[]): { db: DbLike; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  applyMigrations(raw);
  for (const row of rows) {
    raw
      .prepare(
        `INSERT INTO inventory_items (id, sku, name, pack_size, created_at, updated_at)
         VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')`
      )
      .run(row.id, `SKU-${row.id}`, row.name, row.packSize);
  }
  return { db: adapter(raw), raw };
}

interface PackRow {
  display_name: string;
  id: string;
  pack_qty: number;
  pack_size: string;
  pack_unit: string;
  sku: string;
}

function packRows(raw: DatabaseSync): PackRow[] {
  return raw
    .prepare(
      `SELECT id, sku, display_name, pack_size, pack_qty, pack_unit
         FROM inventory_items ORDER BY id`
    )
    .all() as unknown as PackRow[];
}

describe("backfillPackSizeFields", () => {
  it("pairs a named container wherever the group sits, leaving the text alone", async () => {
    const { db, raw } = openWith([
      { id: "1", name: "Acetylcysteine", packSize: "(10/box)" },
      { id: "2", name: "Flavored Sachet", packSize: "Flavored Sachet (30/box)" },
      // A blank form and text before the group — matched anywhere (D27, E22).
      { id: "3", name: "Tabs", packSize: "mg tab (30/box)" },
      { id: "4", name: "Bare", packSize: "(35/box)" },
      { id: "5", name: "Ampoule", packSize: "(10/vial)" },
    ]);

    const report = await backfillPackSizeFields(db, { force: true });

    expect(report.paired).toBe(5);
    expect(report.numbered).toHaveLength(0);
    expect(report.unreadable).toHaveLength(0);
    const byId = new Map(packRows(raw).map((row) => [row.id, row]));
    expect(byId.get("1")).toMatchObject({ pack_qty: 10, pack_unit: "box" });
    expect(byId.get("2")).toMatchObject({ pack_qty: 30, pack_unit: "box" });
    expect(byId.get("3")).toMatchObject({ pack_qty: 30, pack_unit: "box" });
    expect(byId.get("4")).toMatchObject({ pack_qty: 35, pack_unit: "box" });
    expect(byId.get("5")).toMatchObject({ pack_qty: 10, pack_unit: "vial" });
    // The text is byte-identical: only the pair moved.
    for (const row of packRows(raw)) {
      expect(row.pack_size).toBe(
        { "1": "(10/box)", "2": "Flavored Sachet (30/box)", "3": "mg tab (30/box)", "4": "(35/box)", "5": "(10/vial)" }[
          row.id
        ]
      );
    }
  });

  it("fills only the number for a container that is not stated, and flags it", async () => {
    const { db, raw } = openWith([
      { id: "1", name: "Tabs", packSize: "(100/tab)" },
      { id: "2", name: "Curly", packSize: "100’s" },
      { id: "3", name: "Straight", packSize: "20's" },
      { id: "4", name: "Thirties", packSize: "(30’s)" },
    ]);

    const report = await backfillPackSizeFields(db, { force: true });

    expect(report.numbered.map((row) => row.id).sort()).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(report.numbered[0].reason).toBe("container not stated");
    const byId = new Map(packRows(raw).map((row) => [row.id, row]));
    // Never `box` by inference, and never the base unit (D28).
    expect(byId.get("1")).toMatchObject({ pack_qty: 100, pack_unit: "" });
    expect(byId.get("2")).toMatchObject({ pack_qty: 100, pack_unit: "" });
    expect(byId.get("3")).toMatchObject({ pack_qty: 20, pack_unit: "" });
    expect(byId.get("4")).toMatchObject({ pack_qty: 30, pack_unit: "" });
  });

  it("leaves prose completely alone and flags it (D6)", async () => {
    const { db, raw } = openWith([
      { id: "1", name: "Syrup", packSize: "60ml suspension" },
      { id: "2", name: "Injection", packSize: "for injection" },
      { id: "3", name: "Combo", packSize: "mg/325mg tab" },
      { id: "4", name: "Liquid", packSize: "120 ml" },
    ]);

    const report = await backfillPackSizeFields(db, { force: true });

    expect(report.paired).toBe(0);
    expect(report.numbered).toHaveLength(0);
    expect(report.unreadable.map((row) => row.id).sort()).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(report.unreadable[0].reason).toBe("not a pack size");
    for (const row of packRows(raw)) {
      expect(row).toMatchObject({ pack_qty: 0, pack_unit: "" });
    }
  });

  it("counts a blank cell without flagging it", async () => {
    const { db } = openWith([
      { id: "1", name: "Blank", packSize: "" },
      { id: "2", name: "Also blank", packSize: "" },
    ]);

    const report = await backfillPackSizeFields(db, { force: true });

    expect(report.blank).toBe(2);
    expect(report.paired).toBe(0);
    expect(report.unreadable).toHaveLength(0);
  });

  it("records the run-once flag and skips a later run without it", async () => {
    const { db, raw } = openWith([{ id: "1", name: "Tabs", packSize: "(100/box)" }]);

    await backfillPackSizeFields(db, { force: true });

    const flag = raw
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .get(PACK_BACKFILL_META_KEY) as { value: string } | undefined;
    expect(flag?.value).toBeTruthy();

    // A hand correction after the flag is set must survive.
    await db.execute(
      "UPDATE inventory_items SET pack_qty = 7, pack_unit = 'strip' WHERE id = '1'"
    );
    const report = await backfillPackSizeFields(db);

    expect(report.paired).toBe(0);
    expect(packRows(raw)[0]).toMatchObject({ pack_qty: 7, pack_unit: "strip" });
  });

  it("is idempotent: a second forced run changes nothing", async () => {
    const { db, raw } = openWith([
      { id: "1", name: "Box", packSize: "(10/box)" },
      { id: "2", name: "Idiom", packSize: "100’s" },
      { id: "3", name: "Prose", packSize: "for injection" },
    ]);

    await backfillPackSizeFields(db, { force: true });
    const first = packRows(raw);

    await backfillPackSizeFields(db, { force: true });

    expect(packRows(raw)).toEqual(first);
  });

  it.skipIf(!HAS_WORKBOOK)("pins the reference workbook: 44 paired · 6 numbered · 15 unreadable · 20 blank", async () => {
    const raw = new DatabaseSync(":memory:");
    applyMigrations(raw);
    const db = adapter(raw);
    const csv = inventoryXlsxToCsv(new Uint8Array(readFileSync(WORKBOOK)));
    await importInventoryCsv(csv as never, db as never, { month: MONTH });

    const before = packRows(raw);

    const report = await backfillPackSizeFields(db, { force: true });

    expect(report.paired).toBe(44);
    expect(report.numbered).toHaveLength(6);
    expect(report.unreadable).toHaveLength(15);
    expect(report.blank).toBe(20);

    // Filling the pair changes no stored text, display name, SKU or identity.
    const after = packRows(raw);
    expect(after.map((row) => row.pack_size)).toEqual(
      before.map((row) => row.pack_size)
    );
    expect(after.map((row) => row.display_name)).toEqual(
      before.map((row) => row.display_name)
    );
    expect(after.map((row) => row.sku)).toEqual(before.map((row) => row.sku));
    // Exactly the paired and numbered rows gained a number.
    expect(after.filter((row) => row.pack_qty > 0)).toHaveLength(50);

    raw.close();
  });
});
