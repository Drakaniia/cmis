import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, REPO_ROOT } from "@/test/project-paths";
import { rejectionFrom } from "@/test/rejection";
import { importInventoryCsv } from "./import";
import { inventoryXlsxToCsv, parseInventoryXlsx } from "./xlsx-parser";

/**
 * End-to-end import of the real August 2026 workbook.
 *
 * This is the test that would have caught the reported failure: the workbook is
 * read through the same parser the app uses, the schema is built from the real
 * `src-tauri/migrations/*.sql` files, and the import runs against a real SQLite
 * engine — so a missing migration surfaces as `no such table: inventory_items`
 * instead of hiding behind a mocked database.
 */

const WORKBOOK = join(
  REPO_ROOT,
  "AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx"
);

const MONTH = "2026-08";

/** The error tauri-plugin-sql surfaces when the schema was never migrated. */
const NO_SUCH_TABLE = /no such table: inventory_items/;

/** The app's `DbLike` shape, backed by a real SQLite engine. */
function createSqliteDb() {
  const db = new DatabaseSync(":memory:");
  const bind = (params: unknown[]) => params as SQLInputValue[];
  const rows = <T>(sql: string, params: unknown[] = []) =>
    db.prepare(sql).all(...bind(params)) as T[];

  return {
    close: () => db.close(),
    execute: (sql: string, params: unknown[] = []) => {
      if (params.length === 0) {
        db.exec(sql);
        return Promise.resolve({});
      }
      return Promise.resolve(db.prepare(sql).run(...bind(params)));
    },
    migrate: () => {
      for (const file of readdirSync(MIGRATIONS_DIR)
        .filter((name) => name.endsWith(".sql"))
        .sort()) {
        db.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
      }
    },
    query: rows,
    select: <T>(sql: string, params: unknown[] = []) =>
      Promise.resolve(rows<T>(sql, params)),
  };
}

function workbookBytes(): Uint8Array {
  return new Uint8Array(readFileSync(WORKBOOK));
}

const INJECTED_FAILURE = "injected write failure";

/**
 * Lets one matching statement fail, the way a locked or full disk would, while
 * every other statement still runs against the real engine — so the rollback is
 * exercised for real rather than against a mock.
 */
function failOn(
  db: ReturnType<typeof createSqliteDb>,
  matches: (sql: string) => boolean
) {
  let fired = false;
  return {
    ...db,
    execute: (sql: string, params: unknown[] = []) => {
      if (!fired && matches(sql)) {
        fired = true;
        return Promise.reject(new Error(INJECTED_FAILURE));
      }
      return db.execute(sql, params);
    },
  };
}

describe("AUGUST 2026 inventory workbook", () => {
  it("has the converted workbook on disk", () => {
    expect(existsSync(WORKBOOK), `missing ${WORKBOOK}`).toBe(true);
  });

  it("fails against an unmigrated database — the reported `no such table`", async () => {
    const db = createSqliteDb();
    const csv = inventoryXlsxToCsv(workbookBytes());

    await expect(
      importInventoryCsv(csv, db as never, { month: MONTH })
    ).rejects.toThrow(NO_SUCH_TABLE);

    db.close();
  });

  it("parses all 85 medications with totals and coercions preserved", () => {
    const parsed = parseInventoryXlsx(workbookBytes(), MONTH);

    // 85 medications; the trailing "total medicine dispensed" footer row is not
    // a medication and must not become one.
    expect(parsed.rows).toHaveLength(85);
    expect(parsed.rows.every((row) => row.name.trim() !== "")).toBe(true);

    // Header must match the template exactly — no warnings from the workbook.
    expect(parsed.warnings.filter((w) => w.column === "header")).toHaveLength(
      0
    );
    expect(
      parsed.warnings.filter((w) => w.reason.includes("unparseable"))
    ).toHaveLength(0);
    expect(
      parsed.warnings.filter((w) => w.reason.includes("duplicate"))
    ).toHaveLength(0);

    const byName = new Map(parsed.rows.map((row) => [row.name, row]));

    // "NO STOCK" became 0 (the template forbids the text); blank stock stays null.
    expect(byName.get("Aluminum Mag Hydroxide")?.stockOnHand).toBe(0);
    expect(byName.get("Acetylcysteine")?.stockOnHand).toBeNull();

    // "440 (April)" → 440, "7" → 7.
    expect(byName.get("Atenolol")?.stockOnHand).toBe(440);
    expect(byName.get("Tobramycin 0.3% eye drops")?.stockOnHand).toBe(7);

    // Daily grid survives position for position: day 3 = 5, day 24 = 37.
    const acetyl = byName.get("Acetylcysteine");
    expect(acetyl?.daily[2]).toBe(5);
    expect(acetyl?.daily[23]).toBe(37);
    expect(acetyl?.dailySum).toBe(143);
    expect(acetyl?.totalDispensed).toBe(143);

    // "14a" was coerced to 14 before it ever reached the workbook, and the
    // sheet's own total (21) is preserved even though the grid sums to 35.
    const cefalexin = byName.get("Cefalexin");
    expect(cefalexin?.daily[19]).toBe(14);
    expect(cefalexin?.dailySum).toBe(35);
    expect(cefalexin?.totalDispensed).toBe(21);

    // The one genuine source mismatch survives the conversion.
    expect(parsed.mismatchCount).toBe(1);
  });

  it("imports into a migrated database: 85 items and 134 dispensing events", async () => {
    const db = createSqliteDb();
    db.migrate();

    const csv = inventoryXlsxToCsv(workbookBytes());
    const result = await importInventoryCsv(csv, db as never, { month: MONTH });

    expect(result.imported).toBe(85);
    expect(result.inserted).toBe(85);
    expect(result.updated).toBe(0);
    expect(result.skippedEmptyRows).toBe(0);
    expect(result.needsBatchCount).toBe(85);
    expect(result.mismatchCount).toBe(1);

    const items = db.query<{ name: string }>(
      "SELECT name FROM inventory_items"
    );
    expect(items).toHaveLength(85);

    const events = db.query<{ c: number }>(
      "SELECT COUNT(*) AS c FROM dispensing_events WHERE month = ?",
      [MONTH]
    );
    expect(events[0]?.c).toBe(134);

    const acetyl = db.query<{
      daily_sum: number;
      qty: number;
      status: string;
      stock_on_hand: number | null;
      stock_remaining: number | null;
      total_dispensed: number;
      total_mismatch: number;
    }>(
      `SELECT daily_sum, qty, status, stock_on_hand, stock_remaining,
              total_dispensed, total_mismatch
         FROM inventory_items WHERE name = ?`,
      ["Acetylcysteine"]
    );

    expect(acetyl[0]).toMatchObject({
      daily_sum: 143,
      qty: 0,
      status: "out",
      stock_on_hand: null,
      stock_remaining: null,
      total_dispensed: 143,
      total_mismatch: 0,
    });

    const atenolol = db.query<{ qty: number; status: string }>(
      "SELECT qty, status FROM inventory_items WHERE name = ?",
      ["Atenolol"]
    );
    expect(atenolol[0]).toMatchObject({ qty: 440, status: "in" });

    const skus = db.query<{ sku: string }>("SELECT sku FROM inventory_items");
    expect(new Set(skus.map((r) => r.sku)).size).toBe(85);

    db.close();
  });
});

/**
 * The importer cannot use a SQL transaction: `tauri-plugin-sql` serves each
 * `execute` from an arbitrary connection in its sqlx pool, so a `BEGIN` never
 * spans the statements that follow and the closing `ROLLBACK` fails with
 * "cannot rollback - no transaction is active" — hiding the real error. These
 * tests pin the replacement: a write that fails restores the snapshot taken at
 * the start of the import, and the caller still sees the real cause.
 */
describe("an import that fails part-way", () => {
  it("leaves a previously empty database empty", async () => {
    const db = createSqliteDb();
    db.migrate();
    const csv = inventoryXlsxToCsv(workbookBytes());
    const failing = failOn(db, (sql) =>
      sql.includes("INSERT INTO dispensing_events")
    );

    const rejection = await rejectionFrom(
      importInventoryCsv(csv, failing as never, { month: MONTH })
    );

    expect(rejection.message).toContain(INJECTED_FAILURE);
    expect(rejection.message).not.toContain("rollback");
    // The first item was already inserted when the write blew up, so the
    // rollback had real work to undo.
    expect(
      db.query<{ c: number }>("SELECT COUNT(*) AS c FROM inventory_items")[0]?.c
    ).toBe(0);
    expect(
      db.query<{ c: number }>("SELECT COUNT(*) AS c FROM dispensing_events")[0]
        ?.c
    ).toBe(0);

    db.close();
  });

  it("restores every row and event of the previous import", async () => {
    const db = createSqliteDb();
    db.migrate();
    const csv = inventoryXlsxToCsv(workbookBytes());
    await importInventoryCsv(csv, db as never, { month: MONTH });

    const itemsBefore = db.query("SELECT * FROM inventory_items ORDER BY sku");
    const eventsBefore = db.query(
      "SELECT item_id, date, day, month, qty FROM dispensing_events ORDER BY date, item_id"
    );

    const failing = failOn(db, (sql) =>
      sql.includes("INSERT INTO dispensing_events")
    );
    const rejection = await rejectionFrom(
      importInventoryCsv(csv, failing as never, { month: MONTH })
    );

    expect(rejection.message).toContain(INJECTED_FAILURE);
    expect(rejection.message).not.toContain("rollback");

    // Row for row, event for event — including updated_at, which the re-import
    // rewrites and the restore has to put back.
    expect(db.query("SELECT * FROM inventory_items ORDER BY sku")).toEqual(
      itemsBefore
    );
    expect(
      db.query(
        "SELECT item_id, date, day, month, qty FROM dispensing_events ORDER BY date, item_id"
      )
    ).toEqual(eventsBefore);

    db.close();
  });
});
