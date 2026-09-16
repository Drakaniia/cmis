import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getDb } from "@/lib/db";
import { getOperatorName } from "../operator";
import type { AuditRow } from "../types";
import { recordAudit } from "../write-audit";
import { AUDIT_LOG_QUERY_KEY } from "./use-audit-log";

/**
 * CMIS-UI-09 §3.4 — the one correction flow, shared by the Audit page and the
 * Settings → Audit Logs tab.
 *
 * A correction is written to `audit_log`, not appended to component state: the
 * original row stays intact and the new one links back through `correction_of`,
 * which is the append-only contract the table already states. Because both
 * surfaces read the same query key, the append appears in either one.
 */
export function useAuditCorrection({
  onWritten,
}: {
  /** Called with the new row's id so the caller can expand it. */
  onWritten?: (id: string) => void;
} = {}) {
  const queryClient = useQueryClient();
  const [correctionRow, setCorrectionRow] = useState<AuditRow | null>(null);

  const submit = useCallback(
    async (payload: { corrected: Record<string, string>; reason: string }) => {
      if (!correctionRow) {
        return;
      }
      const actor = getOperatorName();
      try {
        const db = await getDb();
        const written = await recordAudit(db, {
          action: "correction",
          after: payload.corrected,
          before: { ...correctionRow.after },
          branch: correctionRow.branch,
          correctionOf: correctionRow.id,
          detail: `Correction of [${correctionRow.id}] by ${actor}: ${payload.reason}`,
          reason: payload.reason,
        });
        await queryClient.invalidateQueries({
          queryKey: [AUDIT_LOG_QUERY_KEY],
        });
        onWritten?.(written.id);
        setCorrectionRow(null);
        toast.success("Correction appended", {
          description: `Original ${correctionRow.id} stays intact.`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Correction failed"
        );
      }
    },
    [correctionRow, onWritten, queryClient]
  );

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setCorrectionRow(null);
    }
  }, []);

  return {
    correctionRow,
    handleOpenChange,
    open: correctionRow !== null,
    setCorrectionRow,
    submit,
  } as const;
}
