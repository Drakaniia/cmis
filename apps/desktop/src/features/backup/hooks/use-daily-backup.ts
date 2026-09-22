import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { loadBackupStore, saveBackupStore } from "@/lib/backup-store";
import { getDb } from "@/lib/db";
import { isTauriRuntime } from "@/lib/open-external";
import { invoke } from "@/lib/tauri";
import {
  autoBackupName,
  localDateKey,
  manualBackupName,
  resolveCollision,
} from "../data/backup-naming";
import { shouldRunDailyBackup } from "../data/backup-policy";
import { BACKUP_FILES_KEY, type BackupFileInfo } from "./use-backup-files";

const ROLLOVER_MS = 60_000;

async function auditBackup(detail: string): Promise<void> {
  try {
    await recordAudit(
      (await getDb()) as unknown as {
        execute: (sql: string, params?: unknown[]) => Promise<unknown>;
      },
      { action: "settings", detail, targetKind: "settings" },
      { bestEffort: true },
    );
  } catch {
    // best-effort: a backup that landed must not fail because its audit row did
  }
}

async function listToday(dir: string): Promise<BackupFileInfo[]> {
  return invoke<BackupFileInfo[]>("list_backups", { dir });
}

/** Adopt today's existing file (spec §7.4) or write it via `create_backup`. */
async function ensureAutoBackup(
  dir: string,
  today: string,
): Promise<BackupFileInfo> {
  const wanted = autoBackupName(today);
  const files = await listToday(dir);
  const existing = files.find((file) => file.name === wanted);
  if (existing) {
    return existing;
  }
  return invoke<BackupFileInfo>("create_backup", {
    destPath: `${dir}/${wanted}`,
  });
}

export function useDailyBackup() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);

  const runOnce = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!isTauriRuntime() || inFlight.current) {
        return;
      }
      inFlight.current = true;
      try {
        const store = await loadBackupStore();
        if (!store.enabled) {
          return;
        }
        const today = localDateKey();
        const decision = shouldRunDailyBackup({
          enabled: store.enabled,
          hasDatabase: true,
          lastBackupDate: store.lastBackupDate,
          today,
        });
        if (!decision.run && !opts?.force) {
          return;
        }
        const dir = await invoke<string>("backup_default_dir");
        const info = await ensureAutoBackup(dir, today);
        const { keep } = await loadBackupStore();
        await invoke("prune_backups", { dir, keep });
        await saveBackupStore({
          lastBackupAt: new Date(info.mtime * 1000).toISOString(),
          lastBackupDate: today,
          lastBackupError: "",
          lastBackupPath: info.path,
        });
        await auditBackup(`Automatic backup written — ${info.name}`);
        await queryClient.invalidateQueries({ queryKey: [BACKUP_FILES_KEY] });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
          const dir = await invoke<string>("backup_default_dir").catch(() => "");
          await saveBackupStore({
            lastBackupError: `${message} (tried ${dir || "the backup folder"})`,
          });
        } catch {
          // the store itself is unavailable; the next launch retries
        }
      } finally {
        inFlight.current = false;
      }
    },
    [queryClient],
  );

  const runManualBackup = useCallback(async (): Promise<BackupFileInfo> => {
    const dir = await invoke<string>("backup_default_dir");
    const files = await listToday(dir);
    const name = resolveCollision(
      files.map((file) => file.name),
      manualBackupName(new Date()),
    );
    const info = await invoke<BackupFileInfo>("create_backup", {
      destPath: `${dir}/${name}`,
    });
    await saveBackupStore({
      lastBackupAt: new Date(info.mtime * 1000).toISOString(),
      lastBackupError: "",
      lastBackupPath: info.path,
      lastManualAt: new Date().toISOString(),
    });
    await auditBackup(`Manual backup written — ${info.name}`);
    await queryClient.invalidateQueries({ queryKey: [BACKUP_FILES_KEY] });
    return info;
  }, [queryClient]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    const timer = window.setTimeout(() => void runOnce(), 0);
    const interval = window.setInterval(() => void runOnce(), ROLLOVER_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [runOnce]);

  return { retry: () => runOnce({ force: true }), runManualBackup } as const;
}
