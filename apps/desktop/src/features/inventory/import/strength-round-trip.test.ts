import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "@/test/project-paths";
import type { DbLike } from "../creation/db-like";
import { backfillStrengthFields } from "../data/strength-backfill";
import { INVENTORY_TEMPLATE_HEADERS } from "./csv-parser";
import { buildInventoryWorkbook, type InventoryExportRow } from "./export-xlsx";
import { importInventoryCsv } from "./import";
import { parseInventoryXlsx } from "./xlsx-parser";

/**
 * The regression the strength spec singles out (§7.1, §11 items 2 and 4).
 *
 * Changing an item's identity from `name + dosage` to `name + four fields` means
 * a re-import can only update if the **backfill's** split and the **template's**
 * columns agree about every token. If they do not, the importer silently inserts a
 * second copy of the same medicine — the worst failure in this area, because the
 * inventory then shows two rows with the same name and the operator has no way to
 * tell which one is real.
 *
 * So this test runs the whole path on a real migrated database: legacy flat
 * `dosage` → backfill → re-import the template rows → assert zero inserts. Then it
 * exports and re-reads, asserting the four columns come back byte-identical.
 */

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
      Promise.resolve(
        raw.prepare(sql).all(...(params as SQLInputValue[])) as T
      ),
  };
}

/** A device that imported an old flat sheet: `dosage` filled, four blanks. */
const LEGACY: { dosage: string; id: string; name: string }[] = [
  { dosage: "500 mg tabs (100/box)", id: "1", name: "Paracetamol" },
  { dosage: "250 mg/5ml syrup 60 ml", id: "2", name: "Amoxicillin" },
  { dosage: "200/200/5", id: "3", name: "Co-Amoxiclav" },
  { dosage: "cream", id: "4", name: "Cream Med" },
];

/** The same medications as the 41-column template expresses them. */
const TEMPLATE_ROWS = [
  ["Paracetamol", "500", "mg", "tabs", "(100/box)"],
  ["Amoxicillin", "250", "mg/5ml", "syrup", "60 ml"],
  ["Co-Amoxiclav", "200/200/5", "", "", ""],
  ["Cream Med", "", "", "cream", ""],
];

function csvFor(rows: string[][]): string {
  const header = [...INVENTORY_TEMPLATE_HEADERS].join(",");
  return [
    header,
    ...rows.map(([name, sv, su, form, pack]) =>
      [
        name,
        sv,
        su,
        form,
        pack,
        "10",
        ...new Array(31).fill(""),
        "0",
        "10",
        "Analgesic",
        "Acme Pharma",
      ].join(",")
    ),
  ].join("\n");
}

function openLegacyDatabase(): { db: DbLike; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  applyMigrations(raw);
  for (const row of LEGACY) {
    raw
      .prepare(
        `INSERT INTO inventory_items (id, sku, name, dosage, created_at, updated_at)
         VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')`
      )
      .run(row.id, `SKU-${row.id}`, row.name, row.dosage);
  }
  return { db: adapter(raw), raw };
}

describe("strength round trip", () => {
  it("re-imports the template rows as updates, never as duplicates", async () => {
    const { db, raw } = openLegacyDatabase();

    await backfillStrengthFields(db, { force: true });
    const result = await importInventoryCsv(csvFor(TEMPLATE_ROWS), db, {
      month: MONTH,
    });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(LEGACY.length);
    expect(
      (
        raw.prepare("SELECT COUNT(*) AS c FROM inventory_items").get() as {
          c: number;
        }
      ).c
    ).toBe(LEGACY.length);
  });

  it("leaves the template's four columns unchanged by the round trip", async () => {
    const { db, raw } = openLegacyDatabase();

    await backfillStrengthFields(db, { force: true });
    await importInventoryCsv(csvFor(TEMPLATE_ROWS), db, { month: MONTH });

    const stored = raw
      .prepare(
        `SELECT name, strength_value, strength_unit, form, pack_size
           FROM inventory_items ORDER BY name`
      )
      .all() as unknown as Record<string, string>[];

    const byName = new Map(stored.map((row) => [row.name, row]));
    for (const [name, sv, su, form, pack] of TEMPLATE_ROWS) {
      expect(byName.get(name), name).toMatchObject({
        form,
        pack_size: pack,
        strength_unit: su,
        strength_value: sv,
      });
    }
  });

  it("exports the stored columns verbatim and reads them back identically", async () => {
    const { db, raw } = openLegacyDatabase();
    await backfillStrengthFields(db, { force: true });

    const rows = raw
      .prepare(
        `SELECT name, strength_value, strength_unit, form, pack_size
           FROM inventory_items ORDER BY name`
      )
      .all() as unknown as Record<string, string>[];
    const exportRows: InventoryExportRow[] = rows.map((row) => ({
      category: "Analgesic",
      daily: new Array(31).fill(0),
      form: row.form,
      name: row.name,
      packSize: row.pack_size,
      stockOnHand: 10,
      stockRemaining: 10,
      strengthUnit: row.strength_unit,
      strengthValue: row.strength_value,
      supplier: "Acme Pharma",
      totalDispensed: 0,
    }));

    const { write } = await import("xlsx");
    const bytes = write(buildInventoryWorkbook(exportRows), {
      bookType: "xlsx",
      type: "array",
    }) as Uint8Array;
    const parsed = parseInventoryXlsx(bytes);

    expect(parsed.rows).toHaveLength(rows.length);
    for (const row of rows) {
      const roundTripped = parsed.rows.find((entry) => entry.name === row.name);
      expect(roundTripped, row.name).toMatchObject({
        form: row.form,
        packSize: row.pack_size,
        strengthUnit: row.strength_unit,
        strengthValue: row.strength_value,
      });
    }
  });

  it("composes a full display_name for every imported row", async () => {
    const { db } = openLegacyDatabase();
    await backfillStrengthFields(db, { force: true });
    await importInventoryCsv(csvFor(TEMPLATE_ROWS), db, { month: MONTH });

    const result = await importInventoryCsv(csvFor(TEMPLATE_ROWS), db, {
      month: MONTH,
    });

    expect(result.detailsIncompleteCount).toBeLessThan(LEGACY.length);
  });
});
