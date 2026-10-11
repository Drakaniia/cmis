/**
 * CMIS Cloud Sync — the manual triggers.
 *
 * Three buttons, one engine each:
 * - Sync now: push-then-pull (steady state).
 * - Push: send local queue only, never pull.
 * - Pull: fetch cloud rows only, never push. Pending local changes stay queued
 *   and merge last-write-wins.
 *
 * Every button stays disabled while a run is in flight, reports the counts a
 * completed run actually produced, and shows the failure reason via the
 * provider toasts rather than a generic failure.
 */

import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useSync } from "@/lib/sync/use-sync";

type ButtonSize = "default" | "icon" | "icon-sm" | "sm" | "xs";

type SyncVariant = "confirm" | "default" | "ghost" | "outline" | "secondary";

interface SyncControlProps {
  className?: string;
  size?: ButtonSize;
  variant?: SyncVariant;
}

/** Icon-only buttons carry no text; the others say what the run is doing. */
function buttonLabel(size: ButtonSize, spinning: boolean): string | null {
  if (size === "icon" || size === "icon-sm") {
    return null;
  }
  return spinning ? "Syncing…" : "Sync now";
}

function oneWayLabel(
  size: ButtonSize,
  spinning: boolean,
  idle: string,
  active: string
): string | null {
  if (size === "icon" || size === "icon-sm") {
    return null;
  }
  if (spinning) {
    return active;
  }
  return idle;
}

function useBusy(): [boolean, (busy: boolean) => void] {
  const [busy, setBusy] = useState(false);
  return [busy, setBusy];
}

export function SyncButton({
  className,
  size = "sm",
  variant = "outline",
}: SyncControlProps) {
  const sync = useSync();
  const [busy, setBusy] = useBusy();
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
  }, [sync, setBusy]);

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
          ? "Push local changes, then pull cloud changes"
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

export function PushButton({
  className,
  size = "sm",
  variant = "outline",
}: SyncControlProps) {
  const sync = useSync();
  const [busy, setBusy] = useBusy();
  const configured = sync.enabled && sync.endpoint !== "";
  const spinning = busy || sync.phase === "syncing";

  const onClick = useCallback(() => {
    setBusy(true);
    sync
      .pushNow()
      .then((result) => {
        if (!result) {
          return;
        }
        const sent = result.pushedRows + result.pushedDeletes;
        toast.success("Push complete", {
          description: `${sent} sent${result.moreToPush ? " · more waiting" : ""}${
            result.conflicts.length > 0
              ? ` · ${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"} resolved`
              : ""
          }`,
          id: "sync-push",
        });
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, [sync, setBusy]);

  const label = oneWayLabel(size, spinning, "Push", "Pushing…");

  return (
    <Button
      className={cn("press-feedback", className)}
      disabled={!configured || spinning}
      onClick={onClick}
      size={size}
      title={
        configured
          ? "Send local changes to the cloud (no download)"
          : "Set a sync endpoint in Settings → Sync to enable this"
      }
      variant={variant}
    >
      <ArrowUpFromLine aria-hidden className="size-3.5" />
      {label}
    </Button>
  );
}

export function PullButton({
  className,
  size = "sm",
  variant = "outline",
}: SyncControlProps) {
  const sync = useSync();
  const [busy, setBusy] = useBusy();
  const configured = sync.enabled && sync.endpoint !== "";
  const spinning = busy || sync.phase === "syncing";

  const onClick = useCallback(() => {
    setBusy(true);
    sync
      .pullNow()
      .then((result) => {
        if (!result) {
          return;
        }
        const received = result.appliedRows + result.appliedDeletes;
        toast.success("Pull complete", {
          description: `${received} received · local changes kept${
            result.conflicts.length > 0
              ? ` · ${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"} resolved`
              : ""
          }`,
          id: "sync-pull",
        });
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, [sync, setBusy]);

  const label = oneWayLabel(size, spinning, "Pull", "Pulling…");

  return (
    <Button
      className={cn("press-feedback", className)}
      disabled={!configured || spinning}
      onClick={onClick}
      size={size}
      title={
        configured
          ? "Download cloud changes (local edits stay queued)"
          : "Set a sync endpoint in Settings → Sync to enable this"
      }
      variant={variant}
    >
      <ArrowDownToLine aria-hidden className="size-3.5" />
      {label}
    </Button>
  );
}

/** The three manual triggers together. Used in Settings and the title bar. */
export function SyncButtons({
  className,
  size = "sm",
  variant = "outline",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: SyncVariant;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <SyncButton size={size} variant={variant} />
      <PushButton size={size} variant={variant} />
      <PullButton size={size} variant={variant} />
    </div>
  );
}
