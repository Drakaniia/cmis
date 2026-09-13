import { Button } from "@cmis/ui/components/button";
import { Link } from "@tanstack/react-router";
import { DatabaseBackup, HardDriveDownload } from "lucide-react";
import { toast } from "sonner";

import { absoluteDateTime } from "../../format";
import type { BackupSettings } from "../types";
import { SettingsCard } from "./settings-card";

export function BackupTab({
  backup,
  onTrigger,
  onSetSchedule,
}: {
  backup: BackupSettings;
  onSetSchedule: (schedule: BackupSettings["schedule"]) => void;
  onTrigger: () => void;
}) {
  return (
    <div className="space-y-4">
      <SettingsCard
        actions={
          <Button
            className="press-feedback"
            onClick={() => {
              onTrigger();
              toast.success("Backup complete", {
                description: absoluteDateTime(new Date().toISOString()),
              });
            }}
            size="sm"
          >
            <DatabaseBackup aria-hidden className="size-3.5" />
            Trigger Backup Now
          </Button>
        }
        description="Stored through the Tauri filesystem plugin in the app data directory."
        title="Backups"
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-muted-foreground">Last backup</dt>
            <dd className="font-medium text-foreground text-sm">
              {absoluteDateTime(backup.lastBackupAt)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Next run</dt>
            <dd className="font-medium text-foreground text-sm">
              {backup.schedule === "off"
                ? "Manual only"
                : absoluteDateTime(backup.nextRun)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-caption text-muted-foreground">
              Location (appData)
            </dt>
            <dd className="mt-1 truncate rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 font-mono text-caption">
              {backup.path}
            </dd>
          </div>
        </dl>
      </SettingsCard>

      <SettingsCard
        description="Scheduled backups run quietly at 02:00 local time."
        title="Auto-schedule"
      >
        <div className="flex flex-wrap gap-3">
          {(["off", "daily", "weekly"] as const).map((option) => (
            <label
              className="inline-flex items-center gap-1.5 text-caption text-foreground"
              key={option}
            >
              <input
                checked={backup.schedule === option}
                className="accent-primary"
                name="backup-schedule"
                onChange={() => onSetSchedule(option)}
                type="radio"
              />
              {option === "off"
                ? "Off"
                : option === "daily"
                  ? "Daily"
                  : "Weekly"}
            </label>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        description="Restoring is a destructive, typed-confirm operation on the Data screen."
        title="Restore"
      >
        <Link
          className="press-feedback inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 font-medium text-xs hover:bg-muted"
          to="/admin/data"
        >
          <HardDriveDownload aria-hidden className="size-3.5" />
          Go to Import / Restore
        </Link>
      </SettingsCard>
    </div>
  );
}
