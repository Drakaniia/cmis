/** Machine-local backup settings (backup-restore spec F8). */

export interface BackupStoreState {
  enabled: boolean;
  keep: number;
  lastBackupAt: string;
  lastBackupDate: string;
  lastBackupError: string;
  lastBackupPath: string;
  lastManualAt: string;
}

export const BACKUP_STORE_FILE = "cmis-backup.json";

export const DEFAULT_BACKUP_STORE: BackupStoreState = {
  enabled: true,
  keep: 10,
  lastBackupAt: "",
  lastBackupDate: "",
  lastBackupError: "",
  lastBackupPath: "",
  lastManualAt: "",
};

let cachedStore: unknown | null = null;

async function getStore(): Promise<{
  get: <T>(key: string) => Promise<T | undefined>;
  save: () => Promise<void>;
  set: (key: string, value: unknown) => Promise<void>;
}> {
  if (cachedStore) {
    return cachedStore as never;
  }
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  const store = new LazyStore(BACKUP_STORE_FILE);
  cachedStore = store;
  return store as never;
}

/** Exported for tests — clamps `keep` to 1–100, keeps every key defined. */
export function coerceBackupStore(raw: unknown): BackupStoreState {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_BACKUP_STORE };
  }
  const r = raw as Record<string, unknown>;
  const keep =
    typeof r.keep === "number"
      ? Math.min(100, Math.max(1, Math.floor(r.keep)))
      : 10;
  const str = (key: string) =>
    typeof r[key] === "string" ? (r[key] as string) : "";
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    keep,
    lastBackupAt: str("lastBackupAt"),
    lastBackupDate: str("lastBackupDate"),
    lastBackupError: str("lastBackupError"),
    lastBackupPath: str("lastBackupPath"),
    lastManualAt: str("lastManualAt"),
  };
}

export async function loadBackupStore(): Promise<BackupStoreState> {
  try {
    const store = await getStore();
    const raw = await store.get<BackupStoreState>("backup");
    if (raw === null || raw === undefined) {
      return { ...DEFAULT_BACKUP_STORE };
    }
    return coerceBackupStore(raw);
  } catch {
    return { ...DEFAULT_BACKUP_STORE };
  }
}

export async function saveBackupStore(
  patch: Partial<BackupStoreState>
): Promise<BackupStoreState> {
  const next: BackupStoreState = { ...(await loadBackupStore()), ...patch };
  next.keep = Math.min(100, Math.max(1, Math.floor(next.keep)));
  try {
    const store = await getStore();
    await store.set("backup", next);
    await store.save();
  } catch {
    // ignore store write failures (browser dev without Tauri)
  }
  return next;
}

export function __resetBackupStoreCacheForTests(): void {
  cachedStore = null;
}
