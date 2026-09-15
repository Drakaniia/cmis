import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Download, RefreshCw } from "lucide-react";
import { type ChangeEvent, useCallback, useState } from "react";
import { useBlockingModalGate } from "@/features/updater/blocking-modal-gate";
import { useUpdater } from "@/features/updater/use-updater";
import { SettingsCard } from "./settings-card";

function formatLastChecked(iso: string | null): string {
  if (!iso) {
    return "Never";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Updates tab orchestrates version + progress + prefs in one view
export function UpdatesTab() {
  const updater = useUpdater();
  const [notesOpen, setNotesOpen] = useState(false);
  useBlockingModalGate(notesOpen);

  const checking = updater.status === "checking";
  const downloading = updater.status === "downloading";
  const ready = updater.status === "ready";
  const available = updater.status === "available";

  const handleCheck = useCallback(() => {
    updater.checkNow().catch(() => undefined);
  }, [updater]);

  const handleDownload = useCallback(() => {
    updater.downloadNow().catch(() => undefined);
  }, [updater]);

  const handleRestart = useCallback(() => {
    updater.restartNow().catch(() => undefined);
  }, [updater]);

  const handleDismissReady = useCallback(() => {
    updater.dismiss();
  }, [updater]);

  const openNotes = useCallback(() => setNotesOpen(true), []);
  const closeNotes = useCallback(() => setNotesOpen(false), []);

  const handleAutoCheckChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updater.setAutoCheck(event.target.checked).catch(() => undefined);
    },
    [updater]
  );

  const handleAutoDownloadChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updater.setAutoDownload(event.target.checked).catch(() => undefined);
    },
    [updater]
  );

  const shortNotes =
    updater.notes !== null && updater.notes.length > 120
      ? `${updater.notes.slice(0, 120)}…`
      : updater.notes;

  return (
    <div className="space-y-4">
      <SettingsCard
        actions={
          <Button
            className="press-feedback"
            disabled={checking || downloading}
            onClick={handleCheck}
            size="sm"
          >
            <RefreshCw
              aria-hidden
              className={cn("size-3.5", checking && "animate-spin")}
            />
            {checking ? "Checking…" : "Check for updates"}
          </Button>
        }
        description="Checks GitHub Releases for a newer version. Restart is required to apply an update."
        title="Version"
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-muted-foreground">Installed</dt>
            <dd className="font-medium font-mono text-foreground text-sm">
              v{updater.currentVersion ?? "…"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">
              Latest available
            </dt>
            <dd className="font-medium font-mono text-foreground text-sm">
              {updater.availableVersion ? `v${updater.availableVersion}` : "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-caption text-muted-foreground">Last checked</dt>
            <dd className="font-medium text-foreground text-sm">
              {formatLastChecked(updater.settings.lastCheckedAt)}
            </dd>
          </div>
          {updater.status === "error" && updater.error ? (
            <div className="sm:col-span-2">
              <dt className="text-caption text-destructive">Error</dt>
              <dd className="text-destructive text-sm">{updater.error}</dd>
            </div>
          ) : null}
          {downloading && updater.progress !== null ? (
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-caption text-muted-foreground">
                  Downloading… {updater.progress}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${updater.progress}%` }}
                />
              </div>
            </div>
          ) : null}
          {ready ? (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button
                className="press-feedback"
                onClick={handleRestart}
                size="sm"
                variant="confirm"
              >
                Restart now
              </Button>
              <Button
                className="press-feedback"
                onClick={handleDismissReady}
                size="sm"
                variant="outline"
              >
                Later
              </Button>
            </div>
          ) : null}
          {available && !downloading && !ready ? (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button
                className="press-feedback"
                onClick={handleDownload}
                size="sm"
                variant="confirm"
              >
                <Download aria-hidden className="size-3.5" />
                Download now
              </Button>
              {updater.notes ? (
                <Button
                  className="press-feedback"
                  onClick={openNotes}
                  size="sm"
                  variant="outline"
                >
                  View release notes
                </Button>
              ) : null}
            </div>
          ) : null}
        </dl>
        {updater.notes && !available ? (
          <div className="mt-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
            <p className="line-clamp-2 text-muted-foreground">{shortNotes}</p>
            <button
              className="mt-1 font-medium text-primary text-xs hover:underline"
              onClick={openNotes}
              type="button"
            >
              View release notes
            </button>
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard
        description="These settings are stored locally and apply to this installation."
        title="Preferences"
      >
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-foreground text-sm">
              Check for updates on startup
            </span>
            <input
              checked={updater.settings.autoCheckOnStartup}
              className="accent-primary"
              onChange={handleAutoCheckChange}
              type="checkbox"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-foreground text-sm">
              Download updates automatically
            </span>
            <input
              checked={updater.settings.autoDownload}
              className="accent-primary"
              onChange={handleAutoDownloadChange}
              type="checkbox"
            />
          </label>
        </div>
      </SettingsCard>

      {notesOpen && updater.notes ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeNotes}
            type="button"
          />
          <div className="relative max-h-[70vh] w-full max-w-xl overflow-auto rounded-xl border border-border bg-card p-4 shadow-xl">
            <h3 className="font-semibold text-foreground text-sm">
              Release notes
            </h3>
            {updater.availableVersion ? (
              <p className="mt-1 font-mono text-muted-foreground text-xs">
                v{updater.availableVersion}
              </p>
            ) : null}
            <div className="mt-3 whitespace-pre-wrap text-foreground text-sm">
              {updater.notes}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                className="press-feedback"
                onClick={closeNotes}
                size="sm"
                variant="outline"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
