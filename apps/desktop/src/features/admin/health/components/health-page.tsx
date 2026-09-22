import { Button } from "@cmis/ui/components/button";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { BACKUP_FILES_KEY } from "@/features/backup/hooks/use-backup-files";
import { useBackupActions } from "@/features/backup/hooks/use-daily-backup";
import { relativeTime } from "../../format";
import { useHealth } from "../hooks/use-health";
import { SYSTEM_HEALTH_KEY, useSystemHealth } from "../hooks/use-system-health";
import type { HealthAction, HealthCardId } from "../types";
import { HealthCard } from "./health-card";

/**
 * CMIS-UI-09 §5 — System Health.
 *
 * A five-card grid with a sparkline and an action row each; sync gets the
 * detailed pending table. Offline dims every non-sync card to signal that the
 * numbers shown are local cache, not server truth (§5.4).
 */
export function HealthPage() {
  const navigate = useNavigate();
  const { data: health } = useSystemHealth();
  const { cards, online, pendingSyncs, runAction } = useHealth(
    health?.cards,
    health?.pendingSyncs
  );
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
        void runManualBackup().then(
          (info) => {
            toast.success("Backup complete", { description: info.name });
          },
          (error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            toast.error("Backup failed", { description: message });
          }
        ).finally(() => {
          void queryClient.invalidateQueries({
            queryKey: [SYSTEM_HEALTH_KEY],
          });
          void queryClient.invalidateQueries({ queryKey: [BACKUP_FILES_KEY] });
        });
        return;
      }
      const result = runAction(id, action.id);
      if (result) {
        toast.success(result.message, { description: result.description });
      }
    },
    [navigate, queryClient, runAction, runManualBackup]
  );

  const handleViewSyncErrors = useCallback(
    () =>
      navigate({
        search: { actions: "sync", preset: "7d" },
        to: "/admin/audit",
      }),
    [navigate]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto pb-6">
        <div className="mx-auto grid w-full max-w-5xl gap-4 px-3 py-4 sm:px-4 min-[900px]:grid-cols-2">
          {cards.map((card) => {
            const isSync = card.id === "sync";
            return (
              <HealthCard
                card={card}
                className={
                  card.id === "performance"
                    ? "min-[900px]:col-span-2"
                    : undefined
                }
                dimmed={!(online || isSync)}
                key={card.id}
                onAction={handleAction}
              >
                {isSync ? (
                  <div className="mt-3">
                    {online ? null : (
                      <p className="mb-2 rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-2.5 py-1.5 text-caption text-foreground">
                        Offline — changes are queuing locally.
                      </p>
                    )}
                    <div className="overflow-hidden rounded-md border border-border/60">
                      <div className="grid grid-cols-[0.9fr_0.7fr_1.6fr_0.7fr] items-center gap-2 border-border/50 border-b bg-muted/60 px-2.5 py-1 font-medium text-caption text-muted-foreground">
                        <span>Record</span>
                        <span>Queued</span>
                        <span>Location</span>
                        <span className="text-right">Attempts</span>
                      </div>
                      {pendingSyncs.length === 0 ? (
                        <p className="px-2.5 py-3 text-center text-caption text-muted-foreground">
                          Nothing pending — all synced.
                        </p>
                      ) : (
                        pendingSyncs.map((item) => (
                          <div
                            className="grid grid-cols-[0.9fr_0.7fr_1.6fr_0.7fr] items-center gap-2 border-border/50 border-b px-2.5 py-1.5 text-caption last:border-b-0"
                            key={item.id}
                          >
                            <span className="truncate">{item.record}</span>
                            <span className="text-muted-foreground">
                              {relativeTime(item.queuedAt)}
                            </span>
                            <span className="truncate text-muted-foreground">
                              {item.branch}
                            </span>
                            <span className="text-right">{item.attempts}</span>
                            {item.error ? (
                              <span className="col-span-4 truncate text-destructive">
                                {item.error}
                              </span>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                    {pendingSyncs.some((item) => item.error) ? (
                      <Button
                        className="press-feedback mt-2"
                        onClick={handleViewSyncErrors}
                        size="xs"
                        variant="ghost"
                      >
                        View sync errors
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </HealthCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
