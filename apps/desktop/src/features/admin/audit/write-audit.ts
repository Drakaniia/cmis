import { getOperatorName } from "./operator";
import type { AuditActionType } from "./types";

/**
 * The single insert every audit producer calls (spec §11.3).
 *
 * Atomicity is deliberately asymmetric:
 * - creation and deletion pass no options, so a failed audit write throws and
 *   the surrounding commit rolls back with its data write — a deletion can
 *   never exist without its audit row;
 * - the instrumented pre-existing operations pass `bestEffort`, so a broken log
 *   warns the operator instead of losing their stock-in.
 */

export interface AuditDb {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
}

export interface AuditEntry {
  /** `stock-in` | `stock-out` | `request` | `dispense` | `user` | `settings` | `sync` | `correction` */
  action: AuditActionType;
  /** Overrides the Settings → Operator name resolution. */
  actor?: string;
  /** Full state after the change, for the expanded diff. */
  after?: Record<string, unknown>;
  at?: string;
  /** Full state before the change, for the expanded diff. */
  before?: Record<string, unknown>;
  branch?: string;
  /** Set on a correction row — the original log id. */
  correctionOf?: string | null;
  /** Truncated one-line brief shown in the table. */
  detail: string;
  /** Required on correction rows. */
  reason?: string | null;
  /** Linked request / dispensing id. */
  requestRef?: string | null;
  targetId?: string | null;
  targetKind?: "item" | "batch" | "request" | "settings" | null;
}

const INSERT_AUDIT_SQL =
  "INSERT INTO audit_log (id, at, action, actor, branch, detail, target_kind, target_id, before_json, after_json, reason, request_ref, correction_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

export function newAuditId(now: number = Date.now()): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === "function") {
    return uuid.call(globalThis.crypto);
  }
  return `AUD-${now.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function jsonOrNull(value: Record<string, unknown> | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function auditParams(entry: AuditEntry, id: string): unknown[] {
  return [
    id,
    entry.at ?? new Date().toISOString(),
    entry.action,
    entry.actor ?? getOperatorName(),
    entry.branch ?? "local",
    entry.detail,
    entry.targetKind ?? null,
    entry.targetId ?? null,
    jsonOrNull(entry.before),
    jsonOrNull(entry.after),
    entry.reason ?? null,
    entry.requestRef ?? null,
    entry.correctionOf ?? null,
  ];
}

export interface AuditWriteResult {
  /** The id the row (would have) used, so a caller can expand it. */
  id: string;
  /** Whether the row landed — always `true` unless `bestEffort` swallowed a failure. */
  ok: boolean;
}

/**
 * Appends one row. Throws by default (atomic callers rely on that), reports
 * `ok: false` instead when `bestEffort` is set — the caller owns the warning.
 */
export async function recordAudit(
  db: AuditDb,
  entry: AuditEntry,
  opts: { bestEffort?: boolean } = {}
): Promise<AuditWriteResult> {
  const id = newAuditId();
  try {
    await db.execute(INSERT_AUDIT_SQL, auditParams(entry, id));
    return { id, ok: true };
  } catch (error) {
    if (opts.bestEffort) {
      return { id, ok: false };
    }
    throw error;
  }
}
