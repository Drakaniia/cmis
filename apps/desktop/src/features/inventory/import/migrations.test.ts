import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, TAURI_LIB_RS } from "@/test/project-paths";

/**
 * A migration only exists once the SQL plugin knows about it.
 *
 * `tauri-plugin-sql` runs migrations that are handed to `add_migrations` at
 * build time — a `.sql` file sitting in `src-tauri/migrations` is inert until
 * `lib.rs` reads it. Shipping the file without the registration is what makes
 * every query fail with `no such table: inventory_items`, so these tests pin
 * both halves: the wiring, and that the SQL itself produces the schema the
 * importer writes into.
 */

const LIB_RS = TAURI_LIB_RS;

const DB_URL = "sqlite:cmis.db";

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describe("database migrations", () => {
  it("has migration files to register", () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it("registers every migration file with the sql plugin in lib.rs", () => {
    const libRs = readFileSync(LIB_RS, "utf8");

    expect(libRs).toContain("add_migrations");
    expect(libRs).toContain(DB_URL);

    for (const file of migrationFiles()) {
      expect(
        libRs.includes(file),
        `migration ${file} is not registered in src-tauri/src/lib.rs — it will never run`
      ).toBe(true);
    }
  });

  it("applies every migration in order and creates the inventory schema", () => {
    const db = new DatabaseSync(":memory:");

    for (const file of migrationFiles()) {
      // `exec` mirrors the plugin: one SQL string per migration, run in order.
      db.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String((row as { name: string }).name));

    expect(tables).toContain("inventory_items");
    expect(tables).toContain("inventory_batches");
    expect(tables).toContain("dispensing_events");
    expect(tables).toContain("requests");

    const columns = db
      .prepare("PRAGMA table_info(inventory_items)")
      .all()
      .map((row) => String((row as { name: string }).name));

    // Columns the import statement writes, so a migration drift fails here.
    for (const column of [
      "id",
      "sku",
      "name",
      "dosage",
      "dosage_missing",
      "stock_on_hand",
      "total_dispensed",
      "stock_remaining",
      "daily_sum",
      "total_mismatch",
      "qty",
      "status",
      "needs_batch",
      "category",
      "supplier",
      "threshold",
      "is_no_stock",
      "created_at",
      "updated_at",
    ]) {
      expect(columns).toContain(column);
    }

    db.close();
  });

  it("re-runs safely: every migration is idempotent", () => {
    const db = new DatabaseSync(":memory:");

    for (const file of migrationFiles()) {
      const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8");
      db.exec(sql);
      db.exec(sql);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String((row as { name: string }).name));

    expect(tables.filter((name) => name === "inventory_items")).toHaveLength(1);

    db.close();
  });
});
