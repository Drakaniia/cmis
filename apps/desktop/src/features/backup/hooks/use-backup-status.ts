import { useCallback, useEffect, useState } from "react";
import {
  type BackupStoreState,
  DEFAULT_BACKUP_STORE,
  loadBackupStore,
  saveBackupStore,
} from "@/lib/backup-store";
import { isTauriRuntime } from "@/lib/open-external";

export function useBackupStatus() {
  const [status, setStatus] = useState<BackupStoreState>(DEFAULT_BACKUP_STORE);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!isTauriRuntime()) {
      setReady(true);
      return DEFAULT_BACKUP_STORE;
    }
    const next = await loadBackupStore();
    setStatus(next);
    setReady(true);
    return next;
  }, []);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    setStatus(await saveBackupStore({ enabled }));
  }, []);

  const setKeep = useCallback(async (keep: number) => {
    setStatus(await saveBackupStore({ keep }));
  }, []);

  return { ready, reload, setEnabled, setKeep, status } as const;
}
