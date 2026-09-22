import { Button } from "@cmis/ui/components/button";
import { Check, Copy, DatabaseBackup, Save } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { absoluteDateTime } from "@/features/admin/format";
import { getDb } from "@/lib/db";
import { invoke } from "@/lib/tauri";
import { manualBackupName } from "../data/backup-naming";
import { useBackupFiles, type BackupFileInfo } from "../hooks/use-backup-files";
import { useBackupStatus } from "../hooks/use-backup-status";
import { useDailyBackup } from "../hooks/use-daily-backup";
import { SettingsCard } from "@/features/admin/settings/components/settings-card";

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function fileDateTime(mtime: number): string {
  return absoluteDateTime(new Date(mtime * 1000).toISOString());
}

/** "today 09:14" / "yesterday 09:14" / absolute date / "Never" (spec F9). */
function lastBackupLabel(iso: string): string {
  if (!iso) {
    return "Never";
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return "Never";
  }
  const now = new Date();
  const startOf = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  const dayMs = 86_400_000;
  const daysAgo = Math.round((startOf(now) - startOf(at)) / dayMs);
  const time = at.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (daysAgo <= 0) {
    return `today ${time}`;
  }
  if (daysAgo === 1) {
    return `yesterday ${time}`;
  }
  return absoluteDateTime(iso);
}

function kindLabel(kind: string): string {
  return kind === "manual" ? "Manual" : "Automatic";
}

export function BackupTab() {
  const { status, setEnabled, setKeep } = useBackupStatus();
  const { data, refetch } = useBackupFiles();
  const { runManualBackup } = useDailyBackup();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const dir = data?.dir ?? "";
  const files: BackupFileInfo[] = data?.files ?? [];
  const newest = files[0];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  const handleBackupNow = useCallback(async () => {
    setBusy(true);
    try {
      const info = await runManualBackup();
      await refetch();
      toast.success("Backup complete", { description: info.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Backup failed", { description: message });
    } finally {
      setBusy(false);
    }
  }, [refetch, runManualBackup]);

  const handleSaveCopy = useCallback(async () => {
    setBusy(true);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const chosen = await save({
        defaultPath: manualBackupName(new Date()),
        filters: [{ extensions: ["db"], name: "CMIS backup" }],
      });
      if (!chosen) {
        return;
      }
      const info = await invoke<BackupFileInfo>("create_backup", {
        destPath: chosen,
      });
      try {
        await recordAudit(
          (await getDb()) as unknown as {
            execute: (sql: string, params?: unknown[]) => Promise<unknown>;
          },
          {
            action: "settings",
            detail: `Saved a backup copy — ${info.name}`,
            targetKind: "settings",
          },
          { bestEffort: true },
        );
      } catch {
        // best-effort audit only
      }
      toast.success("Copy saved", { description: info.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Save failed", { description: message });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCopyPath = useCallback(async () => {
    if (!dir) {
      return;
    }
    try {
      await navigator.clipboard.writeText(dir);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the folder path");
    }
  }, [dir]);

  const handleToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      void setEnabled(event.target.checked);
    },
    [setEnabled],
  );

  const handleKeep = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) {
        void setKeep(value);
      }
    },
    [setKeep],
  );

  return (
    <div className="space-y-4">
      <SettingsCard
        actions={
          <>
            <Button
              className="press-feedback"
              disabled={busy}
              onClick={() => void handleBackupNow()}
              size="sm"
            >
              <DatabaseBackup aria-hidden className="size-3.5" />
              Back up now
            </Button>
            <Button
              className="press-feedback"
              disabled={busy}
              onClick={() => void handleSaveCopy()}
              size="sm"
              variant="outline"
            >
              <Save aria-hidden className="size-3.5" />
              Save a copy…
            </Button>
          </>
        }
        description="Runs once a day, the first time you open the app."
        title="Backups"
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-muted-foreground">Last backup</dt>
            <dd className="font-medium text-foreground text-sm">
              {lastBackupLabel(status.lastBackupAt)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Copies kept</dt>
            <dd className="font-medium text-foreground text-sm">
              {files.length === 0
                ? "None yet"
                : `${files.length} · ${formatBytes(totalBytes)}`}
            </dd>
          </div>
          {newest ? (
            <div className="sm:col-span-2">
              <dt className="text-caption text-muted-foreground">
                Newest copy
              </dt>
              <dd className="font-medium text-foreground text-sm">
                {newest.name} · {fileDateTime(newest.mtime)} ·{" "}
                {formatBytes(newest.size)}
              </dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="text-caption text-muted-foreground">
              Backup folder
            </dt>
            <dd className="mt-1 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 font-mono text-caption">
                {dir || "Resolving…"}
              </span>
              <Button
                aria-label="Copy folder path"
                disabled={!dir}
                onClick={() => void handleCopyPath()}
                size="sm"
                variant="ghost"
              >
                {copied ? (
                  <Check aria-hidden className="size-3.5" />
                ) : (
                  <Copy aria-hidden className="size-3.5" />
                )}
              </Button>
            </dd>
          </div>
        </dl>
      </SettingsCard>

      <SettingsCard
        description="One copy per day, written quietly after the app opens. Failures raise a banner on every page."
        title="Automatic backups"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="inline-flex items-center gap-1.5 text-caption text-foreground">
            <input
              checked={status.enabled}
              className="accent-primary"
              onChange={handleToggle}
              type="checkbox"
            />
            Back up automatically
          </label>
          <label className="inline-flex items-center gap-1.5 text-caption text-foreground">
            Keep the newest
            <input
              className="w-16 rounded-md border border-input bg-background px-2 py-1 text-caption"
              max={100}
              min={1}
              onChange={handleKeep}
              type="number"
              value={status.keep}
            />
            automatic copies
          </label>
        </div>
      </SettingsCard>

      <SettingsCard
        description="Automatic copies age out on their own; manual copies are never deleted by the app."
        title="All backups"
      >
        {files.length === 0 ? (
          <p className="text-caption text-muted-foreground">
            No backups yet — one is made the next time you open the app.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {files.map((file) => (
              <li
                className="flex items-center gap-3 py-2 text-sm"
                key={file.path}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {file.name}
                </span>
                <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-caption text-muted-foreground">
                  {kindLabel(file.kind)}
                </span>
                <span className="hidden shrink-0 text-caption text-muted-foreground sm:inline">
                  {fileDateTime(file.mtime)}
                </span>
                <span className="shrink-0 text-caption text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </div>
  );
}
