import { describe, expect, it } from "vitest";

import { openSyncedDatabase } from "@/test/sync-database";
import { SYNC_TABLES, syncTableSpec } from "./schema";
import type { SyncRow } from "./types";

/**
 * The registry and migration 0014 describe the same rows twice: the triggers
 * write a tombstone key in SQL, and `schema.ts` computes one in TypeScript. If
 * they disagree, a deleted row is announced under a key nothing matches — a
 * silent no-op in one direction, which is the worst possible failure for a sync.
 *
 * So this test does not compare strings. It deletes rows through real SQL and
 * compares the key the *database* recorded with the key the client computes.
 */

function insertRequest(
  db: ReturnType<typeof openSyncedDatabase>["db"],
  id = "req-1"
): void {
  db.prepare(
    `INSERT INTO requests (id, requestor_name, requestor_id, requestor_email,
                           medicine, category, qty, unit, reason, status, submitted_at)
     VALUES (?, 'Nurse', 'n-1', 'nurse@clinic.test', 'Paracetamol', 'Analgesic',
             2, 'tablet', 'headache', 'pending', '2026-10-01T09:00:00.000Z')`
  ).run(id);
}

function tombstoneRowKey(
  db: ReturnType<typeof openSyncedDatabase>["db"],
  table: string
): string {
  const row = db
    .prepare(
      "SELECT row_key FROM sync_tombstones WHERE table_name = ? ORDER BY deleted_at DESC LIMIT 1"
    )
    .get(table) as { row_key: string } | undefined;
  if (!row) {
    throw new Error(`no tombstone recorded for ${table}`);
  }
  return row.row_key;
}

describe("the sync table registry", () => {
  it("covers the tables the spec puts in scope", () => {
    expect(SYNC_TABLES.map((spec) => spec.name).sort()).toEqual([
      "categories",
      "dispensing_records",
      "inventory_batches",
      "inventory_items",
      "request_history",
      "request_notes",
      "requests",
      "vocabulary_terms",
    ]);
  });

  it("orders parents before their children", () => {
    const order = SYNC_TABLES.map((spec) => spec.name);
    for (const spec of SYNC_TABLES) {
      if (spec.parent) {
        expect(order.indexOf(spec.parent.table)).toBeLessThan(
          order.indexOf(spec.name)
        );
      }
    }
  });

  it("keys a parent by its primary key and a child by its content", () => {
    expect(syncTableSpec("requests")?.keyColumn).toBe("id");
    expect(syncTableSpec("request_notes")?.keyColumn).toBeNull();
    expect(syncTableSpec("request_notes")?.applyExcludeColumns).toEqual(["id"]);
  });
});

describe("row keys agree with migration 0014's triggers", () => {
  it("matches the parent table key", () => {
    const { db } = openSyncedDatabase();
    insertRequest(db);
    const row = db.prepare("SELECT * FROM requests").get() as SyncRow;
    db.prepare("DELETE FROM requests WHERE id = 'req-1'").run();
    expect(tombstoneRowKey(db, "requests")).toBe(
      syncTableSpec("requests")?.rowKey(row)
    );
    db.close();
  });

  it("matches the request-history content key", () => {
    const { db } = openSyncedDatabase();
    insertRequest(db);
    db.prepare(
      `INSERT INTO request_history (request_id, at, actor, from_status, to_status, note)
       VALUES ('req-1', '2026-10-01T10:00:00.000Z', 'Nurse', NULL, 'approved', NULL)`
    ).run();
    const row = db.prepare("SELECT * FROM request_history").get() as SyncRow;
    db.prepare("DELETE FROM request_history WHERE request_id = 'req-1'").run();
    const spec = syncTableSpec("request_history");
    expect(tombstoneRowKey(db, "request_history")).toBe(spec?.rowKey(row));
    db.close();
  });

  it("matches the request-notes content key, empty text and all", () => {
    const { db } = openSyncedDatabase();
    insertRequest(db);
    db.prepare(
      `INSERT INTO request_notes (request_id, at, author, text)
       VALUES ('req-1', '2026-10-01T10:05:00.000Z', 'Pharmacist', '')`
    ).run();
    const row = db.prepare("SELECT * FROM request_notes").get() as SyncRow;
    db.prepare("DELETE FROM request_notes WHERE request_id = 'req-1'").run();
    const spec = syncTableSpec("request_notes");
    expect(tombstoneRowKey(db, "request_notes")).toBe(spec?.rowKey(row));
    db.close();
  });

  it("matches the dispensing-record content key", () => {
    const { db } = openSyncedDatabase();
    insertRequest(db);
    db.prepare(
      `INSERT INTO dispensing_records (request_id, at, batch, expiry, qty, staff)
       VALUES ('req-1', '2026-10-01T10:10:00.000Z', 'B-1', '2027-01-01', 2, 'Nurse')`
    ).run();
    const row = db.prepare("SELECT * FROM dispensing_records").get() as SyncRow;
    db.prepare(
      "DELETE FROM dispensing_records WHERE request_id = 'req-1'"
    ).run();
    const spec = syncTableSpec("dispensing_records");
    expect(tombstoneRowKey(db, "dispensing_records")).toBe(spec?.rowKey(row));
    db.close();
  });

  it("keeps the content keys stable when a request is saved twice", () => {
    // `saveRequest` deletes and rewrites every child row. The ids churn; the
    // content keys do not, which is the whole reason they are the identity.
    const { db } = openSyncedDatabase();
    insertRequest(db);
    const insertNote = () =>
      db
        .prepare(
          `INSERT INTO request_notes (request_id, at, author, text)
           VALUES ('req-1', '2026-10-01T10:05:00.000Z', 'Pharmacist', 'note')`
        )
        .run();
    insertNote();
    const first = db
      .prepare("SELECT * FROM request_notes WHERE request_id = 'req-1'")
      .get() as SyncRow;
    db.prepare("DELETE FROM request_notes WHERE request_id = 'req-1'").run();
    insertNote();
    const second = db
      .prepare("SELECT * FROM request_notes WHERE request_id = 'req-1'")
      .get() as SyncRow;

    const spec = syncTableSpec("request_notes");
    expect(first.id).not.toBe(second.id);
    expect(spec?.rowKey(second)).toBe(spec?.rowKey(first));
    db.close();
  });
});

describe("change capture in migration 0014", () => {
  it("stamps updated_at when the application does not", () => {
    const { db } = openSyncedDatabase();
    insertRequest(db);
    const row = db.prepare("SELECT updated_at FROM requests").get() as {
      updated_at: string | null;
    };
    expect(row.updated_at).not.toBeNull();

    // A status change on the board does not name the column.
    db.prepare(
      "UPDATE requests SET status = 'approved' WHERE id = 'req-1'"
    ).run();
    const after = db.prepare("SELECT updated_at FROM requests").get() as {
      updated_at: string;
    };
    expect(after.updated_at >= (row.updated_at ?? "")).toBe(true);
    db.close();
  });

  it("respects an explicit timestamp, which is what a cloud-applied row carries", () => {
    const { db } = openSyncedDatabase();
    insertRequest(db);
    db.prepare(
      "UPDATE requests SET status = 'ready', updated_at = '2001-01-01T00:00:00.000Z' WHERE id = 'req-1'"
    ).run();
    const row = db.prepare("SELECT updated_at FROM requests").get() as {
      updated_at: string;
    };
    expect(row.updated_at).toBe("2001-01-01T00:00:00.000Z");
    db.close();
  });

  it("records a tombstone for each table it deletes from", () => {
    const { db } = openSyncedDatabase();
    db.prepare(
      `INSERT INTO inventory_items (id, sku, name, created_at, updated_at)
       VALUES ('item-1', 'SKU-1', 'Paracetamol', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`
    ).run();
    db.prepare(
      `INSERT INTO inventory_batches (id, item_id, batch, expiry, qty)
       VALUES ('batch-1', 'item-1', 'B-1', '2027-01-01', 10)`
    ).run();

    db.prepare("DELETE FROM inventory_items WHERE id = 'item-1'").run();

    const tables = db
      .prepare("SELECT table_name FROM sync_tombstones ORDER BY table_name")
      .all()
      .map((row) => (row as { table_name: string }).table_name);
    // The item and the batch its delete cascaded to (SQLite fires the child's
    // delete trigger as part of the foreign-key action).
    expect(tables).toEqual(["inventory_batches", "inventory_items"]);
    db.close();
  });

  it("stamps the tombstone with this device's id", () => {
    const { db } = openSyncedDatabase();
    db.prepare(
      "INSERT INTO sync_state (key, value) VALUES ('device_id', 'dev-under-test')"
    ).run();
    insertRequest(db);
    db.prepare("DELETE FROM requests WHERE id = 'req-1'").run();
    const row = db
      .prepare(
        "SELECT device_id FROM sync_tombstones WHERE table_name = 'requests'"
      )
      .get() as { device_id: string };
    expect(row.device_id).toBe("dev-under-test");
    db.close();
  });

  it("gives every synced table an updated_at a cursor can be built on", () => {
    const { db } = openSyncedDatabase();
    for (const spec of SYNC_TABLES) {
      const columns = db
        .prepare(`PRAGMA table_info(${spec.name})`)
        .all()
        .map((row) => (row as { name: string }).name);
      // Every table either has the column or one of its own event times; the
      // effective-timestamp expression in `schema.ts` is what makes the
      // difference invisible to the engine.
      expect(columns.length).toBeGreaterThan(0);
      expect(
        columns.includes("updated_at") ||
          columns.includes("created_at") ||
          columns.includes("at") ||
          columns.includes("submitted_at")
      ).toBe(true);
      expect(spec.updatedAtSql()).toContain("COALESCE");
    }
    db.close();
  });
});
