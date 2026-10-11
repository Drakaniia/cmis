/**
 * CMIS Cloud Sync — where the endpoint and the intervals are configured.
 *
 * Build-time values come from the spec's environment variables
 * (`docs/cloud-sync-spec.md` §1). They are read through `import.meta.env` with
 * the `SYNC_` prefix declared in `apps/desktop/vite.config.ts`'s `envPrefix`, so
 * `SYNC_API_ENDPOINT=https://… pnpm desktop:build` produces a build that is
 * already pointed at the Worker — and the settings panel can still override it
 * afterwards for a device that talks to a preview deployment.
 *
 * Persisted with `tauri-plugin-store`, like the updater's preferences and the
 * same reasoning: this is per-device configuration, not clinic data, so it does
 * not belong in `cmis.db` (which is backed up, restored and wiped as a unit).
 */

export const SYNC_STORE_FILE = "sync.json";

/** Spec default: `SYNC_INTERVAL_MS`. */
export const DEFAULT_SYNC_INTERVAL_MS = 30_000;

/** Spec default: `OFFLINE_QUEUE_MAX_SIZE`, the rows one sync pass may carry. */
export const DEFAULT_QUEUE_MAX_SIZE = 1000;

export interface SyncSettings {
  /** Off until an endpoint exists and the operator has not switched it off. */
  enabled: boolean;
  endpoint: string;
  intervalMs: number;
  lastError: string | null;
  lastSyncedAt: string | null;
  queueMaxSize: number;
  /**
   * Optional shared secret, matching the Worker's `SYNC_TOKEN`.
   *
   * The spec allows a trusted network with no authentication at all, and that is
   * still the default here. This exists because "no auth" on a public
   * `*.workers.dev` URL means anyone who learns it can read and rewrite the
   * clinic's inventory; an operator who wants the free tier *and* the URL can
   * set one secret on both sides and get a bearer check for nothing.
   */
  token: string;
}

function env(key: string): string | undefined {
  const record = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env;
  const value = record?.[key];
  return value === undefined || value === "" ? undefined : value;
}

function envNumber(key: string, fallback: number): number {
  const raw = Number(env(key));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const TRAILING_SLASHES = /\/+$/;

/** Keyboard-free normalisation of an operator-typed URL. */
export function normalizeEndpoint(value: string): string {
  return value.trim().replace(TRAILING_SLASHES, "");
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  enabled: Boolean(env("SYNC_API_ENDPOINT")),
  endpoint: normalizeEndpoint(env("SYNC_API_ENDPOINT") ?? ""),
  intervalMs: envNumber("SYNC_INTERVAL_MS", DEFAULT_SYNC_INTERVAL_MS),
  lastError: null,
  lastSyncedAt: null,
  queueMaxSize: envNumber(
    "SYNC_OFFLINE_QUEUE_MAX_SIZE",
    DEFAULT_QUEUE_MAX_SIZE
  ),
  token: env("SYNC_TOKEN") ?? "",
};

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
  const store = new LazyStore(SYNC_STORE_FILE);
  cachedStore = store;
  return store as never;
}

function coerce(raw: unknown): SyncSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SYNC_SETTINGS };
  }
  const r = raw as Record<string, unknown>;
  const endpoint =
    typeof r.endpoint === "string"
      ? normalizeEndpoint(r.endpoint)
      : DEFAULT_SYNC_SETTINGS.endpoint;
  const intervalMs =
    typeof r.intervalMs === "number" && r.intervalMs >= 5000
      ? r.intervalMs
      : DEFAULT_SYNC_SETTINGS.intervalMs;
  const queueMaxSize =
    typeof r.queueMaxSize === "number" && r.queueMaxSize >= 1
      ? r.queueMaxSize
      : DEFAULT_SYNC_SETTINGS.queueMaxSize;
  return {
    // An endpoint is what makes sync possible at all; storing `enabled: true`
    // next to an empty endpoint would leave the app retrying a URL that does
    // not exist.
    enabled:
      typeof r.enabled === "boolean" && endpoint !== ""
        ? r.enabled
        : DEFAULT_SYNC_SETTINGS.enabled && endpoint !== "",
    endpoint,
    intervalMs,
    lastError: typeof r.lastError === "string" ? r.lastError : null,
    lastSyncedAt: typeof r.lastSyncedAt === "string" ? r.lastSyncedAt : null,
    queueMaxSize,
    token: typeof r.token === "string" ? r.token : DEFAULT_SYNC_SETTINGS.token,
  };
}

export async function loadSyncSettings(): Promise<SyncSettings> {
  try {
    const store = await getStore();
    const raw = await store.get<SyncSettings>("settings");
    return raw === null || raw === undefined
      ? { ...DEFAULT_SYNC_SETTINGS }
      : coerce(raw);
  } catch {
    // Browser preview, or a store the plugin cannot open: build-time defaults
    // still give the panel something honest to show.
    return { ...DEFAULT_SYNC_SETTINGS };
  }
}

export async function saveSyncSettings(
  patch: Partial<SyncSettings>
): Promise<SyncSettings> {
  const current = await loadSyncSettings();
  const next = coerce({
    ...current,
    ...patch,
    ...(patch.endpoint === undefined
      ? {}
      : { endpoint: normalizeEndpoint(patch.endpoint) }),
  });
  // Enabling is the operator's statement that the endpoint is real, so an empty
  // one disables instead of pretending.
  if (next.endpoint === "") {
    next.enabled = false;
  }
  try {
    const store = await getStore();
    await store.set("settings", next);
    await store.save();
  } catch {
    // ignore store write failures (no Tauri, read-only profile)
  }
  return next;
}

export function __resetSyncStoreCacheForTests(): void {
  cachedStore = null;
}
