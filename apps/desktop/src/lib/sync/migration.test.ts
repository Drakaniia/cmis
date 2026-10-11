import { beforeEach, describe, expect, it } from "vitest";

import {
  AFTER_SEEDS,
  flushSeedBacklog,
  openSyncedDatabase,
  stubFetch,
} from "@/test/sync-database";
import {
  advanceCursorsToSent,
  isMigrated,
  iterateInitialPayload,
  migrateToCloud,
  readMigrationMarker,
  resetMigrationMarker,
} from "./migration";
import { readCursors } from "./offline-queue";
import { SCHEMA_VERSION } from "./schema";

type Harness = ReturnType<typeof openSyncedDatabase>;

function insertItem(db: Harness["db"], id: string): void {
  db.prepare(
    `INSERT INTO inventory_items (id, sku, name, stock_on_hand, qty, created_at, updated_at)
     VALUES (?, ?, 'Paracetamol', 10, 10, ?, ?)`
  ).run(id, `SKU-${id}`, AFTER_SEEDS, AFTER_SEEDS);
}

describe("the one-time migration", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = openSyncedDatabase();
    await flushSeedBacklog(harness.sync);
  });

  it("walks every row in batches, table by table", async () => {
    insertItem(harness.db, "item-1");
    insertItem(harness.db, "item-2");
    insertItem(harness.db, "item-3");

    const batches: { rows: number; table: string }[] = [];
    for await (const batch of iterateInitialPayload(harness.sync, 2)) {
      for (const change of batch) {
        batches.push({
          rows: change.rows?.length ?? 0,
          table: change.table,
        });
      }
    }

    const inventory = batches.filter(
      (batch) => batch.table === "inventory_items"
    );
    // Two pages, then the remainder — no row lost to the page boundary even
    // though all three share one timestamp.
    expect(inventory.map((batch) => batch.rows)).toEqual([2, 1]);

    // The migration walks the *whole* table, seeds included: this is the
    // "upload what this device already has" step, and the shipped taxonomy is
    // part of what it has.
    const total = batches.reduce((sum, batch) => sum + batch.rows, 0);
    const inDatabase = harness.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM categories) +
                (SELECT COUNT(*) FROM vocabulary_terms) +
                (SELECT COUNT(*) FROM inventory_items) AS c`
      )
      .get() as { c: number };
    expect(total).toBe(inDatabase.c);
  });

  it("includes the tombstones, so a pre-sync delete is not resurrected", async () => {
    insertItem(harness.db, "item-1");
    await flushSeedBacklog(harness.sync);
    harness.db.prepare("DELETE FROM inventory_items WHERE id = 'item-1'").run();

    let deletes = 0;
    for await (const batch of iterateInitialPayload(harness.sync, 50)) {
      for (const change of batch) {
        deletes += change.deletes?.length ?? 0;
      }
    }
    expect(deletes).toBe(1);
  });

  it("posts the whole dataset to /migrate/initial and marks the device", async () => {
    insertItem(harness.db, "item-1");
    const { calls, fetchImpl } = stubFetch(() => ({
      body: {
        applied: {},
        conflicts: [],
        ok: true,
        serverTime: AFTER_SEEDS,
        skipped: {},
      },
    }));

    const result = await migrateToCloud({
      batchSize: 2,
      db: harness.sync,
      deviceId: "dev-1",
      endpoint: "https://cmis-sync.test",
      fetchImpl,
    });

    expect(calls.every((call) => call.url.endsWith("/migrate/initial"))).toBe(
      true
    );
    expect(calls[0].body).toMatchObject({
      deviceId: "dev-1",
      schemaVersion: SCHEMA_VERSION,
    });
    expect(result.tables.inventory_items).toBe(1);
    // Everything in the database, not just the row this test added.
    const expected = harness.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM categories) +
                (SELECT COUNT(*) FROM vocabulary_terms) +
                (SELECT COUNT(*) FROM inventory_items) AS c`
      )
      .get() as { c: number };
    expect(result.total).toBe(expected.c);
    await expect(isMigrated(harness.sync)).resolves.toBe(true);
  });

  it("advances the push cursors but leaves the pull cursors alone", async () => {
    insertItem(harness.db, "item-1");
    await advanceCursorsToSent(harness.sync);

    const cursors = await readCursors(harness.sync);
    expect(cursors.push.rows.inventory_items).toBe(AFTER_SEEDS);
    // The cloud may hold records this device has never seen, some of them older
    // than the newest row here; stepping the pull cursor forward would skip them.
    expect(cursors.pull.rows.inventory_items ?? "").toBe("");
  });

  it("still pulls everything after a migration, rather than assuming this device is current", async () => {
    insertItem(harness.db, "item-1");
    const { calls, fetchImpl } = stubFetch((url) =>
      url.endsWith("/migrate/initial")
        ? { body: { conflicts: [], ok: true, serverTime: AFTER_SEEDS } }
        : {
            body: {
              deletedCursor: "",
              hasMore: false,
              ok: true,
              serverTime: AFTER_SEEDS,
              tables: [],
            },
          }
    );
    await migrateToCloud({
      batchSize: 500,
      db: harness.sync,
      deviceId: "dev-1",
      endpoint: "https://cmis-sync.test",
      fetchImpl,
    });

    const cursors = await readCursors(harness.sync);
    expect(cursors.pull.rows.inventory_items ?? "").toBe("");
    expect(calls.every((call) => call.url.endsWith("/migrate/initial"))).toBe(
      true
    );
  });

  it("records when the migration ran, and can be re-run on purpose", async () => {
    const { fetchImpl } = stubFetch(() => ({
      body: { conflicts: [], ok: true, serverTime: AFTER_SEEDS },
    }));
    const first = await migrateToCloud({
      db: harness.sync,
      deviceId: "dev-1",
      endpoint: "https://cmis-sync.test",
      fetchImpl,
    });
    await expect(readMigrationMarker(harness.sync)).resolves.toBe(
      first.migratedAt
    );

    await resetMigrationMarker(harness.sync);
    await expect(isMigrated(harness.sync)).resolves.toBe(false);
  });

  it("reports a failed batch instead of pretending the upload finished", async () => {
    insertItem(harness.db, "item-1");
    const { fetchImpl } = stubFetch(() => ({
      body: { error: "nope", ok: false },
      status: 500,
      statusText: "Internal Server Error",
    }));

    await expect(
      migrateToCloud({
        db: harness.sync,
        deviceId: "dev-1",
        endpoint: "https://cmis-sync.test",
        fetchImpl,
      })
    ).rejects.toThrow(/migrate\/initial failed/);
    await expect(isMigrated(harness.sync)).resolves.toBe(false);
  });
});
