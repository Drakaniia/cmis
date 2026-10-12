/**
 * CMIS Cloud Sync — the client, and the order a sync runs in.
 *
 * One run is: **push, then pull**. Pushing first means the cloud has this
 * device's edits before it hands back anyone else's, so a conflict is decided
 * once against the newest state rather than twice against a stale one.
 *
 * Every network call is a plain `fetch` with a timeout. There is no WebSocket
 * and no long-lived connection: the spec's open question 3 (real-time mechanism)
 * is answered as *throttled polling*, which is its own stated mitigation —
 * "start with simple polling-based sync before adding real-time WebSocket" — and
 * a desktop app that must work offline gains nothing from a socket it cannot
 * hold onto.
 *
 * Failures are classified rather than reported raw: `offline` means the request
 * never left the machine (no connection, DNS, timeout) and the UI says so;
 * `server` means the Worker answered with an error worth showing. Both leave the
 * cursors untouched, so nothing is skipped by a failed attempt.
 */

import { type ApplyOptions, applyDeletes, applyRows } from "./changes";
import { isNewer } from "./conflict-resolver";
import {
  collectLocalChanges,
  prunePushedTombstones,
  readCursors,
  type SyncCursors,
  writePullCursors,
  writePushCursors,
} from "./offline-queue";
import { rewindCursor } from "./scan";
import { SCHEMA_VERSION, SYNC_TABLES } from "./schema";
import type {
  SyncConflict,
  SyncDatabase,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncStatusResponse,
  SyncTableChange,
  SyncTableName,
} from "./types";

export type SyncFailureKind = "offline" | "protocol" | "server" | "timeout";

export class SyncFailure extends Error {
  readonly kind: SyncFailureKind;
  readonly status: number | null;

  constructor(
    message: string,
    kind: SyncFailureKind,
    status: number | null = null,
    cause?: unknown
  ) {
    // The cause is kept rather than flattened into the message: a fetch
    // rejection's own stack is what explains *why* the request never completed.
    super(message, cause === undefined ? undefined : { cause });
    this.kind = kind;
    this.name = "SyncFailure";
    this.status = status;
  }
}

/** Just the connection: enough for `/sync/status`, which needs no database. */
export interface SyncEndpointOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  token?: string;
}

export interface SyncClientOptions extends SyncEndpointOptions {
  db: SyncDatabase;
  deviceId: string;
  /** Rows per table per pass; the spec's `OFFLINE_QUEUE_MAX_SIZE`. */
  limit: number;
  /** Pages of pull per run, so one pass cannot loop forever on a big backlog. */
  maxPages?: number;
  /**
   * The "This device's data" strategy (`docs/cloud-sync-data-guard-spec.md`
   * §6.4): an incoming row or delete never overwrites an existing local row.
   */
  preferLocal?: boolean;
}

export interface SyncRunResult {
  appliedDeletes: number;
  appliedRows: number;
  conflicts: SyncConflict[];
  /** `true` when a pass was capped and another is due immediately. */
  moreToPush: boolean;
  pushedDeletes: number;
  pushedRows: number;
  serverTime: string | null;
  skipped: number;
}

export interface PullApplyOutcome {
  appliedDeletes: number;
  appliedRows: number;
  conflicts: SyncConflict[];
  skipped: number;
}

/**
 * Per-request budget.
 *
 * Generous on purpose. A push is not one round trip: the Worker applies it a row
 * at a time, and each row costs a handful of sequential D1 queries (parent
 * check, local timestamp, tombstone, write, tombstone cleanup — see
 * `changes.ts`). A few hundred queued rows is therefore ~1000 serial D1
 * round-trips, which measures at tens of seconds against a healthy Worker. A
 * tight budget reports that healthy-but-busy server as a failed sync and, worse,
 * re-sends the same backlog every interval. Raise it here, not per call site.
 */
export const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_PAGES = 10;

function resolveFetch(options: SyncEndpointOptions): typeof fetch {
  const impl = options.fetchImpl ?? globalThis.fetch;
  if (typeof impl !== "function") {
    throw new SyncFailure(
      "This runtime has no fetch implementation",
      "protocol"
    );
  }
  return impl;
}

function authHeaders(options: SyncEndpointOptions): Record<string, string> {
  const base: Record<string, string> = { "content-type": "application/json" };
  if (options.token) {
    base.authorization = `Bearer ${options.token}`;
  }
  return base;
}

async function request<T>(
  options: SyncEndpointOptions,
  path: string,
  init: { body?: unknown; method: "GET" | "POST" }
): Promise<T> {
  const doFetch = resolveFetch(options);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  let response: Response;
  try {
    response = await doFetch(`${options.endpoint}${path}`, {
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: authHeaders(options),
      method: init.method,
      signal: controller.signal,
    });
  } catch (error) {
    // A `fetch` rejection is "the request never completed": offline, DNS, TLS,
    // CORS, or the timeout above. Nothing is lost — the cursors have not moved.
    // Our own signal is the only thing that can abort here, so check the signal
    // rather than the message: engines word it differently (Firefox "The
    // operation was aborted.", WebKit/WebView2 "signal is aborted without
    // reason"), and a timeout must not read as "server unreachable".
    //
    // A timeout is its own kind, not `offline`: the Worker applying a large
    // page spends one D1 round trip per row per guard (see `changes.ts`), so a
    // healthy server routinely answers slower than the budget. Reporting that
    // as "offline" told the operator to go and fix a network that was fine.
    if (controller.signal.aborted) {
      // biome-ignore lint/style/useErrorCause: SyncFailure forwards this cause to Error's options; Biome cannot see through the custom constructor's fourth parameter
      throw new SyncFailure(
        "The sync request timed out — the server is reachable but slow to answer this batch",
        "timeout",
        null,
        error
      );
    }
    // biome-ignore lint/style/useErrorCause: SyncFailure forwards this cause to Error's options; Biome cannot see through the custom constructor's fourth parameter
    throw new SyncFailure(
      `Could not reach the sync server (${
        error instanceof Error ? error.message : String(error)
      })`,
      "offline",
      null,
      error
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new SyncFailure(
      `${path} failed: ${response.status} ${response.statusText}${
        text === "" ? "" : ` — ${text.slice(0, 300)}`
      }`,
      "server",
      response.status
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: SyncFailure forwards this cause to Error's options; Biome cannot see through the custom constructor's fourth parameter
    throw new SyncFailure(
      `${path} returned a body that is not JSON`,
      "protocol",
      response.status,
      error
    );
  }
}

/** `GET /sync/status` — the settings panel and the health check use this. */
export function fetchSyncStatus(
  options: SyncEndpointOptions
): Promise<SyncStatusResponse> {
  return request<SyncStatusResponse>(options, "/sync/status", {
    method: "GET",
  });
}

/** Sends this device's pending rows and deletes; advances cursors on `ok`. */
export async function pushLocalChanges(options: SyncClientOptions): Promise<{
  moreToPush: boolean;
  pushedDeletes: number;
  pushedRows: number;
  response: SyncPushResponse;
}> {
  const collected = await collectLocalChanges(options.db, {
    limit: options.limit,
  });
  const pushedRows = collected.tables.reduce(
    (total, table) => total + (table.rows?.length ?? 0),
    0
  );
  const pushedDeletes = collected.tables.reduce(
    (total, table) => total + (table.deletes?.length ?? 0),
    0
  );

  if (pushedRows === 0 && pushedDeletes === 0) {
    // Nothing outstanding: do not spend a request on an empty payload.
    await writePushCursors(options.db, collected.cursors);
    return {
      moreToPush: false,
      pushedDeletes,
      pushedRows,
      response: {
        applied: {},
        conflicts: [],
        ok: true,
        serverTime: new Date().toISOString(),
        skipped: {},
      },
    };
  }

  const body: SyncPushRequest = {
    deviceId: options.deviceId,
    schemaVersion: SCHEMA_VERSION,
    tables: collected.tables,
  };
  const response = await request<SyncPushResponse>(options, "/sync/push", {
    body,
    method: "POST",
  });
  await writePushCursors(options.db, collected.cursors);
  // Only after the server acknowledged, and only up to what was actually sent —
  // a tombstone whose delete lost a conflict, or one the page limit left behind,
  // stays so that decision is re-sent until the server accepts it.
  await prunePushedTombstones(options.db, collected.cursors.deleted);
  return {
    moreToPush: collected.hasMore,
    pushedDeletes,
    pushedRows,
    response,
  };
}

/** Cursors only ever move forward; a rewound `since` is not progress. */
function mergeCursors(
  current: SyncCursors,
  incoming: SyncCursors
): SyncCursors {
  const rows: Partial<Record<SyncTableName, string>> = {};
  for (const spec of SYNC_TABLES) {
    const now = current.rows[spec.name] ?? "";
    const next = incoming.rows[spec.name] ?? "";
    rows[spec.name] = isNewer(next, now) ? next : now;
  }
  return {
    deleted: isNewer(incoming.deleted, current.deleted)
      ? incoming.deleted
      : current.deleted,
    rows,
  };
}

/** Applies one pull response: parents then children, deletes in reverse. */
export async function applyPullResponse(
  db: SyncDatabase,
  response: SyncPullResponse,
  opts: ApplyOptions = {}
): Promise<PullApplyOutcome> {
  const byTable = new Map<SyncTableName, SyncTableChange>();
  for (const change of response.tables) {
    byTable.set(change.table, change);
  }

  const outcome: PullApplyOutcome = {
    appliedDeletes: 0,
    appliedRows: 0,
    conflicts: [],
    skipped: 0,
  };

  // Parents first (SYNC_TABLES order), so a child's foreign key resolves.
  for (const spec of SYNC_TABLES) {
    const rows = byTable.get(spec.name)?.rows;
    if (!rows || rows.length === 0) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: a child row can only be written once its parent exists, so these tables are applied one after another in dependency order
    const result = await applyRows(db, spec.name, rows, opts);
    outcome.appliedRows += result.applied;
    outcome.skipped += result.skipped;
    outcome.conflicts.push(...result.conflicts);
  }

  // Deletes last, children before parents: a parent delete cascades, so running
  // it first would make the child deletes look like "no such row".
  for (const spec of [...SYNC_TABLES].reverse()) {
    const deletes = byTable.get(spec.name)?.deletes;
    if (!deletes || deletes.length === 0) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: the reverse-dependency order is the point — a parent's cascade must not run first
    const result = await applyDeletes(db, spec.name, deletes, opts);
    outcome.appliedDeletes += result.applied;
    outcome.skipped += result.skipped;
    outcome.conflicts.push(...result.conflicts);
  }

  return outcome;
}

/**
 * Pulls pages until the server has nothing left, or `maxPages` runs out.
 * Cursors only advance to a value the server actually returned — an empty page
 * echoes the client's own rewound bound, which must not be mistaken for
 * progress.
 */
export async function pullRemoteChanges(options: SyncClientOptions): Promise<{
  appliedDeletes: number;
  appliedRows: number;
  conflicts: SyncConflict[];
  serverTime: string | null;
  skipped: number;
  truncated: boolean;
}> {
  let cursors = (await readCursors(options.db)).pull;
  let appliedRows = 0;
  let appliedDeletes = 0;
  let skipped = 0;
  const conflicts: SyncConflict[] = [];
  let serverTime: string | null = null;
  let truncated = false;

  const pages = options.maxPages ?? DEFAULT_MAX_PAGES;
  for (let page = 0; page < pages; page += 1) {
    const requestRows: Partial<Record<SyncTableName, string>> = {};
    for (const spec of SYNC_TABLES) {
      requestRows[spec.name] = rewindCursor(cursors.rows[spec.name] ?? "");
    }
    // biome-ignore lint/performance/noAwaitInLoops: pages are fetched one at a time so the cursor advances exactly one server page per request
    const response = await request<SyncPullResponse>(options, "/sync/pull", {
      body: {
        cursors: { deleted: rewindCursor(cursors.deleted), rows: requestRows },
        deviceId: options.deviceId,
        // One page per table per request: the Worker applies this to its own
        // per-table scans, so a huge table cannot starve the others.
        limit: options.limit,
        schemaVersion: SCHEMA_VERSION,
      },
      method: "POST",
    });
    ({ serverTime } = response);

    const result = await applyPullResponse(
      options.db,
      response,
      options.preferLocal ? { preferLocal: true } : undefined
    );
    appliedRows += result.appliedRows;
    appliedDeletes += result.appliedDeletes;
    skipped += result.skipped;
    conflicts.push(...result.conflicts);

    const advanced: SyncCursors = {
      deleted: response.deletedCursor ?? cursors.deleted,
      rows: {},
    };
    for (const change of response.tables) {
      if (change.cursor) {
        advanced.rows[change.table] = change.cursor;
      }
    }
    cursors = mergeCursors(cursors, advanced);
    await writePullCursors(options.db, cursors);

    if (!response.hasMore) {
      return {
        appliedDeletes,
        appliedRows,
        conflicts,
        serverTime,
        skipped,
        truncated: false,
      };
    }
    truncated = page === pages - 1;
  }

  return {
    appliedDeletes,
    appliedRows,
    conflicts,
    serverTime,
    skipped,
    truncated,
  };
}

/** Push then pull. Throws `SyncFailure`; the caller decides what to show. */
export async function runSync(
  options: SyncClientOptions
): Promise<SyncRunResult> {
  const push = await pushLocalChanges(options);
  const pull = await pullRemoteChanges(options);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: a Worker older than this client may answer without the field, and a missing count is not a reason to lose the whole result
  const pushSkipped = Object.values(push.response.skipped ?? {}).reduce(
    (total, value) => total + (value ?? 0),
    0
  );
  return {
    appliedDeletes: pull.appliedDeletes,
    appliedRows: pull.appliedRows,
    conflicts: [...push.response.conflicts, ...pull.conflicts],
    moreToPush: push.moreToPush || pull.truncated,
    pushedDeletes: push.pushedDeletes,
    pushedRows: push.pushedRows,
    serverTime: pull.serverTime,
    // Both halves are reported: a push the server skipped and a pull this
    // device skipped are the same silent loss from the operator's seat (§6.7).
    skipped: pull.skipped + pushSkipped,
  };
}
