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
  category: string;
  denied_note: string | null;
  denied_reason: string | null;
  id: string;
  /** Added by migration 0009; absent on a build that has not run it yet. */
  item_id?: string | null;
  medicine: string;
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
      category: row.category,
      ...(row.denied_note === null ? {} : { deniedNote: row.denied_note }),
      ...(deniedReason === undefined ? {} : { deniedReason }),
      dispensingRecords: dispensingByRequest.get(row.id) ?? [],
      history: historyByRequest.get(row.id) ?? [],
      id: row.id,
      ...(row.item_id ? { itemId: row.item_id } : { itemId: null }),
      medicine: row.medicine,
      notes: notesByRequest.get(row.id) ?? [],
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

function orderRequests(items: RequestItem[]): RequestItem[] {
  const sorted = [...items].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt)
  );
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

/** Reads the whole queue, or null when there is no desktop database. */
export async function loadRequests(): Promise<RequestItem[] | null> {
  const db = await getDatabase();
  if (!db) {
    return null;
  }
  try {
    const [rows, history, notes, dispensing] = await Promise.all([
      db.select<RequestRow[]>("SELECT * FROM requests"),
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

/** Writes one request and its children. Safe to call repeatedly. */
export async function saveRequest(item: RequestItem): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    return;
  }
  try {
    // 15 columns bind 15 values. `branch` used to be listed here and does not
    // exist on `requests` (it is `audit_log`'s column), which made every write
    // throw "no such column" into the catch below — the board looked saved and
    // lost everything on restart (AF5/F13). Count the columns when adding one:
    // that bug was invisible for exactly this reason. `item_id` (migration 0009)
    // is the stable link that survives a rename — history no longer detaches
    // when the display name changes (AF13).
    const withItemId = async () =>
      db.execute(
        `INSERT INTO requests (
           id, requestor_name, requestor_id, requestor_email, medicine, category,
           qty, unit, reason, status, submitted_at, denied_reason, denied_note,
           source, item_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           qty = excluded.qty,
           denied_reason = excluded.denied_reason,
           denied_note = excluded.denied_note,
           source = excluded.source,
           item_id = excluded.item_id`,
        [
          item.id,
          item.requestor.name,
          item.requestor.id,
          item.requestor.email,
          item.medicine,
          item.category,
          item.qty,
          item.unit,
          item.reason,
          item.status,
          item.submittedAt,
          item.deniedReason ?? null,
          item.deniedNote ?? null,
          item.source,
          item.itemId ?? null,
        ]
      );

    try {
      await withItemId();
    } catch (error) {
      // Graceful downgrade: a build that has not yet run migration 0009 has no
      // `item_id` column — retry without it rather than losing the whole board.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("item_id") && message.includes("no such column")) {
        console.warn(
          "[persistence] requests.item_id missing — saving without link (run migration 0009)"
        );
        await db.execute(
          `INSERT INTO requests (
             id, requestor_name, requestor_id, requestor_email, medicine, category,
             qty, unit, reason, status, submitted_at, denied_reason, denied_note,
             source
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             qty = excluded.qty,
             denied_reason = excluded.denied_reason,
             denied_note = excluded.denied_note,
             source = excluded.source`,
          [
            item.id,
            item.requestor.name,
            item.requestor.id,
            item.requestor.email,
            item.medicine,
            item.category,
            item.qty,
            item.unit,
            item.reason,
            item.status,
            item.submittedAt,
            item.deniedReason ?? null,
            item.deniedNote ?? null,
            item.source,
          ]
        );
      } else {
        throw error;
      }
    }

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
