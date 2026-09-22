import { Button } from "@cmis/ui/components/button";
import { TriangleAlert } from "lucide-react";
import { useCallback } from "react";
import { useBackupStatus } from "../hooks/use-backup-status";
import { useBackupActions } from "../hooks/use-daily-backup";

/**
 * Persistent app-wide failure banner (spec F6): rendered at the shell level so
 * it is visible on every page. Dismissed only by a successful backup — there
 * is no close button. Success is silent, so this renders nothing then.
 */
export function BackupWarningBanner() {
  const { ready, status } = useBackupStatus();
  const { retry } = useBackupActions();

  const handleRetry = useCallback(() => {
    retry().catch(() => undefined);
  }, [retry]);

  if (!(ready && status.lastBackupError)) {
    return null;
  }
  return (
    <div
      className="flex items-center gap-3 border-[var(--warning)]/40 border-b bg-[var(--warning)]/10 px-3 py-2"
      role="alert"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">
          Automatic backup failed — this device is unprotected.{" "}
        </span>
        <span className="text-muted-foreground">{status.lastBackupError}</span>
      </p>
      <Button onClick={handleRetry} size="sm" variant="outline">
        Retry
      </Button>
    </div>
  );
}
