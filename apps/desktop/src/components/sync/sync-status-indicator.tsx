/**
 * CMIS Cloud Sync — the status the operator actually sees.
 *
 * The spec's success criterion 8 is "sync status visible and understandable":
 * visible means it lives in the window chrome (the title bar) rather than inside
 * Settings, and understandable means it names the state in words — "Offline",
 * "3 waiting" — instead of showing a coloured dot an operator has to learn.
 *
 * The click target is the whole pill, and it opens the same panel Settings →
 * Sync renders, so the chrome is a shortcut rather than a second, smaller
 * implementation of the same controls.
 */

import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import {
  Check,
  CloudOff,
  CloudUpload,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useState } from "react";

import { useSync } from "@/lib/sync/use-sync";
import { SyncSettingsPanel } from "./sync-settings";

function formatTime(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SyncStatusIndicator({ className }: { className?: string }) {
  const sync = useSync();
  const [open, setOpen] = useState(false);
  const openPanel = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const { phase, pending, lastSyncedAt, lastError } = sync;

  const label = (() => {
    if (phase === "disabled") {
      return "Sync off";
    }
    if (phase === "syncing") {
      return "Syncing…";
    }
    if (phase === "offline") {
      return pending > 0 ? `Offline · ${pending} waiting` : "Offline";
    }
    // Not `offline`: the server answered, just not inside the budget. Saying
    // "offline" here is what sent the last investigation after the network.
    if (phase === "timeout") {
      return pending > 0 ? `Timed out · ${pending} waiting` : "Timed out";
    }
    if (phase === "error") {
      return "Sync error";
    }
    if (pending > 0) {
      return `${pending} waiting`;
    }
    return lastSyncedAt ? `Synced ${formatTime(lastSyncedAt)}` : "Ready";
  })();

  const icon = (() => {
    if (phase === "syncing") {
      return <RefreshCw aria-hidden className="size-3.5 animate-spin" />;
    }
    if (phase === "offline") {
      return <CloudOff aria-hidden className="size-3.5" />;
    }
    if (phase === "timeout" || phase === "error") {
      return <TriangleAlert aria-hidden className="size-3.5" />;
    }
    if (phase === "disabled") {
      return <CloudUpload aria-hidden className="size-3.5" />;
    }
    return <Check aria-hidden className="size-3.5" />;
  })();

  return (
    <>
      <button
        aria-label={`Cloud sync: ${label}`}
        className={cn(
          "flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]",
          phase === "error" && "text-destructive",
          className
        )}
        onClick={openPanel}
        title={lastError ?? `Last synced ${formatTime(lastSyncedAt)}`}
        type="button"
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            aria-label="Close sync settings"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={close}
            type="button"
          />
          <div
            aria-label="Cloud sync"
            aria-modal="true"
            className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            role="dialog"
          >
            <div className="flex items-center justify-between border-border/60 border-b px-4 py-3">
              <h2 className="font-semibold text-foreground text-sm">
                Cloud sync
              </h2>
              <Button
                className="press-feedback"
                onClick={close}
                size="sm"
                variant="outline"
              >
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <SyncSettingsPanel />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
