import {
  DEFAULT_UPDATER_SETTINGS,
  UPDATER_STORE_FILE,
  type UpdaterSettings,
} from "./types";

let cachedStore: unknown | null = null;

async function getStore(): Promise<{
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  save: () => Promise<void>;
}> {
  if (cachedStore) {
    return cachedStore as never;
  }
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  const store = new LazyStore(UPDATER_STORE_FILE);
  cachedStore = store;
  return store as never;
}

function coerceSettings(raw: unknown): UpdaterSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_UPDATER_SETTINGS };
  }
  const r = raw as Record<string, unknown>;
  return {
    autoCheckOnStartup:
      typeof r.autoCheckOnStartup === "boolean"
        ? r.autoCheckOnStartup
        : DEFAULT_UPDATER_SETTINGS.autoCheckOnStartup,
    autoDownload:
      typeof r.autoDownload === "boolean"
        ? r.autoDownload
        : DEFAULT_UPDATER_SETTINGS.autoDownload,
    lastCheckedAt: typeof r.lastCheckedAt === "string" ? r.lastCheckedAt : null,
  };
}

export async function loadUpdaterSettings(): Promise<UpdaterSettings> {
  try {
    const store = await getStore();
    const raw = await store.get<UpdaterSettings>("settings");
    if (raw === null || raw === undefined) {
      return { ...DEFAULT_UPDATER_SETTINGS };
    }
    return coerceSettings(raw);
  } catch {
    return { ...DEFAULT_UPDATER_SETTINGS };
  }
}

export async function saveUpdaterSettings(
  patch: Partial<UpdaterSettings>
): Promise<UpdaterSettings> {
  const current = await loadUpdaterSettings();
  const next: UpdaterSettings = { ...current, ...patch };
  try {
    const store = await getStore();
    await store.set("settings", next);
    await store.save();
  } catch {
    // ignore store write failures (e.g. browser dev without Tauri)
  }
  return next;
}

export function __resetStoreCacheForTests(): void {
  cachedStore = null;
}
