import { beforeEach, describe, expect, it } from "vitest";

import {
  AFTER_SEEDS,
  flushSeedBacklog,
  openSyncedDatabase,
} from "@/test/sync-database";
import {
  backupSyncedTables,
  clearSyncedTables,
  readLatestBackup,
  reconcilePushCursors,
  restoreSyncedTables,
} from "./cloud-takeover";
import { pendingChangeCount, readCursors } from "./offline-queue";
import { countRows, newestPushCursor } from "./scan";

function insertItem(
  db: ReturnType<typeof openSyncedDatabase>["db"],
  id = "item-1"
): void {
  db.prepare(
    `INSERT INTO inventory_items (id, sku, name, stock_on_hand, qty, created_at, updated_at)
     VALUES (?, ?, 'Paracetamol', 10, 10, ?, ?)`
  ).run(id, `SKU-${id}`, AFTER_SEEDS, AFTER_SEEDS);
}

describe("adopting the cloud copy", () => {
  let harness: ReturnType<typeof openSyncedDatabase>;

  beforeEach(async () => {
    harness = openSyncedDatabase();
    await flushSeedBacklog(harness.sync);
  });

  it("backs up every synced table and records when and how big", async () => {
    insertItem(harness.db, "item-1");
    insertItem(harness.db, "item-2");
    const info = await backupSyncedTables(harness.sync, new Date(AFTER_SEEDS));
    expect(info.rows).toBeGreaterThanOrEqual(2);
    expect(info.at).toBe(AFTER_SEEDS);
    expect(info.suffix).not.toBe("");
    await expect(readLatestBackup(harness.sync)).resolves.toEqual(info);
  });

  it("empties the synced tables and the tombstone log", async () => {
    insertItem(harness.db, "item-1");
    await clearSyncedTables(harness.sync);
    await expect(countRows(harness.sync, "inventory_items")).resolves.toBe(0);
    // The delete triggers may have written tombstones; the mirror starts clean.
    const tombstones = await harness.sync.select<{ count: number }[]>(
      "SELECT COUNT(*) AS count FROM sync_tombstones"
    );
    expect(Number(tombstones[0].count)).toBe(0);
  });

  it("restores a backup, bringing back rows the device lost", async () => {
    insertItem(harness.db, "item-1");
    await backupSyncedTables(harness.sync, new Date(AFTER_SEEDS));

    // Simulate the mistake: this device adopted the cloud and lost its row.
    await clearSyncedTables(harness.sync);
    await expect(countRows(harness.sync, "inventory_items")).resolves.toBe(0);

    const restored = await restoreSyncedTables(harness.sync);
    expect(restored).toBe(true);
    const rows = harness.db
      .prepare("SELECT id FROM inventory_items WHERE id = 'item-1'")
      .all();
    expect(rows).toHaveLength(1);
  });

  it("returns false when there is no backup to restore", async () => {
    await expect(restoreSyncedTables(harness.sync)).resolves.toBe(false);
  });

  it("moves the push cursors past the rows just downloaded", async () => {
    insertItem(harness.db, "item-1");
    const before = await readCursors(harness.sync);
    expect(before.push.rows.inventory_items ?? "").not.toContain(AFTER_SEEDS);
    await reconcilePushCursors(harness.sync);
    const after = await readCursors(harness.sync);
    expect(after.push.rows.inventory_items).toContain(AFTER_SEEDS);
    // Nothing local is treated as unsent after the reconcile.
    const pending = await pendingChangeCount(harness.sync, after.push);
    expect(pending.rows + pending.deletes).toBe(0);
  });

  it("finds the newest row's push cursor", async () => {
    insertItem(harness.db, "item-1");
    const cursor = await newestPushCursor(harness.sync, "inventory_items");
    expect(cursor.stamp).toBe(AFTER_SEEDS);
    expect(cursor.rowId).toBeGreaterThan(0);
  });
});
