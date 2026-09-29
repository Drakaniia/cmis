/**
 * Writes one safety backup file to the default backup directory.
 *
 * Split out of `useBackupActions.runManualBackup` so the updater can take the
 * same copy before installing a new build. The hook layers the store update,
 * the audit row and the cache invalidation on top; the updater only needs the
 * file, and only needs to know whether it succeeded.
 */

import { invoke } from "@/lib/tauri";
import type { BackupFileInfo } from "../hooks/use-backup-files";
import { manualBackupName, resolveCollision } from "./backup-naming";

/**
 * Never prunes: a `cmis-manual-*` file, named around the current minute and
 * de-duplicated against whatever is already on disk.
 */
export async function writeSafetyBackupFile(
  now: Date = new Date()
): Promise<BackupFileInfo> {
  const dir = await invoke<string>("backup_default_dir");
  const files = await invoke<BackupFileInfo[]>("list_backups", { dir });
  const name = resolveCollision(
    files.map((file) => file.name),
    manualBackupName(now)
  );
  return invoke<BackupFileInfo>("create_backup", {
    destPath: `${dir}/${name}`,
  });
}
