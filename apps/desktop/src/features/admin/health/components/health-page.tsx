import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";

import { BACKUP_FILES_KEY } from "@/features/backup/hooks/use-backup-files";
import { useBackupActions } from "@/features/backup/hooks/use-daily-backup";
import { useHealth } from "../hooks/use-health";
import { SYSTEM_HEALTH_KEY, useSystemHealth } from "../hooks/use-system-health";
import type { HealthAction, HealthCardId } from "../types";
import { HealthCard } from "./health-card";

/**
 * CMIS-UI-09 §5 — System Health.
 *
 * A five-card grid with a sparkline and an action row each. Every action runs
 * real SQL and reports what actually happened. There is no pending-sync table
 * and no offline banner: the app writes straight to a local database, so there
 * is no queue and nothing to retry.
 */
export function HealthPage() {
  const navigate = useNavigate();
  const { data: health } = useSystemHealth();
  const { cards, runAction } = useHealth(health?.cards, health?.pendingSyncs);
  const { runManualBackup } = useBackupActions();
  const queryClient = useQueryClient();

  const handleAction = useCallback(
    (id: HealthCardId, action: HealthAction) => {
      if (action.to) {
        // Deep-link to the audit log, pre-filtered to the relevant actions (§6).
        navigate({
          search:
            id === "sync" ? { actions: "sync" } : { preset: "7d", q: "slow" },
          to: action.to,
        });
        return;
      }
      // The backup action performs a real manual backup (backup-restore F5/F9)
      // and reports what actually happened — never a placeholder toast.
      if (action.id === "trigger-backup") {
        runManualBackup()
          .then(
            (info) => {
              toast.success("Backup complete", { description: info.name });
            },
            (error: unknown) => {
              const message =
                error instanceof Error ? error.message : String(error);
              toast.error("Backup failed", { description: message });
            }
          )
          .finally(() => {
            queryClient
              .invalidateQueries({
                queryKey: [SYSTEM_HEALTH_KEY],
              })
              .catch(() => undefined);
            queryClient
              .invalidateQueries({
                queryKey: [BACKUP_FILES_KEY],
              })
              .catch(() => undefined);
          });
        return;
      }
      // Every other action runs real SQL and reports what actually happened —
      // a failed integrity check now says so instead of claiming a pass.
      void (async () => {
        const result = await runAction(id, action.id);
        if (!result) {
          return;
        }
        if (result.ok) {
          toast.success(result.message, { description: result.description });
        } else {
          toast.error(result.message, { description: result.description });
        }
        await queryClient
          .invalidateQueries({ queryKey: [SYSTEM_HEALTH_KEY] })
          .catch(() => undefined);
      })();
    },
    [navigate, queryClient, runAction, runManualBackup]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto pb-6">
        <div className="mx-auto grid w-full max-w-5xl gap-4 px-3 py-4 sm:px-4 min-[900px]:grid-cols-2">
          {cards.map((card) => (
            <HealthCard
              card={card}
              className={
                card.id === "performance" ? "min-[900px]:col-span-2" : undefined
              }
              key={card.id}
              onAction={handleAction}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
