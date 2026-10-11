import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import {
  isNewer,
  timestampMs,
} from "../../../apps/desktop/src/lib/sync/conflict-resolver";
import {
  ensureDeviceId,
  readCursors,
} from "../../../apps/desktop/src/lib/sync/offline-queue";
import { SCHEMA_VERSION } from "../../../apps/desktop/src/lib/sync/schema";
import {
  pullRemoteChanges,
  runSync,
  SyncFailure,
} from "../../../apps/desktop/src/lib/sync/sync-client";
import type { SyncDatabase } from "../../../apps/desktop/src/lib/sync/types";
import type { Env } from "../src/env";
import { handleRequest } from "../src/handler";
import { fakeD1, openDeviceDatabase, workerEnv } from "./harness";

/**
 * Two devices, one Worker.
 *
 * This is the test the spec's §9 integration list asks for: an end-to-end sync
 * flow, offline/online transitions, conflict scenarios and multi-device
 * convergence, all on real SQLite databases with the app's own migrations
 * applied. Nothing is stubbed except the network hop itself, which is a
 * `handleRequest` call.
 */

interface Device {
  db: DatabaseSync;
  deviceId: string;
  sync: SyncDatabase;
}

async function openDevice(name: string): Promise<Device> {
  const { db, sync } = openDeviceDatabase();
  const deviceId = await ensureDeviceId(sync, () => name);
  return { db, deviceId, sync };
}

/** The fake network: `fetch` that calls the Worker in-process. */
function transport(env: Env, opts: { failOffline?: boolean } = {}) {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    if (opts.failOffline) {
      // What a real offline `fetch` does: reject, before any response exists.
      return Promise.reject(new TypeError("fetch failed"));
    }
    const request =
      input instanceof Request ? input : new Request(String(input), init);
    return handleRequest(request, env);
  }) as typeof fetch;
}

function client(device: Device, fetchImpl: typeof fetch) {
  return {
    db: device.sync,
    deviceId: device.deviceId,
    endpoint: "https://cmis-sync.test",
    fetchImpl,
    limit: 500,
  };
}

function insertItem(db: DatabaseSync, id: string, name: string, at: string) {
  db.prepare(
    `INSERT INTO inventory_items (id, sku, name, stock_on_hand, qty, created_at, updated_at)
     VALUES (?, ?, ?, 10, 10, ?, ?)`
  ).run(id, `SKU-${id}`, name, at, at);
}

function stockOf(db: DatabaseSync, id: string): number | null {
  const row = db
    .prepare("SELECT stock_on_hand AS stock FROM inventory_items WHERE id = ?")
    .get(id) as { stock: number | null } | undefined;
  return row?.stock ?? null;
}

function countOf(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
    c: number;
  };
  return row.c;
}

describe("two devices and one Worker", () => {
  it("moves a record from one device to the other", async () => {
    const server = openDeviceDatabase();
    const env = workerEnv(fakeD1(server.db));
    const net = transport(env);

    const a = await openDevice("dev-a");
    const b = await openDevice("dev-b");

    insertItem(a.db, "item-1", "Paracetamol", "2026-10-01T09:00:00.000Z");
    a.db
      .prepare(
        `INSERT INTO inventory_batches (id, item_id, batch, expiry, qty)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run("batch-1", "item-1", "B-1", "2027-01-01", 10);

    const first = await runSync(client(a, net));
    expect(first.pushedRows).toBeGreaterThan(0);
    expect(stockOf(server.db, "item-1")).toBe(10);
    expect(countOf(server.db, "inventory_batches")).toBeGreaterThanOrEqual(1);

    const second = await runSync(client(b, net));
    expect(second.appliedRows).toBeGreaterThan(0);
    expect(stockOf(b.db, "item-1")).toBe(10);
    expect(countOf(b.db, "inventory_batches")).toBeGreaterThanOrEqual(1);
  });

  it("carries an edit back the other way", async () => {
    const server = openDeviceDatabase();
    const net = transport(workerEnv(fakeD1(server.db)));
    const a = await openDevice("dev-a");
    const b = await openDevice("dev-b");

    insertItem(a.db, "item-1", "Paracetamol", "2026-10-01T09:00:00.000Z");
    await runSync(client(a, net));
    await runSync(client(b, net));

    // B dispenses five, later in the day.
    b.db
      .prepare(
        `UPDATE inventory_items
            SET stock_on_hand = 5, updated_at = '2026-10-01T12:00:00.000Z'
          WHERE id = 'item-1'`
      )
      .run();
    await runSync(client(b, net));
    expect(stockOf(server.db, "item-1")).toBe(5);

    await runSync(client(a, net));
    expect(stockOf(a.db, "item-1")).toBe(5);
  });

  it("resolves a concurrent edit with the newer timestamp, and reports the refusal", async () => {
    const server = openDeviceDatabase();
    const net = transport(workerEnv(fakeD1(server.db)));
    const a = await openDevice("dev-a");
    const b = await openDevice("dev-b");

    insertItem(a.db, "item-1", "Paracetamol", "2026-10-01T09:00:00.000Z");
    await runSync(client(a, net));
    await runSync(client(b, net));

    // A dispenses first and pushes.
    a.db
      .prepare(
        `UPDATE inventory_items SET stock_on_hand = 4, updated_at = ? WHERE id = 'item-1'`
      )
      .run("2026-10-01T11:00:00.000Z");
    await runSync(client(a, net));
    expect(stockOf(server.db, "item-1")).toBe(4);

    // B dispenses later, and pulls before it pushes — which is what happens
    // whenever a pull lands first, or a previous run's push was rejected.
    b.db
      .prepare(
        `UPDATE inventory_items SET stock_on_hand = 7, updated_at = ? WHERE id = 'item-1'`
      )
      .run("2026-10-01T13:00:00.000Z");
    const pulled = await pullRemoteChanges(client(b, net));

    // B refuses A's older copy and says so, which is what the audit entry is
    // written from — the spec's open question 4 answered with "log it".
    expect(pulled.conflicts).toEqual([
      expect.objectContaining({
        resolution: "row-newer",
        table: "inventory_items",
      }),
    ]);
    expect(stockOf(b.db, "item-1")).toBe(7);

    // B's copy is the newer one, so the next push makes it the cloud's.
    await runSync(client(b, net));
    expect(stockOf(server.db, "item-1")).toBe(7);

    await runSync(client(a, net));
    expect(stockOf(a.db, "item-1")).toBe(7);
  });

  it("keeps working offline and sends the backlog on reconnection", async () => {
    const server = openDeviceDatabase();
    const env = workerEnv(fakeD1(server.db));
    const a = await openDevice("dev-a");

    await runSync(client(a, transport(env, { failOffline: true }))).catch(
      (error: unknown) => {
        expect(error).toBeInstanceOf(SyncFailure);
        expect((error as SyncFailure).kind).toBe("offline");
      }
    );

    const before = await readCursors(a.sync);
    expect(before.push.rows.inventory_items ?? "").not.toContain("2026-10-01");

    // Written while "offline" — the queue is the database, so nothing is lost.
    insertItem(a.db, "item-1", "Paracetamol", "2026-10-01T09:00:00.000Z");

    await runSync(client(a, transport(env, { failOffline: true }))).catch(
      () => undefined
    );

    const result = await runSync(client(a, transport(env)));
    expect(result.pushedRows).toBeGreaterThan(0);
    expect(stockOf(server.db, "item-1")).toBe(10);

    const after = await readCursors(a.sync);
    // `<timestamp>|<rowid>`: the push cursor is a keyset, so a row sharing a
    // timestamp with the page boundary is never skipped (see `scan.ts`).
    expect(after.push.rows.inventory_items).toMatch(
      /^2026-10-01T09:00:00\.000Z\|\d+$/u
    );
  });

  it("propagates a delete, including the batches that hang off it", async () => {
    const server = openDeviceDatabase();
    const net = transport(workerEnv(fakeD1(server.db)));
    const a = await openDevice("dev-a");
    const b = await openDevice("dev-b");

    insertItem(a.db, "item-1", "Paracetamol", "2026-10-01T09:00:00.000Z");
    a.db
      .prepare(
        `INSERT INTO inventory_batches (id, item_id, batch, expiry, qty)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run("batch-1", "item-1", "B-1", "2027-01-01", 10);
    await runSync(client(a, net));
    await runSync(client(b, net));
    expect(countOf(b.db, "inventory_items")).toBe(1);

    a.db.prepare("DELETE FROM inventory_items WHERE id = ?").run("item-1");
    await runSync(client(a, net));
    expect(countOf(server.db, "inventory_items")).toBe(0);

    await runSync(client(b, net));
    expect(countOf(b.db, "inventory_items")).toBe(0);
    // The cascade on this device removed the batch, exactly as it did on the
    // device that performed the delete.
    expect(countOf(b.db, "inventory_batches")).toBe(0);
  });

  it("does not resurrect a record the other device deleted while this one was offline", async () => {
    const server = openDeviceDatabase();
    const net = transport(workerEnv(fakeD1(server.db)));
    const a = await openDevice("dev-a");
    const b = await openDevice("dev-b");

    insertItem(a.db, "item-1", "Paracetamol", "2026-10-01T09:00:00.000Z");
    await runSync(client(a, net));
    await runSync(client(b, net));

    // A deletes it; B still holds a stale copy and edits it.
    a.db.prepare("DELETE FROM inventory_items WHERE id = ?").run("item-1");
    await runSync(client(a, net));
    b.db
      .prepare(
        `UPDATE inventory_items
            SET stock_on_hand = 3, updated_at = '2026-10-01T10:00:00.000Z'
          WHERE id = 'item-1'`
      )
      .run();

    const pushB = await runSync(client(b, net));
    expect(
      pushB.conflicts.some(
        (entry) =>
          entry.table === "inventory_items" &&
          entry.resolution === "deleted-newer"
      )
    ).toBe(true);

    await runSync(client(a, net));
    expect(countOf(a.db, "inventory_items")).toBe(0);
  });

  // The case a single shared cursor gets wrong: B pushes a stale copy of the
  // row A just edited. The server refuses the stale copy, but B has still
  // *sent* something with a later timestamp (its own edit of another row), so a
  // push-driven cursor would sit above A's edit and B would never receive it.
  it("converges two devices that both edited different records", async () => {
    const server = openDeviceDatabase();
    const net = transport(workerEnv(fakeD1(server.db)));
    const a = await openDevice("dev-a");
    const b = await openDevice("dev-b");

    insertItem(a.db, "item-1", "Paracetamol", "2026-10-01T09:00:00.000Z");
    insertItem(a.db, "item-2", "Ibuprofen", "2026-10-01T09:00:00.000Z");
    await runSync(client(a, net));
    await runSync(client(b, net));

    a.db
      .prepare(
        `UPDATE inventory_items SET name = 'Paracetamol 500mg', updated_at = ? WHERE id = 'item-1'`
      )
      .run("2026-10-01T14:00:00.000Z");
    b.db
      .prepare(
        `UPDATE inventory_items SET name = 'Ibuprofen 400mg', updated_at = ? WHERE id = 'item-2'`
      )
      .run("2026-10-01T15:00:00.000Z");

    await runSync(client(a, net));
    await runSync(client(b, net));
    await runSync(client(a, net));

    const names = (db: DatabaseSync) =>
      db
        .prepare("SELECT name FROM inventory_items ORDER BY id")
        .all()
        .map((row) => (row as { name: string }).name);
    expect(names(a.db)).toEqual(["Paracetamol 500mg", "Ibuprofen 400mg"]);
    expect(names(b.db)).toEqual(["Paracetamol 500mg", "Ibuprofen 400mg"]);
  });

  it("agrees on which of two timestamps is newer, whatever format they are in", () => {
    // SQLite's `%S` format has no milliseconds and sorts *above* the same instant
    // with them lexicographically; the resolver compares instants.
    expect(timestampMs("2026-10-11T06:43:18Z")).toBe(
      timestampMs("2026-10-11T06:43:18.000Z")
    );
    expect(isNewer("2026-10-11T06:43:18.160Z", "2026-10-11T06:43:18Z")).toBe(
      true
    );
    expect(isNewer("2026-10-11T06:43:18Z", "2026-10-11T06:43:18.160Z")).toBe(
      false
    );
  });

  it("leaves the schema version the client sends in step with the migrations", () => {
    // `SCHEMA_VERSION` is what the Worker refuses a payload above; it is the
    // newest migration number, and this is the test that keeps it honest.
    expect(SCHEMA_VERSION).toBe(14);
  });
});
