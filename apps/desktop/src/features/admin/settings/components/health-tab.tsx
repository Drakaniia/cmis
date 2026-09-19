import { useCallback } from "react";
import { toast } from "sonner";

import { relativeTime } from "../../format";
import { HealthCard } from "../../health/components/health-card";
import { useHealth } from "../../health/hooks/use-health";
import { useSystemHealth } from "../../health/hooks/use-system-health";
import type { HealthAction, HealthCardId } from "../../health/types";
import { SettingsCard } from "./settings-card";

/**
 * Settings tab — System Health.
 * A simplified grid of health cards without the full-page chrome.
 */
export function HealthTab() {
  const { data: health } = useSystemHealth();
  const { cards, online, pendingSyncs, runAction } = useHealth(
    health?.cards,
    health?.pendingSyncs
  );

  const handleAction = useCallback(
    (id: HealthCardId, action: HealthAction) => {
      const result = runAction(id, action.id);
      if (result) {
        toast.success(result.message, { description: result.description });
      }
    },
    [runAction]
  );

  return (
    <div className="space-y-4">
      <SettingsCard
        description="Database, storage, sync, backup and performance — at a glance, with the action to fix each."
        title="System Health"
      >
        <div className="grid gap-4 min-[600px]:grid-cols-2">
          {cards.map((card) => {
            const isSync = card.id === "sync";
            return (
              <HealthCard
                card={card}
                className={
                  card.id === "performance"
                    ? "min-[600px]:col-span-2"
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
                      <div className="grid grid-cols-[0.9fr_0.7fr_0.7fr] items-center gap-2 border-border/50 border-b bg-muted/60 px-2.5 py-1 font-medium text-caption text-muted-foreground">
                        <span>Record</span>
                        <span>Queued</span>
                        <span className="text-right">Attempts</span>
                      </div>
                      {pendingSyncs.length === 0 ? (
                        <p className="px-2.5 py-3 text-center text-caption text-muted-foreground">
                          Nothing pending — all synced.
                        </p>
                      ) : (
                        pendingSyncs.map((item) => (
                          <div
                            className="grid grid-cols-[0.9fr_0.7fr_0.7fr] items-center gap-2 border-border/50 border-b px-2.5 py-1.5 text-caption last:border-b-0"
                            key={item.id}
                          >
                            <span className="truncate">{item.record}</span>
                            <span className="text-muted-foreground">
                              {relativeTime(item.queuedAt)}
                            </span>
                            <span className="text-right">{item.attempts}</span>
                            {item.error ? (
                              <span className="col-span-3 truncate text-destructive">
                                {item.error}
                              </span>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </HealthCard>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
}
