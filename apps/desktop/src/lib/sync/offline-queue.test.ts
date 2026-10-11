import { beforeEach, describe, expect, it } from "vitest";

import {
  AFTER_SEEDS,
  flushSeedBacklog,
  openSyncedDatabase,
} from "@/test/sync-database";
import {
  collectLocalChanges,
  ensureDeviceId,
  pendingChangeCount,
  prunePushedTombstones,
  readCursors,
  writePullCursors,
  writePushCursors,
} from "./offline-queue";
import { formatPushCursor } from "./scan";

type Harness = ReturnType<typeof openSyncedDatabase>;

function insertItem(db: Harness["db"], id = "item-1"): void {
  db.prepare(
    `INSERT INTO inventory_items (id, sku, name, stock_on_hand, qty, created_at, updated_at)
     VALUES (?, ?, 'Paracetamol', 10, 10, ?, ?)`
  ).run(id, `SKU-${id}`, AFTER_SEEDS, AFTER_SEEDS);
}

describe("the durable queue", () => {
  let harness: Harness;
  beforeEach(async () => {
    harness = openSyncedDatabase();
    // The shipped taxonomy is legitimately pending on a fresh database; these
    // tests are about the rows they create.
    await flushSeedBacklog(harness.sync);
  });

  it("creates a device id once and keeps it", async () => {
    const first = await ensureDeviceId(harness.sync, () => "dev-1");
    const second = await ensureDeviceId(harness.sync, () => "dev-2");
    expect(first).toBe("dev-1");
    expect(second).toBe("dev-1");
  });

  it("starts with empty cursors in both directions", async () => {
    const fresh = openSyncedDatabase();
    const cursors = await readCursors(fresh.sync);
    expect(cursors.push.deleted).toBe("");
    expect(cursors.push.rows.requests).toBe("");
    expect(cursors.pull.rows.inventory_items).toBe("");
  });

  it("keeps push and pull cursors independent", async () => {
    await writePushCursors(harness.sync, {
      deleted: "2026-10-02T00:00:00.000Z",
      rows: { inventory_items: "2026-10-01T10:00:00.000Z" },
    });
    await writePullCursors(harness.sync, {
      deleted: "",
      rows: { inventory_items: "2026-10-01T08:00:00.000Z" },
    });

    const cursors = await readCursors(harness.sync);
    expect(cursors.push.rows.inventory_items).toBe("2026-10-01T10:00:00.000Z");
    expect(cursors.pull.rows.inventory_items).toBe("2026-10-01T08:00:00.000Z");
  });

  it("collects what the triggers stamped, and a push advances only the push cursor", async () => {
    insertItem(harness.db);

    const collected = await collectLocalChanges(harness.sync, { limit: 500 });
    const items = collected.tables.find(
      (change) => change.table === "inventory_items"
    );
    expect(items?.rows).toHaveLength(1);
    // The returned cursor is where a successful push would move to. Nothing is
    // stored until the server has acknowledged, which is why the assertion
    // follows the write below.
    expect(collected.cursors.rows.inventory_items).toContain(AFTER_SEEDS);
    expect(
      (await readCursors(harness.sync)).push.rows.inventory_items ?? ""
    ).toBe("|0");

    await writePushCursors(harness.sync, collected.cursors);
    expect((await readCursors(harness.sync)).push.rows.inventory_items).toBe(
      collected.cursors.rows.inventory_items
    );
    // Nothing has been *received* yet; a push must not pretend otherwise.
    expect(
      (await readCursors(harness.sync)).pull.rows.inventory_items ?? ""
    ).toBe("");
  });

  it("collects this device's own deletes, which is the point of a push", async () => {
    insertItem(harness.db);
    await writePushCursors(harness.sync, {
      deleted: "",
      rows: { inventory_items: AFTER_SEEDS },
    });
    harness.db.prepare("DELETE FROM inventory_items WHERE id = 'item-1'").run();

    const collected = await collectLocalChanges(harness.sync, { limit: 500 });
    expect(
      collected.tables.find((change) => change.table === "inventory_items")
        ?.deletes
    ).toHaveLength(1);
  });

  it("does not re-collect a row it has already sent", async () => {
    insertItem(harness.db);
    const first = await collectLocalChanges(harness.sync, { limit: 500 });
    await writePushCursors(harness.sync, first.cursors);
    const second = await collectLocalChanges(harness.sync, { limit: 500 });
    expect(second.size).toBe(0);
  });

  it("caps a pass at the queue limit and says there is more", async () => {
    insertItem(harness.db, "item-1");
    insertItem(harness.db, "item-2");
    insertItem(harness.db, "item-3");
    harness.db
      .prepare(
        "UPDATE inventory_items SET updated_at = '2030-01-02T00:00:00.000Z' WHERE id = 'item-1'"
      )
      .run();

    const collected = await collectLocalChanges(harness.sync, { limit: 2 });
    expect(collected.size).toBe(2);
    expect(collected.hasMore).toBe(true);
    // The table's own page stops at the cap, so the next pass resumes from the
    // cursor rather than from the beginning.
    expect(
      collected.tables.find((change) => change.table === "inventory_items")
        ?.rows
    ).toHaveLength(2);
    expect(collected.cursors.rows.inventory_items).toContain(AFTER_SEEDS);
  });

  it("counts what is still waiting", async () => {
    insertItem(harness.db);
    const counts = await pendingChangeCount(
      harness.sync,
      (await readCursors(harness.sync)).push
    );
    expect(counts.rows).toBe(1);
    expect(counts.deletes).toBe(0);

    harness.db.prepare("DELETE FROM inventory_items WHERE id = 'item-1'").run();
    const afterDelete = await pendingChangeCount(
      harness.sync,
      (await readCursors(harness.sync)).push
    );
    expect(afterDelete.deletes).toBe(1);
    expect(afterDelete.rows).toBe(0);
  });

  it("prunes exactly the tombstones the push handed over, and not the one beside them", async () => {
    insertItem(harness.db, "item-1");
    insertItem(harness.db, "item-2");
    harness.db.prepare("DELETE FROM inventory_items WHERE id = 'item-1'").run();
    harness.db.prepare("DELETE FROM inventory_items WHERE id = 'item-2'").run();
    // Both deletes in the same instant: only the rowid separates them, and only
    // the first was inside the page the server acknowledged.
    harness.db
      .prepare(
        "UPDATE sync_tombstones SET deleted_at = '2030-01-01T10:00:00.000Z'"
      )
      .run();
    const ids = harness.db
      .prepare(
        "SELECT rowid AS rowid, row_key FROM sync_tombstones ORDER BY rowid"
      )
      .all() as unknown as { row_key: string; rowid: number }[];
    const [first] = ids;

    const removed = await prunePushedTombstones(
      harness.sync,
      formatPushCursor({
        rowId: first.rowid,
        stamp: "2030-01-01T10:00:00.000Z",
      })
    );
    expect(removed).toBe(1);
    const left = harness.db
      .prepare("SELECT row_key FROM sync_tombstones")
      .all()
      .map((row) => (row as { row_key: string }).row_key);
    expect(left).toEqual([ids[1].row_key]);
  });

  it("prunes nothing when no cursor has been recorded", async () => {
    insertItem(harness.db, "item-1");
    harness.db.prepare("DELETE FROM inventory_items WHERE id = 'item-1'").run();
    expect(await prunePushedTombstones(harness.sync, "|0")).toBe(0);
    expect(
      harness.db.prepare("SELECT COUNT(*) AS c FROM sync_tombstones").get()
    ).toMatchObject({ c: 1 });
  });

  it("does not lose a row that shares a timestamp with the page boundary", async () => {
    // Three rows, one timestamp, a page of two: the third must come back on the
    // next pass rather than being skipped by the cursor that moved past it.
    for (const id of ["item-1", "item-2", "item-3"]) {
      insertItem(harness.db, id);
    }
    const first = await collectLocalChanges(harness.sync, { limit: 2 });
    await writePushCursors(harness.sync, first.cursors);
    const second = await collectLocalChanges(harness.sync, { limit: 2 });

    const sent = [
      ...(first.tables.find((change) => change.table === "inventory_items")
        ?.rows ?? []),
      ...(second.tables.find((change) => change.table === "inventory_items")
        ?.rows ?? []),
    ].map((row) => row.id);
    expect([...sent].sort()).toEqual(["item-1", "item-2", "item-3"]);
  });
});
