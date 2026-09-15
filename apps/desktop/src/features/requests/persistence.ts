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
  medicine: string;
  qty: number;
  reason: string;
  requestor_email: string;
  requestor_id: string;
  requestor_name: string;
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

  const dispensingByRequest = new Map<string, DispensingRecord>();
  for (const row of dispensing) {
    dispensingByRequest.set(row.request_id, {
      at: row.at,
      batch: row.batch,
      expiry: row.expiry,
      qty: row.qty,
      staff: row.staff,
    });
  }

  return rows.map((row) => {
    const requestor: Requestor = {
      email: row.requestor_email,
      id: row.requestor_id,
      name: row.requestor_name,
    };
    const deniedReason = toDenyReason(row.denied_reason);
    const record = dispensingByRequest.get(row.id);
    return {
      category: row.category,
      ...(row.denied_note === null ? {} : { deniedNote: row.denied_note }),
      ...(deniedReason === undefined ? {} : { deniedReason }),
      ...(record === undefined ? {} : { dispensing: record }),
      history: historyByRequest.get(row.id) ?? [],
      id: row.id,
      medicine: row.medicine,
      notes: notesByRequest.get(row.id) ?? [],
      qty: row.qty,
      reason: row.reason,
      requestor,
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
  }
  return sorted;
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
  } catch {
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
    await db.execute(
      `INSERT INTO requests (
         id, requestor_name, requestor_id, requestor_email, medicine, category,
         qty, unit, reason, branch, status, submitted_at, denied_reason,
         denied_note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         qty = excluded.qty,
         denied_reason = excluded.denied_reason,
         denied_note = excluded.denied_note`,
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
      ]
    );

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

    if (item.dispensing) {
      await db.execute(
        `INSERT INTO dispensing_records (request_id, at, batch, expiry, qty, staff)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(request_id) DO UPDATE SET
           at = excluded.at,
           batch = excluded.batch,
           expiry = excluded.expiry,
           qty = excluded.qty,
           staff = excluded.staff`,
        [
          item.id,
          item.dispensing.at,
          item.dispensing.batch,
          item.dispensing.expiry,
          item.dispensing.qty,
          item.dispensing.staff,
        ]
      );
    }
  } catch {
    // Persistence is best-effort; the board stays usable in memory.
  }
}

export async function saveRequests(items: RequestItem[]): Promise<void> {
  await Promise.all(items.map((item) => saveRequest(item)));
}

/** First run: seed the table from the mock so the board is never empty. */
export async function seedRequests(items: RequestItem[]): Promise<void> {
  await saveRequests(items);
}
