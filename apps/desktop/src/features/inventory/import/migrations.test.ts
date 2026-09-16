import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORY_NAMES,
  seedCategoryId,
} from "@/features/inventory/domain/categories";
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
    // The run-once strength backfill records itself here (§6.3).
    expect(tables).toContain("app_meta");

    const columns = db
      .prepare("PRAGMA table_info(inventory_items)")
      .all()
      .map((row) => String((row as { name: string }).name));

    // Columns the import statement writes, so a migration drift fails here.
    for (const column of [
      "id",
      "sku",
      "name",
      // `dosage` stays until the deferred drop migration ships (§6.2 option B);
      // the four strength columns and the composed label are what the app reads.
      "dosage",
      "dosage_missing",
      "strength_value",
      "strength_unit",
      "form",
      "pack_size",
      "display_name",
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

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => String((row as { name: string }).name));
    // The index the list's search and ordering lean on (§8.1).
    expect(indexes).toContain("idx_inventory_strength");

    db.close();
  });

  it("seeds the shipped category taxonomy the dropdowns fall back on", () => {
    const db = new DatabaseSync(":memory:");
    for (const file of migrationFiles()) {
      db.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
    }

    const rows = db
      .prepare("SELECT id, name FROM categories ORDER BY name COLLATE NOCASE")
      .all() as { id: string; name: string }[];

    // The SQL seed and `DEFAULT_CATEGORY_NAMES` are two copies of one list; this
    // is what stops them drifting apart silently.
    expect(rows.map((row) => row.name).sort()).toEqual(
      [...DEFAULT_CATEGORY_NAMES].sort()
    );
    expect(rows.map((row) => row.id).sort()).toEqual(
      [...DEFAULT_CATEGORY_NAMES].map(seedCategoryId).sort()
    );

    db.close();
  });

  it("adopts a category the inventory already carries", () => {
    const db = new DatabaseSync(":memory:");
    const files = migrationFiles();
    const categoriesFile = "0006_categories.sql";
    for (const file of files.filter((name) => name < categoriesFile)) {
      db.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
    }

    // An imported row whose grouping predates the category table.
    db.prepare(
      "INSERT INTO inventory_items (id, sku, name, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("item-1", "SKU-OPH-1", "Timolol", "Ophthalmic", "now", "now");

    db.exec(readFileSync(`${MIGRATIONS_DIR}/${categoriesFile}`, "utf8"));

    const names = db
      .prepare("SELECT name FROM categories ORDER BY name COLLATE NOCASE")
      .all()
      .map((row) => String((row as { name: string }).name));

    // Without the adoption statement the item would keep a category no
    // dropdown offers, and the operator would have to retype it to pick it.
    expect(names).toContain("Ophthalmic");

    db.close();
  });

  it("re-runs safely: every migration is idempotent", () => {
    const db = new DatabaseSync(":memory:");
    const files = migrationFiles();

    // Apply everything once, exactly as the plugin does, so the columns the
    // ALTERs add really exist.
    for (const file of files) {
      db.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
    }

    for (const file of files) {
      const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8");
      // SQLite has no `ADD COLUMN IF NOT EXISTS`, so an additive column is
      // single-shot by nature — the plugin runs each version exactly once.
      // Everything else (tables, indexes) must still survive a re-run; an index
      // over an added column only exists as *idempotent SQL* because the column
      // was created by the full pass above.
      const repeatable = sql.replace(/^ALTER TABLE .*;$/gm, "");
      db.exec(repeatable);
      db.exec(repeatable);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String((row as { name: string }).name));

    expect(tables.filter((name) => name === "inventory_items")).toHaveLength(1);

    db.close();
  });
});
