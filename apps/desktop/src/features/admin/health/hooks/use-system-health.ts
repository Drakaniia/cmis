import { useQuery } from "@tanstack/react-query";

import { getDb } from "@/lib/db";
import { loadBackupStore } from "@/lib/backup-store";
import { isTauriRuntime } from "@/lib/open-external";
import { invoke } from "@/lib/tauri";
import {
  buildBackupCard,
  loadSystemHealth,
  type BackupSummary,
  type SystemHealth,
} from "../data/system-health";

export const SYSTEM_HEALTH_KEY = "system-health";

/**
 * The health cards, read from the database. Cached briefly so flipping between
 * the Health page and its Settings tab does not re-run the probe, but short
 * enough that a VACUUM or backup shows a fresh size/date on the next look.
 *
 * The backup card is rebuilt from the files in `<Documents>/CMIS Backups`
 * (backup-restore spec F9) — outside Tauri the database cards stand alone.
 */
async function loadHealth(): Promise<SystemHealth> {
  const health = await loadSystemHealth(await getDb());
  if (!isTauriRuntime()) {
    return health;
  }
  let summary: BackupSummary;
  try {
    const dir = await invoke<string>("backup_default_dir");
    const files = await invoke<BackupSummary["files"]>("list_backups", {
      dir,
    });
    const store = await loadBackupStore();
    summary = { dir, error: store.lastBackupError, files };
  } catch (error) {
    summary = {
      dir: "",
      error: error instanceof Error ? error.message : String(error),
      files: [],
    };
  }
  return {
    ...health,
    cards: health.cards.map((card) =>
      card.id === "backup" ? buildBackupCard(summary) : card,
    ),
  };
}

export function useSystemHealth() {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: loadHealth,
    queryKey: [SYSTEM_HEALTH_KEY],
    retry: false,
    staleTime: 15_000,
  });
}
