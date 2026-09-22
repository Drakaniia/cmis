import { useQuery } from "@tanstack/react-query";
import { isTauriRuntime } from "@/lib/open-external";
import { invoke } from "@/lib/tauri";

export interface BackupFileInfo {
  kind: string;
  mtime: number;
  name: string;
  path: string;
  size: number;
}

export const BACKUP_FILES_KEY = "backup-files";

async function loadBackupFiles(): Promise<{
  dir: string;
  files: BackupFileInfo[];
}> {
  if (!isTauriRuntime()) {
    return { dir: "", files: [] };
  }
  const dir = await invoke<string>("backup_default_dir");
  const files = await invoke<BackupFileInfo[]>("list_backups", { dir });
  return { dir, files };
}

export function useBackupFiles() {
  return useQuery({
    placeholderData: (previous) => previous,
    queryFn: loadBackupFiles,
    queryKey: [BACKUP_FILES_KEY],
    retry: false,
    staleTime: 15_000,
  });
}
