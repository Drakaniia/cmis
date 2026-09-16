import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "@/test/project-paths";
import type { DbLike } from "../creation/db-like";
import { BACKFILL_META_KEY, backfillStrengthFields } from "./strength-backfill";

/**
 * The backfill runs against a database built from the **real** migration files —
 * the same SQL the Tauri plugin applies — rather than a hand-written schema. That
 * is deliberate: the failure this guards against is a split that satisfies a mock
 * and then writes a column that does not exist, or misses one that does.
 */

function applyMigrations(raw: DatabaseSync): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
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

interface LegacyRow {
  dosage: string;
  id: string;
  name: string;
}

const LEGACY_ROWS: LegacyRow[] = [
  { dosage: "500mg tabs (100/box)", id: "1", name: "Paracetamol" },
  { dosage: "250mg/5ml syrup 60ml", id: "2", name: "Amoxicillin" },
  { dosage: "200/200/5", id: "3", name: "Co-Amoxiclav" },
  // Uncertain: the unit cannot be placed, so it is reported for review.
  { dosage: "50mg/60", id: "4", name: "Odd Med" },
  // Uncertain: nothing but a pack size.
  { dosage: "(100/box)", id: "5", name: "Bare Pack" },
  // Nothing to split at all.
  { dosage: "", id: "6", name: "Blank Med" },
];

function openWithLegacyRows(): { db: DbLike; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  applyMigrations(raw);
  for (const row of LEGACY_ROWS) {
    // Columns not named here take the migration defaults — which is exactly how
    // an imported row looked before this change (`dosage` filled, four blanks).
    raw
      .prepare(
        `INSERT INTO inventory_items (id, sku, name, dosage, created_at, updated_at)
         VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')`
      )
      .run(row.id, `SKU-${row.id}`, row.name, row.dosage);
  }
  return { db: adapter(raw), raw };
}

interface StrengthRow {
  display_name: string;
  dosage_missing: number;
  form: string;
  id: string;
  pack_size: string;
  strength_unit: string;
  strength_value: string;
}

function strengthRows(raw: DatabaseSync): StrengthRow[] {
  return raw
    .prepare(
      `SELECT id, display_name, strength_value, strength_unit, form, pack_size, dosage_missing
         FROM inventory_items ORDER BY id`
    )
    .all() as unknown as StrengthRow[];
}

describe("backfillStrengthFields", () => {
  it("splits every legacy dosage into the four stored columns", async () => {
    const { db, raw } = openWithLegacyRows();

    const report = await backfillStrengthFields(db, { force: true });

    expect(report.written).toBe(LEGACY_ROWS.length);
    expect(report.blank).toBe(1);
    const byId = new Map(strengthRows(raw).map((row) => [row.id, row]));
    expect(byId.get("1")).toMatchObject({
      display_name: "Paracetamol 500 mg tabs (100/box)",
      form: "tabs",
      pack_size: "(100/box)",
      strength_unit: "mg",
      strength_value: "500",
    });
    expect(byId.get("2")).toMatchObject({
      form: "syrup",
      strength_unit: "mg/5ml",
      strength_value: "250",
    });
    // A compound strength is a legal value and is not flagged (decision 24).
    expect(byId.get("3")).toMatchObject({
      strength_unit: "",
      strength_value: "200/200/5",
    });
    expect(report.uncertain.map((row) => row.id)).not.toContain("3");
    // Only the pack-size-only row stays entirely blank in a legal way.
    expect(byId.get("6")?.strength_value).toBe("");
  });

  it('recomputes dosage_missing as "details incomplete" (decision 23)', async () => {
    const { db, raw } = openWithLegacyRows();

    await backfillStrengthFields(db, { force: true });

    const byId = new Map(strengthRows(raw).map((row) => [row.id, row]));
    // 1 and 2 are complete; 3/5/6 have a blank part; 4 has no unit.
    expect(byId.get("1")?.dosage_missing).toBe(0);
    expect(byId.get("2")?.dosage_missing).toBe(0);
    expect(byId.get("3")?.dosage_missing).toBe(1);
    expect(byId.get("5")?.dosage_missing).toBe(1);
    expect(byId.get("6")?.dosage_missing).toBe(1);
  });

  it("reports the uncertain rows for review (decision 22)", async () => {
    const { db } = openWithLegacyRows();

    const report = await backfillStrengthFields(db, { force: true });

    // 6 has no dosage text at all, which `blank` counts rather than an
    // uncertain split — there is nothing that could have been misplaced.
    const ids = report.uncertain.map((row) => row.id).sort();
    expect(ids).toEqual(["4", "5"]);
    expect(report.uncertain.find((row) => row.id === "4")?.dosage).toBe(
      "50mg/60"
    );
  });

  it("is idempotent: a second run changes nothing and adds no rows", async () => {
    const { db, raw } = openWithLegacyRows();

    await backfillStrengthFields(db, { force: true });
    const first = strengthRows(raw);
    const count = raw
      .prepare("SELECT COUNT(*) AS c FROM inventory_items")
      .get() as { c: number };

    await backfillStrengthFields(db, { force: true });

    expect(strengthRows(raw)).toEqual(first);
    expect(
      (
        raw.prepare("SELECT COUNT(*) AS c FROM inventory_items").get() as {
          c: number;
        }
      ).c
    ).toBe(count.c);
  });

  it("records the run-once flag and skips a later run without it", async () => {
    const { db, raw } = openWithLegacyRows();

    await backfillStrengthFields(db, { force: true });

    const flag = raw
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .get(BACKFILL_META_KEY) as { value: string } | undefined;
    expect(flag?.value).toBeTruthy();

    // A hand edit after the flag is set must survive: the app has already been
    // told the migration ran, so a silent rewrite would undo a correction.
    await db.execute(
      "UPDATE inventory_items SET strength_value = '999' WHERE id = '1'"
    );
    const report = await backfillStrengthFields(db);

    expect(report.written).toBe(0);
    expect(
      (
        raw
          .prepare("SELECT strength_value FROM inventory_items WHERE id = '1'")
          .get() as { strength_value: string }
      ).strength_value
    ).toBe("999");
  });

  it("keeps an already-complete row's stored fields over the split", async () => {
    const { db, raw } = openWithLegacyRows();
    // A product created in the app: accurate columns, and a `dosage` that the
    // vocabulary could not fully describe.
    await db.execute(
      `UPDATE inventory_items
          SET strength_value = '5', strength_unit = 'ml', form = 'bottle', pack_size = ''
        WHERE id = '6'`
    );

    const report = await backfillStrengthFields(db, { force: true });

    expect(strengthRows(raw).find((row) => row.id === "6")).toMatchObject({
      form: "bottle",
      strength_unit: "ml",
      strength_value: "5",
    });
    // Already-complete-where-it-counts is not a guess, so it is not reported.
    expect(report.uncertain.map((row) => row.id)).not.toContain("6");
  });

  it("leaves `dosage` in place (spec §6.2 option B)", async () => {
    const { db, raw } = openWithLegacyRows();

    await backfillStrengthFields(db, { force: true });

    const columns = raw
      .prepare("PRAGMA table_info(inventory_items)")
      .all()
      .map((row) => String((row as { name: string }).name));
    expect(columns).toContain("dosage");
    expect(columns).toContain("display_name");
  });
});
