import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { BACKUP_FILES_KEY } from "@/features/backup/hooks/use-backup-files";
import { useBackupActions } from "@/features/backup/hooks/use-daily-backup";
import { HealthCard } from "../../health/components/health-card";
import { useHealth } from "../../health/hooks/use-health";
import {
  SYSTEM_HEALTH_KEY,
  useSystemHealth,
} from "../../health/hooks/use-system-health";
import type { HealthAction, HealthCardId } from "../../health/types";
import { SettingsCard } from "./settings-card";

/**
 * Settings tab — System Health.
 * A simplified grid of health cards without the full-page chrome. Every action
 * runs real SQL and reports the real outcome; there is no pending-sync table
 * because the app has no sync queue.
 */
export function HealthTab() {
  const { data: health } = useSystemHealth();
  const { cards, runAction } = useHealth(health?.cards, health?.pendingSyncs);
  const { runManualBackup } = useBackupActions();
  const queryClient = useQueryClient();

  const handleAction = useCallback(
    (id: HealthCardId, action: HealthAction) => {
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
      runAction(id, action.id)
        .then((result) => {
          if (!result) {
            return;
          }
          if (result.ok) {
            toast.success(result.message, { description: result.description });
          } else {
            toast.error(result.message, { description: result.description });
          }
        })
        .finally(() => {
          queryClient
            .invalidateQueries({ queryKey: [SYSTEM_HEALTH_KEY] })
            .catch(() => undefined);
        });
    },
    [queryClient, runAction, runManualBackup]
  );

  return (
    <div className="space-y-4">
      <SettingsCard
        description="Database, storage, backup and performance — at a glance, with the action to fix each."
        title="System Health"
      >
        <div className="grid gap-4 min-[600px]:grid-cols-2">
          {cards.map((card) => (
            <HealthCard
              card={card}
              className={
                card.id === "performance" ? "min-[600px]:col-span-2" : undefined
              }
              key={card.id}
              onAction={handleAction}
            />
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
