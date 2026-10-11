/**
 * CMIS Cloud Sync Worker — the API the spec asks for (§4).
 *
 *   POST /sync/pull       client pulls changes
 *   POST /sync/push       client pushes changes
 *   GET  /sync/status     counts, schema version, last write
 *   POST /migrate/initial the one-time upload of pre-sync data
 *   GET  /health          liveness, for a monitor or a curl
 *
 * Every handler is a thin wrapper over `lib/sync`: the Worker and the desktop
 * client share one definition of a row key, one last-write-wins decision and one
 * set of apply statements. Duplicating that logic server-side is how a sync
 * protocol grows two subtly different behaviours and a class of "works from the
 * app, wrong from the script" bugs.
 *
 * The only server-specific concerns here are transport ones: CORS (the desktop
 * app's origin is `tauri://localhost`), request validation, an optional bearer
 * token, and error shapes.
 */

import {
  applyDeletes,
  applyRows,
} from "../../../apps/desktop/src/lib/sync/changes";
import {
  countRows,
  newestTimestamp,
  readStateValue,
  scanRows,
  scanTombstones,
  sumQty,
  writeStateValue,
} from "../../../apps/desktop/src/lib/sync/scan";
import {
  SCHEMA_VERSION,
  SYNC_TABLES,
} from "../../../apps/desktop/src/lib/sync/schema";
import type {
  SyncConflict,
  SyncDelete,
  SyncTableChange,
  SyncTableName,
} from "../../../apps/desktop/src/lib/sync/types";
import { d1Database } from "./d1";
import type { Env } from "./env";
import {
  ValidationError,
  validatePullRequest,
  validatePushRequest,
} from "./validate";

/**
 * Rows one request may carry. The client batches below this (500 by default for
 * the migration runner); the ceiling exists because a Worker invocation has a CPU
 * budget and a single 5 MB JSON body is the last thing that should spend it.
 */
export const MAX_ROWS_PER_REQUEST = 1000;

/** Cap on the request body, ahead of JSON.parse. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

/** Trailing slashes on a path, stripped once so `/sync/status/` still routes. */
const TRAILING_SLASHES = /\/+$/;

/** Conflicts reported individually before the response switches to a summary. */
const MAX_REPORTED_CONFLICTS = 100;

const MIGRATED_AT_KEY = "initial_migrated_at";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  // The desktop app is not a web page: `tauri://localhost`, `http://localhost`
  // in dev, and no cookies or credentials in any case. The spec's "no
  // authentication" is what makes this safe to leave open.
  "access-control-allow-origin": "*",
  "access-control-max-age": "86400",
};

function json(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8",
      ...extra,
    },
    status,
  });
}

function fail(error: unknown): Response {
  if (error instanceof ValidationError) {
    return json({ error: error.message, ok: false }, 400);
  }
  const message = error instanceof Error ? error.message : String(error);
  return json({ error: message, ok: false }, 500);
}

function unauthorized(): Response {
  return json({ error: "This sync server requires a token", ok: false }, 401, {
    "www-authenticate": "Bearer",
  });
}

function authorized(request: Request, env: Env): boolean {
  if (!env.SYNC_TOKEN) {
    return true;
  }
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return false;
  }
  const provided = header.slice(prefix.length).trim();
  // Length-safe compare: the tokens are short, and this avoids the early-exit
  // that would let a caller learn a prefix by timing.
  if (provided.length !== env.SYNC_TOKEN.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < provided.length; index += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: XOR-and-OR is the point — every character is folded in without an early exit, so a wrong token cannot be recovered by timing
    diff |= provided.charCodeAt(index) ^ env.SYNC_TOKEN.charCodeAt(index);
  }
  return diff === 0;
}

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    throw new ValidationError(
      `body is ${declared} bytes, the limit is ${MAX_BODY_BYTES}`
    );
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ValidationError(
      `body is ${text.length} bytes, the limit is ${MAX_BODY_BYTES}`
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ValidationError("body is not valid JSON", { cause: error });
  }
}

/** Groups deletes by table, the shape both directions use on the wire. */
function groupDeletes(deletes: SyncDeleteWithTable[]): SyncTableChange[] {
  const byTable = new Map<SyncTableName, SyncDelete[]>();
  for (const entry of deletes) {
    const list = byTable.get(entry.table) ?? [];
    list.push({
      deletedAt: entry.deletedAt,
      deviceId: entry.deviceId ?? null,
      rowKey: entry.rowKey,
    });
    byTable.set(entry.table, list);
  }
  return [...byTable].map(([table, rows]) => ({ deletes: rows, table }));
}

interface SyncDeleteWithTable extends SyncDelete {
  table: SyncTableName;
}

/**
 * Apply a change set — used by both `/sync/push` and `/migrate/initial`.
 *
 * Rows first, in `SYNC_TABLES` order, so a child's foreign key resolves;
 * deletes last, in reverse, so a parent's cascade does not make its children's
 * deletes look like they targeted nothing.
 */
async function applyChanges(
  db: ReturnType<typeof d1Database>,
  tables: SyncTableChange[]
): Promise<{
  applied: Partial<Record<SyncTableName, number>>;
  conflicts: SyncConflict[];
  skipped: Partial<Record<SyncTableName, number>>;
}> {
  const byTable = new Map<SyncTableName, SyncTableChange>();
  for (const change of tables) {
    byTable.set(change.table, change);
  }
  const applied: Partial<Record<SyncTableName, number>> = {};
  const skipped: Partial<Record<SyncTableName, number>> = {};
  const conflicts: SyncConflict[] = [];

  for (const spec of SYNC_TABLES) {
    const rows = byTable.get(spec.name)?.rows;
    if (!rows || rows.length === 0) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: rows apply parents-first so a child's foreign key always resolves
    const result = await applyRows(db, spec.name, rows);
    applied[spec.name] = (applied[spec.name] ?? 0) + result.applied;
    skipped[spec.name] = (skipped[spec.name] ?? 0) + result.skipped;
    conflicts.push(...result.conflicts);
  }

  for (const spec of [...SYNC_TABLES].reverse()) {
    const deletes = byTable.get(spec.name)?.deletes;
    if (!deletes || deletes.length === 0) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: deletes apply children-first so a parent's cascade cannot pre-empt them
    const result = await applyDeletes(db, spec.name, deletes);
    applied[spec.name] = (applied[spec.name] ?? 0) + result.applied;
    skipped[spec.name] = (skipped[spec.name] ?? 0) + result.skipped;
    conflicts.push(...result.conflicts);
  }

  return { applied, conflicts, skipped };
}

async function handleStatus(
  db: ReturnType<typeof d1Database>
): Promise<Response> {
  const counts: Partial<Record<SyncTableName, number>> = {};
  const totals: Partial<Record<SyncTableName, number>> = {};
  let lastWriteAt: string | null = null;
  for (const spec of SYNC_TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: one count and one aggregate per table, eight in total
    counts[spec.name] = await countRows(db, spec.name);
    if (spec.name === "inventory_items" || spec.name === "inventory_batches") {
      totals[spec.name] = await sumQty(db, spec.name);
    }
    const latest = await newestTimestamp(db, spec.name);
    if (latest && (lastWriteAt === null || latest > lastWriteAt)) {
      lastWriteAt = latest;
    }
  }
  return json({
    counts,
    initialMigratedAt: await readStateValue(db, MIGRATED_AT_KEY),
    lastWriteAt,
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    serverTime: new Date().toISOString(),
    totals,
  });
}

async function handlePull(
  db: ReturnType<typeof d1Database>,
  body: unknown
): Promise<Response> {
  const pull = validatePullRequest(body);
  const tables: SyncTableChange[] = [];
  let hasMore = false;

  for (const spec of SYNC_TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: each table is a separate scan, so a page of one cannot starve the others
    const page = await scanRows(
      db,
      spec.name,
      pull.cursors.rows[spec.name] ?? "",
      pull.limit
    );
    hasMore = hasMore || page.hasMore;
    if (page.rows.length > 0) {
      tables.push({ cursor: page.cursor, rows: page.rows, table: spec.name });
    }
  }

  const tombstones = await scanTombstones(db, pull.cursors.deleted, pull.limit);
  hasMore = hasMore || tombstones.hasMore;
  if (tombstones.rows.length > 0) {
    // The client's own deletes are still sent back: another device needs them,
    // and the origin device recognises them by `deviceId`.
    tables.push(...groupDeletes(tombstones.rows));
  }
  return json(
    {
      deletedCursor:
        tombstones.rows.length > 0 ? tombstones.cursor : pull.cursors.deleted,
      hasMore,
      ok: true,
      serverTime: new Date().toISOString(),
      tables,
    },
    200,
    { "cache-control": "no-store" }
  );
}

async function handlePush(
  db: ReturnType<typeof d1Database>,
  body: unknown
): Promise<Response> {
  const push = validatePushRequest(body, MAX_ROWS_PER_REQUEST);
  if (push.schemaVersion > SCHEMA_VERSION) {
    return json(
      {
        error: `this server speaks schema version ${SCHEMA_VERSION}; the client sent ${push.schemaVersion}. Deploy the Worker first.`,
        ok: false,
      },
      409
    );
  }
  const result = await applyChanges(db, push.changes.tables);
  return json({
    applied: result.applied,
    conflicts: result.conflicts.slice(0, MAX_REPORTED_CONFLICTS),
    ok: true,
    serverTime: new Date().toISOString(),
    skipped: result.skipped,
  });
}

async function handleInitialMigration(
  db: ReturnType<typeof d1Database>,
  body: unknown
): Promise<Response> {
  const migration = validatePushRequest(body, MAX_ROWS_PER_REQUEST);
  const result = await applyChanges(db, migration.changes.tables);
  await writeStateValue(db, MIGRATED_AT_KEY, new Date().toISOString());
  await writeStateValue(db, "schema_version", String(SCHEMA_VERSION));
  return json({
    applied: result.applied,
    conflicts: result.conflicts.slice(0, MAX_REPORTED_CONFLICTS),
    migratedAt: new Date().toISOString(),
    ok: true,
    serverTime: new Date().toISOString(),
    skipped: result.skipped,
  });
}

/** The whole API, as one pure function of (request, env). */
export async function handleRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(TRAILING_SLASHES, "") || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }

  if (path === "/health") {
    return json({
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      service: "cmis-sync",
    });
  }

  if (!authorized(request, env)) {
    return unauthorized();
  }

  const db = d1Database(env.DB);

  try {
    if (path === "/sync/status" && request.method === "GET") {
      return await handleStatus(db);
    }
    if (path === "/sync/pull" && request.method === "POST") {
      return await handlePull(db, await readJson(request));
    }
    if (path === "/sync/push" && request.method === "POST") {
      return await handlePush(db, await readJson(request));
    }
    if (path === "/migrate/initial" && request.method === "POST") {
      return await handleInitialMigration(db, await readJson(request));
    }
    return json(
      { error: `no route for ${request.method} ${path}`, ok: false },
      404
    );
  } catch (error) {
    return fail(error);
  }
}
