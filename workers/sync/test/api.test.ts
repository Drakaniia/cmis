import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "../../../apps/desktop/src/lib/sync/schema";
import { handleRequest } from "../src/handler";
import { fakeD1, openDeviceDatabase, workerEnv } from "./harness";

const BASE = "https://cmis-sync.test";

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new Request(`${BASE}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

function server() {
  const device = openDeviceDatabase();
  const d1 = fakeD1(device.db);
  return { ...device, d1, env: workerEnv(d1) };
}

const REQUEST_ROW = {
  board_position: 0,
  category: "Analgesic",
  denied_note: null,
  denied_reason: null,
  id: "req-1",
  item_id: null,
  medicine: "Paracetamol 500mg",
  qty: 2,
  reason: "headache",
  requestor_email: "nurse@clinic.test",
  requestor_id: "n-1",
  requestor_name: "Nurse",
  source: "queue",
  status: "pending",
  submitted_at: "2026-10-01T08:00:00.000Z",
  unit: "tablet",
  updated_at: "2026-10-01T08:00:00.000Z",
};

describe("worker API", () => {
  it("answers /health without touching the database", async () => {
    const { env } = server();
    const response = await handleRequest(new Request(`${BASE}/health`), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("answers a CORS preflight for the desktop app's origin", async () => {
    const { env } = server();
    const response = await handleRequest(
      new Request(`${BASE}/sync/push`, { method: "OPTIONS" }),
      env
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST"
    );
  });

  it("reports counts and the schema version on /sync/status", async () => {
    const { db, env } = server();
    db.prepare(
      `INSERT INTO inventory_items (id, sku, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      "item-1",
      "SKU-1",
      "Paracetamol",
      "2026-10-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z"
    );

    const response = await handleRequest(
      new Request(`${BASE}/sync/status`),
      env
    );
    const body = (await response.json()) as {
      counts: Record<string, number>;
      lastWriteAt: string | null;
      schemaVersion: number;
    };
    expect(body.schemaVersion).toBe(SCHEMA_VERSION);
    expect(body.counts.inventory_items).toBe(1);
    // Not the item's timestamp: migration 0013 seeds `vocabulary_terms` with
    // SQLite's own clock, so the newest row in the database is a seed. Asserting
    // that the newest change is at least as recent as the row we just wrote is
    // the honest version of this check.
    expect(body.lastWriteAt).not.toBeNull();
    expect(
      Date.parse(body.lastWriteAt ?? "") >=
        Date.parse("2026-10-01T00:00:00.000Z")
    ).toBe(true);
  });

  it("applies a push and hands the rows back on the next pull", async () => {
    const { env, d1 } = server();

    const push = await handleRequest(
      post("/sync/push", {
        deviceId: "dev-a",
        schemaVersion: SCHEMA_VERSION,
        tables: [{ rows: [REQUEST_ROW], table: "requests" }],
      }),
      env
    );
    expect(push.status).toBe(200);
    expect(await push.json()).toMatchObject({
      applied: { requests: 1 },
      ok: true,
    });
    expect(
      d1.db.prepare("SELECT COUNT(*) AS c FROM requests").get()
    ).toMatchObject({ c: 1 });

    const pull = await handleRequest(
      post("/sync/pull", {
        cursors: { deleted: "", rows: {} },
        deviceId: "dev-b",
        limit: 100,
        schemaVersion: SCHEMA_VERSION,
      }),
      env
    );
    const body = (await pull.json()) as {
      tables: { rows?: { id: string }[]; table: string }[];
    };
    const requests = body.tables.find((entry) => entry.table === "requests");
    expect(requests?.rows?.map((row) => row.id)).toEqual(["req-1"]);
  });

  it("returns nothing when the client's cursor is already current", async () => {
    const { env } = server();
    await handleRequest(
      post("/sync/push", {
        deviceId: "dev-a",
        schemaVersion: SCHEMA_VERSION,
        tables: [{ rows: [REQUEST_ROW], table: "requests" }],
      }),
      env
    );

    const pull = await handleRequest(
      post("/sync/pull", {
        cursors: {
          deleted: "",
          rows: { requests: "2026-10-01T08:00:00.000Z" },
        },
        deviceId: "dev-b",
        limit: 100,
        schemaVersion: SCHEMA_VERSION,
      }),
      env
    );
    const body = (await pull.json()) as {
      tables: { rows?: unknown[]; table: string }[];
    };
    // A cursor that covers `requests` returns no request rows. Other tables are
    // still empty of a cursor here, so 0013's seeded vocabulary legitimately
    // comes back with them — the cursor is per table, which is the point.
    expect(body.tables.some((entry) => entry.table === "requests")).toBe(false);
  });

  it("propagates a delete as a tombstone", async () => {
    const { env, db } = server();
    db.prepare(
      `INSERT INTO inventory_items (id, sku, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      "item-9",
      "SKU-9",
      "Ibuprofen",
      "2026-10-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z"
    );
    // Migration 0014's trigger is what records this, not the client.
    db.prepare("DELETE FROM inventory_items WHERE id = ?").run("item-9");

    const pull = await handleRequest(
      post("/sync/pull", {
        cursors: { deleted: "", rows: {} },
        deviceId: "dev-b",
        limit: 100,
        schemaVersion: SCHEMA_VERSION,
      }),
      env
    );
    const body = (await pull.json()) as {
      tables: { deletes?: { rowKey: string }[]; table: string }[];
    };
    expect(
      body.tables.find((entry) => entry.table === "inventory_items")?.deletes
    ).toEqual([expect.objectContaining({ rowKey: "item-9" })]);
  });

  it("refuses a row for a table this build does not sync", async () => {
    const { env } = server();
    const response = await handleRequest(
      post("/sync/push", {
        deviceId: "dev-a",
        schemaVersion: SCHEMA_VERSION,
        tables: [{ rows: [{ id: "x" }], table: "sqlite_master" }],
      }),
      env
    );
    expect(response.status).toBe(400);
  });

  it("refuses a row whose value is not a scalar", async () => {
    const { env } = server();
    const response = await handleRequest(
      post("/sync/push", {
        deviceId: "dev-a",
        schemaVersion: SCHEMA_VERSION,
        tables: [
          { rows: [{ ...REQUEST_ROW, qty: { nested: 1 } }], table: "requests" },
        ],
      }),
      env
    );
    expect(response.status).toBe(400);
  });

  it("refuses a client from a newer schema than this Worker", async () => {
    const { env } = server();
    const response = await handleRequest(
      post("/sync/push", {
        deviceId: "dev-a",
        schemaVersion: SCHEMA_VERSION + 1,
        tables: [],
      }),
      env
    );
    expect(response.status).toBe(409);
  });

  it("requires the bearer token when SYNC_TOKEN is configured", async () => {
    const device = openDeviceDatabase();
    const env = workerEnv(fakeD1(device.db), "s3cret");

    const anonymous = await handleRequest(
      new Request(`${BASE}/sync/status`),
      env
    );
    expect(anonymous.status).toBe(401);

    const wrong = await handleRequest(
      new Request(`${BASE}/sync/status`, {
        headers: { authorization: "Bearer nope" },
      }),
      env
    );
    expect(wrong.status).toBe(401);

    const right = await handleRequest(
      new Request(`${BASE}/sync/status`, {
        headers: { authorization: "Bearer s3cret" },
      }),
      env
    );
    expect(right.status).toBe(200);
  });

  it("records the one-time migration marker on /migrate/initial", async () => {
    const { env } = server();
    const response = await handleRequest(
      post("/migrate/initial", {
        deviceId: "dev-a",
        schemaVersion: SCHEMA_VERSION,
        tables: [{ rows: [REQUEST_ROW], table: "requests" }],
      }),
      env
    );
    expect(response.status).toBe(200);

    const status = await handleRequest(new Request(`${BASE}/sync/status`), env);
    const body = (await status.json()) as { initialMigratedAt: string | null };
    expect(body.initialMigratedAt).not.toBeNull();
  });
});
