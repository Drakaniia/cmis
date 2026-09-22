/**
 * CMIS-UI-05 §8 — SQLite persistence for the request queue.
 *
 * Loaded through `tauri-plugin-sql` so the board survives a restart. Every call
 * degrades to a no-op outside the desktop shell (browser dev, SSR, tests), which
 * keeps the in-memory board usable everywhere — the same opportunistic pattern
 * `use-density` uses for the Tauri store.
 *
 * Children (history, notes, dispensing) are written by replacing a request's
 * rows rather than diffing them: the arrays are tiny, the write is idempotent,
 * and an audit trail that can silently drift out of sync is worse than one that
 * is rewritten whole.
 */

// The plugin exports its class as the default; the dynamic import below pulls
// the same shape at runtime so the module stays inert on the web.
import type Database from "@tauri-apps/plugin-sql";
import { baseUnitFor } from "@/features/inventory/domain/pack-size";
import type {
  DenyReason,
  DispensingRecord,
  InternalNote,
  RequestItem,
  Requestor,
  RequestSource,
  RequestStatus,
  StatusHistoryEntry,
} from "./types";
import { REQUEST_COLUMNS } from "./types";

let databasePromise: Promise<Database | null> | null = null;

/** Opens the database once; returns null when the desktop shell is absent. Delegates to shared singleton. */
function getDatabase(): Promise<Database | null> {
  databasePromise ??= (async () => {
    try {
      const { getDb } = await import("@/lib/db");
      return (await getDb()) as unknown as Database;
    } catch {
      return null;
    }
  })();
  return databasePromise;
}

interface RequestRow {
  /** Added by migration 0011; absent on a build that has not run it yet. */
  archived_at?: string | null;
  /** Added by migration 0011; absent on a build that has not run it yet. */
  board_position?: number | null;
  category: string;
  denied_note: string | null;
  denied_reason: string | null;
  id: string;
  /** Added by migration 0009; absent on a build that has not run it yet. */
  item_id?: string | null;
  medicine: string;
  /** Joined pack context, for the mixed render `2 box (20 sachet)` (F8). */
  pack_form?: string | null;
  pack_qty?: number | null;
  pack_unit?: string | null;
  qty: number;
  reason: string;
  requestor_email: string;
  requestor_id: string;
  requestor_name: string;
  /** Added by migration 0008; absent on a build that has not run it yet. */
  source?: string | null;
  status: string;
  submitted_at: string;
  unit: string;
}

interface HistoryRow {
  actor: string;
  at: string;
  from_status: string | null;
  note: string | null;
  request_id: string;
  to_status: string;
}

interface NoteRow {
  at: string;
  author: string;
  request_id: string;
  text: string;
}

interface DispensingRow {
  at: string;
  batch: string;
  expiry: string;
  qty: number;
  request_id: string;
  staff: string;
}

const STATUSES = new Set<RequestStatus>([
  "approved",
  "claimed",
  "denied",
  "pending",
  "ready",
]);

const DENY_REASONS = new Set<DenyReason>([
  "Duplicate Request",
  "Not Available",
  "Out of Stock",
  "Other",
]);

/** Stored values are untrusted strings; narrow rather than cast. */
function toStatus(value: string): RequestStatus {
  return STATUSES.has(value as RequestStatus)
    ? (value as RequestStatus)
    : "pending";
}

function toDenyReason(value: string | null): DenyReason | undefined {
  if (value === null) {
    return undefined;
  }
  return DENY_REASONS.has(value as DenyReason)
    ? (value as DenyReason)
    : undefined;
}

/**
 * The joined pack pair, attached only when it is usable for a conversion so the
 * render helper falls back to the request's own text for an unpacked item
 * (pack-size F1 `hasPack`).
 */
function packContextOf(row: RequestRow): {
  baseUnit?: string;
  packQty?: number;
  packUnit?: string;
} {
  const packQty = row.pack_qty ?? 0;
  const packUnit = (row.pack_unit ?? "").trim();
  if (packQty <= 1 || packUnit === "") {
    return {};
  }
  return {
    baseUnit: baseUnitFor({ form: row.pack_form ?? "" }),
    packQty,
    packUnit,
  };
}

/**
 * Unknown stored values fall back to `queue`, the column default — a value this
 * build does not know about must never be read as a quick deduction.
 */
function toSource(value: string | null | undefined): RequestSource {
  return value === "quick-deduct" ? "quick-deduct" : "queue";
}

function assemble(
  rows: RequestRow[],
  history: HistoryRow[],
  notes: NoteRow[],
  dispensing: DispensingRow[]
): RequestItem[] {
  const historyByRequest = new Map<string, StatusHistoryEntry[]>();
  for (const row of history) {
    const list = historyByRequest.get(row.request_id) ?? [];
    list.push({
      at: row.at,
      by: row.actor,
      from: row.from_status === null ? null : toStatus(row.from_status),
      ...(row.note === null ? {} : { note: row.note }),
      to: toStatus(row.to_status),
    });
    historyByRequest.set(row.request_id, list);
  }

  const notesByRequest = new Map<string, InternalNote[]>();
  for (const row of notes) {
    const list = notesByRequest.get(row.request_id) ?? [];
    list.push({ at: row.at, author: row.author, text: row.text });
    notesByRequest.set(row.request_id, list);
  }

  const dispensingByRequest = new Map<string, DispensingRecord[]>();
  for (const row of dispensing) {
    const list = dispensingByRequest.get(row.request_id) ?? [];
    list.push({
      at: row.at,
      batch: row.batch,
      expiry: row.expiry,
      qty: row.qty,
      staff: row.staff,
    });
    dispensingByRequest.set(row.request_id, list);
  }

  return rows.map((row) => {
    const requestor: Requestor = {
      email: row.requestor_email,
      id: row.requestor_id,
      name: row.requestor_name,
    };
    const deniedReason = toDenyReason(row.denied_reason);
    return {
      archivedAt: row.archived_at ?? null,
      boardPosition: row.board_position ?? 0,
      category: row.category,
      ...(row.denied_note === null ? {} : { deniedNote: row.denied_note }),
      ...(deniedReason === undefined ? {} : { deniedReason }),
      dispensingRecords: dispensingByRequest.get(row.id) ?? [],
      history: historyByRequest.get(row.id) ?? [],
      id: row.id,
      ...(row.item_id ? { itemId: row.item_id } : { itemId: null }),
      medicine: row.medicine,
      notes: notesByRequest.get(row.id) ?? [],
      ...packContextOf(row),
      qty: row.qty,
      reason: row.reason,
      requestor,
      source: toSource(row.source),
      status: toStatus(row.status),
      submittedAt: row.submitted_at,
      unit: row.unit,
    };
  });
}

/** Lane order, so a flat array read from disk groups the way the board draws. */
const LANE_ORDER = new Map<RequestStatus, number>(
  REQUEST_COLUMNS.map((column, index) => [column.status, index])
);

/**
 * Lane index → manual position (`board_position ASC`) → newest → id. The
 * position is the durable order a drop writes (§7); the tie-breaks keep a
 * freshly migrated row and a newly created card deterministic.
 */
function orderRequests(items: RequestItem[]): RequestItem[] {
  const sorted = [...items].sort((a, b) => {
    const lane =
      (LANE_ORDER.get(a.status) ?? 0) - (LANE_ORDER.get(b.status) ?? 0);
    if (lane !== 0) {
      return lane;
    }
    if (a.boardPosition !== b.boardPosition) {
      return a.boardPosition - b.boardPosition;
    }
    const submitted = b.submittedAt.localeCompare(a.submittedAt);
    if (submitted !== 0) {
      return submitted;
    }
    return a.id.localeCompare(b.id);
  });
  for (const item of sorted) {
    item.history.sort((a, b) => a.at.localeCompare(b.at));
    item.notes.sort((a, b) => a.at.localeCompare(b.at));
    item.dispensingRecords.sort((a, b) => a.at.localeCompare(b.at));
  }
  return sorted;
}

/**
 * Announces that `requests` changed on disk, so an already-mounted board can
 * re-read it. Creating a request from another screen (or dispensing one) writes
 * through SQLite without going through the board's own state, and the board
 * hydrates once per mount — this is the one thing that closes that gap.
 */
export const REQUESTS_CHANGED_EVENT = "cmis:requests-changed";

export function notifyRequestsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(REQUESTS_CHANGED_EVENT));
}

/**
 * Every stored request id. The ID generator scans these for the current year's
 * high-water mark, so the sequence survives a restart (F4).
 */
export async function loadRequestIds(): Promise<string[]> {
  const db = await getDatabase();
  if (!db) {
    return [];
  }
  try {
    const rows = await db.select<{ id: string }[]>("SELECT id FROM requests");
    return rows.map((row) => row.id);
  } catch (error) {
    console.error("[persistence] loadRequestIds failed", error);
    return [];
  }
}

/**
 * Deletes a request outright. `request_history`, `request_notes` and every
 * `dispensing_records` row follow through the `ON DELETE CASCADE` declared in
 * migration 0001. Cancel (F6) is deliberately destructive — there is no trash
 * record for a request.
 */
export async function deleteRequest(id: string): Promise<boolean> {
  const db = await getDatabase();
  if (!db) {
    return false;
  }
  try {
    await db.execute("DELETE FROM requests WHERE id = $1", [id]);
    return true;
  } catch (error) {
    console.error("[persistence] deleteRequest failed", error);
    return false;
  }
}

/**
 * The explicit archive marker (migration 0011, F9): clearing the Claimed lane
 * stamps `archived_at` so the cards leave the board while their records stay
 * exactly where they are. Returns false when there is no database, so the caller
 * can report an honest failure instead of a removal that never happened.
 */
export async function archiveRequests(
  ids: readonly string[],
  at = new Date().toISOString()
): Promise<boolean> {
  const db = await getDatabase();
  if (!db) {
    return false;
  }
  if (ids.length === 0) {
    return true;
  }
  try {
    const placeholders = ids.map((_, index) => `$${index + 2}`).join(", ");
    await db.execute(
      `UPDATE requests SET archived_at = $1 WHERE id IN (${placeholders})`,
      [at, ...ids]
    );
    return true;
  } catch (error) {
    console.error("[persistence] archiveRequests failed", error);
    return false;
  }
}

/** Reads the whole queue, or null when there is no desktop database. */
export async function loadRequests(): Promise<RequestItem[] | null> {
  const db = await getDatabase();
  if (!db) {
    return null;
  }
  try {
    const [rows, history, notes, dispensing] = await Promise.all([
      db.select<RequestRow[]>(
        // The pack pair is joined in so the board can render `2 box (20 sachet)`
        // without a second query per card (pack-size F8). A request with no
        // `item_id` (pre-0009) simply gets nulls and falls back to its text.
        `SELECT requests.*, inventory_items.form AS pack_form,
                inventory_items.pack_qty AS pack_qty, inventory_items.pack_unit AS pack_unit
           FROM requests
           LEFT JOIN inventory_items ON inventory_items.id = requests.item_id`
      ),
      db.select<HistoryRow[]>("SELECT * FROM request_history"),
      db.select<NoteRow[]>("SELECT * FROM request_notes"),
      db.select<DispensingRow[]>("SELECT * FROM dispensing_records"),
    ]);
    return orderRequests(assemble(rows, history, notes, dispensing));
  } catch (error) {
    console.error("[persistence] loadRequests failed", error);
    return null;
  }
}

/**
 * Every column `requests` has ever had, in bind order.
 *
 * The list used to be hand-written in the INSERT and had to be kept in step
 * with a matching `$n` count — which is exactly the class of bug that silently
 * lost the whole board when `branch` was listed on a table that does not have it
 * (AF5/F13). Now the live column set is read once and the statement is built
 * from what actually exists, so adding a column (0011's `board_position` and
 * `archived_at`) can never unbalance a bind count again.
 */
const REQUEST_COLUMNS_IN_ORDER = [
  "id",
  "requestor_name",
  "requestor_id",
  "requestor_email",
  "medicine",
  "category",
  "qty",
  "unit",
  "reason",
  "status",
  "submitted_at",
  "denied_reason",
  "denied_note",
  "source",
  "item_id",
  "board_position",
  "archived_at",
] as const;

/**
 * Refreshed on upsert, mirroring the previous `ON CONFLICT` list plus the two
 * 0011 columns. A request's identity and its submission facts never change, so
 * they are not in the update set.
 */
const MUTABLE_REQUEST_COLUMNS = new Set<string>([
  "archived_at",
  "board_position",
  "denied_note",
  "denied_reason",
  "item_id",
  "qty",
  "source",
  "status",
]);

let columnCache: Set<string> | null = null;

/** A statement that named a column this database does not have. */
const MISSING_COLUMN_RE = /no such column:\s*(\w+)/;

const MAX_COLUMN_FALLBACKS = 3;

/**
 * The live column set, read once. A build that has not run a migration yet is
 * still writable: an unknown column simply is not in the statement.
 */
async function requestColumns(db: Database): Promise<Set<string>> {
  if (columnCache) {
    return columnCache;
  }
  try {
    const rows = await db.select<{ name: string }[]>(
      "PRAGMA table_info(requests)"
    );
    columnCache = new Set(rows.map((row) => row.name));
  } catch (error) {
    console.warn("[persistence] PRAGMA table_info(requests) failed", error);
    columnCache = new Set(REQUEST_COLUMNS_IN_ORDER);
  }
  return columnCache;
}

function missingColumnOf(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return MISSING_COLUMN_RE.exec(message)?.[1] ?? null;
}

/**
 * Writes one upsert, dropping any column this database does not have yet and
 * trying again. Recursive rather than a loop so the fallback is explicit and
 * bounded: a cache warmed before a migration shipped cannot silently lose the
 * board (the AF5/F13 class of bug).
 */
async function executeRequestUpsert(
  db: Database,
  item: RequestItem,
  columns: Set<string>,
  attemptsLeft = MAX_COLUMN_FALLBACKS
): Promise<void> {
  const { params, sql } = buildRequestUpsert(columns, item);
  try {
    await db.execute(sql, params);
  } catch (error) {
    const missing = missingColumnOf(error);
    if (!(missing && columns.has(missing)) || attemptsLeft <= 1) {
      throw error;
    }
    console.warn(
      `[persistence] requests.${missing} missing — saving without it (run the migration)`
    );
    const next = new Set(columns);
    next.delete(missing);
    columnCache = next;
    await executeRequestUpsert(db, item, next, attemptsLeft - 1);
  }
}

function requestValues(item: RequestItem): Record<string, unknown> {
  return {
    archived_at: item.archivedAt ?? null,
    board_position: item.boardPosition,
    category: item.category,
    denied_note: item.deniedNote ?? null,
    denied_reason: item.deniedReason ?? null,
    id: item.id,
    item_id: item.itemId ?? null,
    medicine: item.medicine,
    qty: item.qty,
    reason: item.reason,
    requestor_email: item.requestor.email,
    requestor_id: item.requestor.id,
    requestor_name: item.requestor.name,
    source: item.source,
    status: item.status,
    submitted_at: item.submittedAt,
    unit: item.unit,
  };
}

/** Builds the upsert from the columns that actually exist on this database. */
function buildRequestUpsert(
  columns: Set<string>,
  item: RequestItem
): { params: unknown[]; sql: string } {
  const present = REQUEST_COLUMNS_IN_ORDER.filter((column) =>
    columns.has(column)
  );
  const values = requestValues(item);
  const params = present.map((column) => values[column]);
  const placeholders = present.map((_, index) => `$${index + 1}`).join(", ");
  const updates = present
    .filter((column) => MUTABLE_REQUEST_COLUMNS.has(column))
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  const conflict =
    updates === "" ? "" : ` ON CONFLICT(id) DO UPDATE SET ${updates}`;
  return {
    params,
    sql: `INSERT INTO requests (${present.join(", ")}) VALUES (${placeholders})${conflict}`,
  };
}

/** Writes one request and its children. Safe to call repeatedly. */
export async function saveRequest(item: RequestItem): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    return;
  }
  try {
    await executeRequestUpsert(db, item, await requestColumns(db));

    await db.execute("DELETE FROM request_history WHERE request_id = $1", [
      item.id,
    ]);
    await Promise.all(
      item.history.map((entry) =>
        db.execute(
          `INSERT INTO request_history
             (request_id, at, actor, from_status, to_status, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            item.id,
            entry.at,
            entry.by,
            entry.from,
            entry.to,
            entry.note ?? null,
          ]
        )
      )
    );

    await db.execute("DELETE FROM request_notes WHERE request_id = $1", [
      item.id,
    ]);
    await Promise.all(
      item.notes.map((note) =>
        db.execute(
          `INSERT INTO request_notes (request_id, at, author, text)
           VALUES ($1, $2, $3, $4)`,
          [item.id, note.at, note.author, note.text]
        )
      )
    );

    // History, notes and dispensing rows are replaced whole rather than diffed:
    // the arrays are tiny, the write is idempotent, and an audit trail that can
    // silently drift out of sync is worse than one that is rewritten. The
    // `ON CONFLICT(request_id)` upsert the single-record design used is gone —
    // migration 0007 keyed the table by its own id, so a request can have many
    // hand-overs and there is no longer a conflict target to name.
    await db.execute("DELETE FROM dispensing_records WHERE request_id = $1", [
      item.id,
    ]);
    await Promise.all(
      item.dispensingRecords.map((record) =>
        db.execute(
          `INSERT INTO dispensing_records (request_id, at, batch, expiry, qty, staff)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            item.id,
            record.at,
            record.batch,
            record.expiry,
            record.qty,
            record.staff,
          ]
        )
      )
    );
  } catch (error) {
    console.error("[persistence] saveRequest failed", error);
    throw error;
  }
}

export async function saveRequests(items: RequestItem[]): Promise<void> {
  await Promise.all(items.map((item) => saveRequest(item)));
}

/** First run: seed the table from the mock so the board is never empty. */
export async function seedRequests(items: RequestItem[]): Promise<void> {
  await saveRequests(items);
}
