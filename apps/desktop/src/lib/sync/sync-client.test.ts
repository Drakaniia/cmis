import { beforeEach, describe, expect, it } from "vitest";

import {
  AFTER_SEEDS,
  flushSeedBacklog,
  openSyncedDatabase,
  stubFetch,
} from "@/test/sync-database";
import { ensureDeviceId, readCursors, writePullCursors } from "./offline-queue";
import { SCHEMA_VERSION } from "./schema";
import {
  applyPullResponse,
  DEFAULT_TIMEOUT_MS,
  fetchSyncStatus,
  pullRemoteChanges,
  pushLocalChanges,
  runSync,
  type SyncClientOptions,
  SyncFailure,
} from "./sync-client";
import type { SyncDatabase, SyncPullResponse } from "./types";

const AT = "2026-10-01T09:00:00.000Z";

function insertItem(
  db: ReturnType<typeof openSyncedDatabase>["db"],
  id = "item-1"
): void {
  db.prepare(
    `INSERT INTO inventory_items (id, sku, name, stock_on_hand, qty, created_at, updated_at)
     VALUES (?, ?, 'Paracetamol', 10, 10, ?, ?)`
  ).run(id, `SKU-${id}`, AFTER_SEEDS, AFTER_SEEDS);
}

async function baseOptions(
  harness: ReturnType<typeof openSyncedDatabase>,
  fetchImpl: typeof fetch
): Promise<SyncClientOptions> {
  const deviceId = await ensureDeviceId(harness.sync, () => "dev-1");
  return {
    db: harness.sync,
    deviceId,
    endpoint: "https://cmis-sync.test",
    fetchImpl,
    limit: 500,
  };
}

function insertsFor(
  db: ReturnType<typeof openSyncedDatabase>["db"],
  table: string
): Record<string, unknown>[] {
  return db.prepare(`SELECT * FROM ${table}`).all() as unknown as Record<
    string,
    unknown
  >[];
}

describe("the client", () => {
  let harness: ReturnType<typeof openSyncedDatabase>;

  beforeEach(async () => {
    harness = openSyncedDatabase();
    // Migration 0006/0013 seed categories and vocabulary; a first sync really
    // does upload them, but a test about one item should not have to count them.
    await flushSeedBacklog(harness.sync);
  });

  it("sends a push with the device id and the schema version", async () => {
    insertItem(harness.db);
    const { calls, fetchImpl } = stubFetch(() => ({
      body: {
        applied: { inventory_items: 1 },
        conflicts: [],
        ok: true,
        serverTime: AT,
      },
    }));
    const options = await baseOptions(harness, fetchImpl);
    await pushLocalChanges(options);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://cmis-sync.test/sync/push");
    expect(calls[0].body).toMatchObject({
      deviceId: "dev-1",
      schemaVersion: SCHEMA_VERSION,
    });
  });

  it("does not spend a request when there is nothing to push", async () => {
    const { calls, fetchImpl } = stubFetch(() => ({ body: {} }));
    const options = await baseOptions(harness, fetchImpl);
    await pushLocalChanges(options);
    expect(calls).toHaveLength(0);
  });

  it("classifies a failed connection as offline and leaves the cursors alone", async () => {
    insertItem(harness.db);
    const options = await baseOptions(harness, (() =>
      Promise.reject(
        new TypeError("fetch failed")
      )) as unknown as typeof fetch);
    const before = await readCursors(harness.sync);

    await expect(pushLocalChanges(options)).rejects.toMatchObject({
      kind: "offline",
    });
    await expect(pushLocalChanges(options)).rejects.toBeInstanceOf(SyncFailure);

    // Nothing moved: the same rows are still owed to the server, so the next
    // successful run sends them rather than skipping them.
    await expect(readCursors(harness.sync)).resolves.toEqual(before);
  });

  it("reports a timeout as a timeout, not as an unreachable server", async () => {
    insertItem(harness.db);
    // What WebKit/WebView2 actually rejects with when our own controller
    // aborts — the message is engine-specific, so only the signal can say.
    const hanging: typeof fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("signal is aborted without reason", "AbortError"));
        });
      })) as unknown as typeof fetch;
    const options = await baseOptions(harness, hanging);

    // `timeout`, not `offline`: the Worker was reachable and busy. Reporting it
    // as offline told the operator to debug a network that was working.
    await expect(
      fetchSyncStatus({ ...options, fetchImpl: hanging, timeoutMs: 5 })
    ).rejects.toMatchObject({ kind: "timeout" });
    await expect(
      fetchSyncStatus({ ...options, fetchImpl: hanging, timeoutMs: 5 })
    ).rejects.toThrow("The sync request timed out");
  });

  it("classifies an HTTP error as a server failure and keeps the status", async () => {
    insertItem(harness.db);
    const { fetchImpl } = stubFetch(() => ({
      body: { error: "boom", ok: false },
      status: 500,
      statusText: "Internal Server Error",
    }));
    const options = await baseOptions(harness, fetchImpl);

    await expect(pushLocalChanges(options)).rejects.toMatchObject({
      kind: "server",
      status: 500,
    });
  });

  it("sends the bearer token when one is configured", async () => {
    insertItem(harness.db);
    const headers: (string | null)[] = [];
    const { fetchImpl } = stubFetch((_url, init) => {
      headers.push(new Headers(init.headers).get("authorization"));
      return { body: { applied: {}, conflicts: [], ok: true, serverTime: AT } };
    });
    const options = await baseOptions(harness, fetchImpl);
    await pushLocalChanges({ ...options, token: "s3cret" });
    expect(headers).toEqual(["Bearer s3cret"]);
  });

  it("applies a pulled row and advances only the pull cursor", async () => {
    const row = {
      created_at: "2026-10-02T09:00:00.000Z",
      id: "item-remote",
      name: "Ibuprofen",
      qty: 4,
      sku: "SKU-remote",
      stock_on_hand: 4,
      updated_at: "2026-10-02T09:00:00.000Z",
    };
    const { fetchImpl } = stubFetch((url) => {
      if (url.endsWith("/sync/push")) {
        return {
          body: { applied: {}, conflicts: [], ok: true, serverTime: AT },
        };
      }
      return {
        body: {
          deletedCursor: "",
          hasMore: false,
          ok: true,
          serverTime: AT,
          tables: [
            {
              cursor: "2026-10-02T09:00:00.000Z",
              rows: [row],
              table: "inventory_items",
            },
          ],
        },
      };
    });
    const options = await baseOptions(harness, fetchImpl);
    const result = await pullRemoteChanges(options);

    expect(result.appliedRows).toBe(1);
    expect(insertsFor(harness.db, "inventory_items")).toHaveLength(1);

    const cursors = await readCursors(harness.sync);
    expect(cursors.pull.rows.inventory_items).toBe("2026-10-02T09:00:00.000Z");
    // The push cursor is untouched: receiving a row is not having sent one.
    expect(cursors.push.rows.inventory_items ?? "").not.toContain("2026-10-02");
  });

  it("skips a child row whose parent has not arrived", async () => {
    const response: SyncPullResponse = {
      deletedCursor: "",
      hasMore: false,
      ok: true,
      serverTime: AT,
      tables: [
        {
          rows: [
            {
              at: AT,
              author: "Nurse",
              request_id: "req-absent",
              text: "orphan",
            },
          ],
          table: "request_notes",
        },
      ],
    };
    const outcome = await applyPullResponse(harness.sync, response);
    expect(outcome.appliedRows).toBe(0);
    expect(outcome.skipped).toBe(1);
    expect(insertsFor(harness.db, "request_notes")).toHaveLength(0);
  });

  it("runs push before pull, so its own edit is decided once against the newest state", async () => {
    insertItem(harness.db);
    const order: string[] = [];
    const { fetchImpl } = stubFetch((url) => {
      order.push(url.endsWith("/sync/push") ? "push" : "pull");
      return url.endsWith("/sync/push")
        ? {
            body: {
              applied: {},
              conflicts: [],
              ok: true,
              serverTime: AT,
              skipped: {},
            },
          }
        : {
            body: {
              deletedCursor: "",
              hasMore: false,
              ok: true,
              serverTime: AT,
              tables: [],
            },
          };
    });
    const options = await baseOptions(harness, fetchImpl);
    await runSync(options);
    expect(order).toEqual(["push", "pull"]);
  });

  it("reports both halves of a run in one result", async () => {
    insertItem(harness.db);
    const { fetchImpl } = stubFetch((url) =>
      url.endsWith("/sync/push")
        ? {
            body: {
              applied: { inventory_items: 1 },
              conflicts: [],
              ok: true,
              serverTime: AT,
              skipped: {},
            },
          }
        : {
            body: {
              deletedCursor: "",
              hasMore: false,
              ok: true,
              serverTime: AT,
              tables: [
                {
                  rows: [
                    {
                      deleted_at: AT,
                      row_key: "item-remote",
                      table_name: "inventory_items",
                    },
                  ],
                  table: "inventory_items",
                },
              ],
            },
          }
    );
    const options = await baseOptions(harness, fetchImpl);
    const result = await runSync(options);
    expect(result.pushedRows).toBe(1);
    expect(result.appliedRows).toBe(0);
    expect(result.appliedDeletes).toBe(0);
    expect(result.moreToPush).toBe(false);
  });

  it("gives a first full-table push a budget the server can actually answer", async () => {
    // The regression this pins: a device with no push cursors yet sends every
    // row it owns in ONE request, and the Worker applies it a row at a time —
    // several sequential D1 round trips per row. Under a 20s budget a healthy
    // Worker was reported as an unreachable server and the backlog never moved.
    for (let index = 0; index < 174; index += 1) {
      insertItem(harness.db, `item-${index}`);
    }
    const { fetchImpl } = stubFetch((url) =>
      url.endsWith("/sync/push")
        ? {
            body: {
              applied: { inventory_items: 174 },
              conflicts: [],
              ok: true,
              serverTime: AT,
              skipped: {},
            },
          }
        : { body: { deletedCursor: "", hasMore: false, ok: true, tables: [] } }
    );
    // Deliberately no `timeoutMs`: the default is what the app ships with, and
    // this is the number that has to be big enough.
    const options = await baseOptions(harness, fetchImpl);
    const result = await runSync({ ...options, limit: 1000 });

    expect(result.pushedRows).toBe(174);
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
  });

  it("only moves a pull cursor forward, never back to the rewound bound", async () => {
    await writePullCursors(harness.sync, {
      deleted: "",
      rows: { inventory_items: "2026-10-05T00:00:00.000Z" },
    });
    const { fetchImpl } = stubFetch((url) =>
      url.endsWith("/sync/push")
        ? {
            body: {
              applied: {},
              conflicts: [],
              ok: true,
              serverTime: AT,
              skipped: {},
            },
          }
        : {
            body: {
              // The server echoes the rewound bound it was given when it has
              // nothing new; treating that as progress would re-send history.
              deletedCursor: "",
              hasMore: false,
              ok: true,
              serverTime: AT,
              tables: [
                {
                  cursor: "2026-10-01T00:00:00.000Z",
                  rows: [],
                  table: "inventory_items",
                },
              ],
            },
          }
    );
    const options = await baseOptions(harness, fetchImpl);
    await pullRemoteChanges(options);
    const cursors = await readCursors(harness.sync);
    expect(cursors.pull.rows.inventory_items).toBe("2026-10-05T00:00:00.000Z");
  });

  it("reads status without touching the database", async () => {
    const { calls, fetchImpl } = stubFetch(() => ({
      body: {
        counts: { inventory_items: 3 },
        ok: true,
        schemaVersion: SCHEMA_VERSION,
        serverTime: AT,
      },
    }));
    const status = await fetchSyncStatus({
      endpoint: "https://cmis-sync.test",
      fetchImpl,
    });
    expect(calls).toHaveLength(1);
    expect(status.counts.inventory_items).toBe(3);
    expect(calls[0].url).toBe("https://cmis-sync.test/sync/status");
  });

  it("treats a non-JSON success body as a protocol failure", async () => {
    const fetchImpl = (async () =>
      new Response("<html>oops</html>", {
        status: 200,
      })) as unknown as typeof fetch;
    await expect(
      fetchSyncStatus({ endpoint: "https://cmis-sync.test", fetchImpl })
    ).rejects.toMatchObject({ kind: "protocol" });
  });

  it("exposes the database shape the engine needs, nothing more", () => {
    // A compile-time contract rather than a runtime one: the engine runs against
    // the desktop's SQLite handle, D1 and `node:sqlite` because it asks for two
    // methods and nothing else.
    const db: SyncDatabase = harness.sync;
    expect(typeof db.select).toBe("function");
    expect(typeof db.execute).toBe("function");
  });
});
