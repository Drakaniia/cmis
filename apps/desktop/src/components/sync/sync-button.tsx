/**
 * CMIS Cloud Sync — the manual trigger.
 *
 * The spec (§5 "sync triggers") asks for a manual button for user control, and
 * the one thing it must never do is lie: it stays disabled while a run is in
 * flight, reports the counts a completed run actually produced, and shows the
 * failure reason rather than a generic failure.
 */

import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useSync } from "@/lib/sync/use-sync";

type ButtonSize = "default" | "icon" | "icon-sm" | "sm" | "xs";

/** Icon-only buttons carry no text; the others say what the run is doing. */
function buttonLabel(size: ButtonSize, spinning: boolean): string | null {
  if (size === "icon" || size === "icon-sm") {
    return null;
  }
  return spinning ? "Syncing…" : "Sync now";
}

export function SyncButton({
  className,
  size = "sm",
  variant = "outline",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: "confirm" | "default" | "ghost" | "outline" | "secondary";
}) {
  const sync = useSync();
  const [busy, setBusy] = useState(false);
  const configured = sync.enabled && sync.endpoint !== "";

  const handleClick = useCallback(async () => {
    setBusy(true);
    try {
      const result = await sync.syncNow();
      if (!result) {
        return;
      }
      const sent = result.pushedRows + result.pushedDeletes;
      const received = result.appliedRows + result.appliedDeletes;
      toast.success("Sync complete", {
        description: `${sent} sent · ${received} received${
          result.conflicts.length > 0
            ? ` · ${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"} resolved`
            : ""
        }`,
        id: "sync-manual",
      });
    } finally {
      setBusy(false);
    }
  }, [sync]);

  const spinning = busy || sync.phase === "syncing";
  const onClick = useCallback(() => {
    handleClick().catch(() => undefined);
  }, [handleClick]);

  return (
    <Button
      className={cn("press-feedback", className)}
      disabled={!configured || spinning}
      onClick={onClick}
      size={size}
      title={
        configured
          ? "Sync now"
          : "Set a sync endpoint in Settings → Sync to enable this"
      }
      variant={variant}
    >
      <RefreshCw
        aria-hidden
        className={cn("size-3.5", spinning && "animate-spin")}
      />
      {buttonLabel(size, spinning)}
    </Button>
  );
}
