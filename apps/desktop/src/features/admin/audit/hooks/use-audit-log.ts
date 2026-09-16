import { useQuery } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import { type AuditRow, isAuditActionType } from "../types";

/**
 * CMIS-UI-09 §3 — the read path for the append-only `audit_log` (spec §11.3).
 *
 * The mapping is column-for-column onto the existing `AuditRow` shape, so
 * `filterAuditRows`, the table, the row detail and the CSV export all keep
 * working unchanged. `corrected` is derived, never stored: a row is corrected
 * once some later row points at it through `correction_of`.
 */

export const AUDIT_LOG_QUERY_KEY = "audit_log";

/** Newest first, capped so a clinic-scale log never renders unbounded. */
const AUDIT_LOG_LIMIT = 1000;

interface AuditLogRow {
  action: string;
  actor: string;
  after_json: string | null;
  at: string;
  before_json: string | null;
  branch: string;
  corrected: number;
  correction_of: string | null;
  detail: string;
  id: string;
  reason: string | null;
  request_ref: string | null;
}

function parseJson(value: string | null): Record<string, unknown> | undefined {
  if (value === null || value === "") {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed snapshot must not take the audit page down with it.
  }
}

/** Unknown or future action values degrade to `correction` rather than crash. */
function toAction(value: string): AuditRow["action"] {
  return isAuditActionType(value) ? value : "correction";
}

export function mapAuditLogRow(row: AuditLogRow): AuditRow {
  return {
    action: toAction(row.action),
    ...(parseJson(row.after_json) ? { after: parseJson(row.after_json) } : {}),
    at: row.at,
    ...(parseJson(row.before_json)
      ? { before: parseJson(row.before_json) }
      : {}),
    branch: row.branch,
    ...(row.corrected ? { corrected: true } : {}),
    ...(row.correction_of ? { correctionOf: row.correction_of } : {}),
    detail: row.detail,
    id: row.id,
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.request_ref ? { requestRef: row.request_ref } : {}),
    user: row.actor,
  };
}

export function useAuditLog() {
  return useQuery({
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<AuditRow[]> => {
      const db = await getDb();
      const rows = await db.select<AuditLogRow[]>(
        `SELECT a.id, a.at, a.action, a.actor, a.branch, a.detail, a.before_json, a.after_json, a.reason, a.request_ref, a.correction_of,
                EXISTS (SELECT 1 FROM audit_log c WHERE c.correction_of = a.id) AS corrected
         FROM audit_log a
         ORDER BY a.at DESC
         LIMIT ${AUDIT_LOG_LIMIT}`
      );
      return rows.map(mapAuditLogRow);
    },
    queryKey: [AUDIT_LOG_QUERY_KEY],
    retry: false,
    staleTime: 10_000,
  });
}
