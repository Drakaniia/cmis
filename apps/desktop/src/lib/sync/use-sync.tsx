/**
 * CMIS Cloud Sync — the provider that owns the triggers.
 *
 * The spec's §3 "sync triggers" list is the whole reason this file exists:
 * on save, on app focus, on a periodic interval, and on the manual button. Those
 * are four ways to call one function, and that function is `runSync`.
 *
 * The provider is careful about three things:
 *
 * 1. **Nothing here can break the app.** The whole body of a run is wrapped: a
 *    missing database, a Tauri store the browser preview does not have, a Worker
 *    that is down — each becomes a phase (`disabled` / `offline` / `error`) with
 *    a message, never a thrown error inside a render or an interval callback.
 * 2. **One run at a time.** A focus event, an interval tick and a click can land
 *    together; a second concurrent push would send the same rows twice and race
 *    the cursors. `runningRef` collapses them.
 * 3. **Applying remote rows is announced.** The board and the inventory lists
 *    hydrate from SQLite once per mount, so a pull that changed rows has to say
 *    so — see `notifyRequestsChanged` and the query invalidation below.
 */

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";
import { describeConflict } from "./conflict-resolver";
import {
  ensureDeviceId,
  pendingChangeCount,
  readCursors,
} from "./offline-queue";
import { registerSyncScheduler, scheduleSync } from "./schedule";
import { SYNC_TABLE_NAMES } from "./schema";
import {
  fetchSyncStatus,
  runSync,
  SyncFailure,
  type SyncFailureKind,
  type SyncRunResult,
} from "./sync-client";
import {
  DEFAULT_SYNC_SETTINGS,
  loadSyncSettings,
  type SyncSettings,
  saveSyncSettings,
} from "./sync-settings";
import type { SyncDatabase, SyncStatusResponse } from "./types";

export type SyncPhase =
  | "disabled"
  | "error"
  | "idle"
  | "offline"
  | "syncing"
  | "timeout";

export interface SyncContextValue extends SyncSettings {
  /** `null` until a sync has run in this session. */
  lastResult: SyncRunResult | null;
  /** Rows plus deletes waiting to be sent. */
  pending: number;
  phase: SyncPhase;
  /** Re-reads `/sync/status`. `null` when there is no endpoint yet. */
  refreshServerStatus: () => Promise<void>;
  /**
   * `false` until the stored settings have been read. The context is always
   * usable (it starts from the build-time defaults), but a form that edits the
   * endpoint must not let someone save a value it has not loaded yet.
   */
  resolved: boolean;
  serverStatus: SyncStatusResponse | null;
  syncNow: (opts?: { silent?: boolean }) => Promise<SyncRunResult | null>;
  /** Every table this build syncs, for the settings panel. */
  tables: string[];
  update: (patch: Partial<SyncSettings>) => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncOptional(): SyncContextValue | null {
  return useContext(SyncContext);
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) {
    throw new Error("useSync must be used within SyncProvider");
  }
  return value;
}

/** The shortest gap between two automatic runs, whatever the interval says. */
const MIN_AUTO_INTERVAL_MS = 10_000;
const PENDING_REFRESH_MS = 60_000;
const STARTUP_DELAY_MS = 4000;
const MAX_AUDITED_CONFLICTS = 20;

/** Anything the engine throws, classified so the UI can label it. */
function asSyncFailure(error: unknown): SyncFailure {
  return error instanceof SyncFailure
    ? error
    : new SyncFailure(
        error instanceof Error ? error.message : String(error),
        "server"
      );
}

/**
 * One engine pass, plus the local work a pull implies: telling the hydrated
 * lists that rows changed under them, and writing the conflict audit trail.
 *
 * Kept out of `syncNow` so that callback stays a readable guard-and-report
 * shell; it is the app's busiest callback and should not also be its densest.
 */
async function runEnginePass(input: {
  current: SyncSettings;
  db: SyncDatabase;
  queryClient: QueryClient;
}): Promise<SyncRunResult> {
  const { current, db, queryClient } = input;
  const deviceId = await ensureDeviceId(db);
  const result = await runSync({
    db,
    deviceId,
    endpoint: current.endpoint,
    fetchImpl: globalThis.fetch.bind(globalThis),
    limit: current.queueMaxSize,
    token: current.token || undefined,
  });

  if (result.appliedRows + result.appliedDeletes > 0) {
    // The board and every list hydrate from SQLite once per mount, so a pull
    // has to say that rows changed under them.
    queryClient.invalidateQueries();
    const { notifyRequestsChanged } = await import(
      "@/features/requests/persistence"
    );
    notifyRequestsChanged();
  }
  if (result.conflicts.length > 0) {
    await auditConflicts(db, result.conflicts);
  }
  return result;
}

/** The in-flight guard, as an object so one ref covers the whole run state. */
interface RunLock {
  running: boolean;
}

/** A fresh, un-held run lock. A function so the field keeps its `boolean` type. */
function createRunLock(): RunLock {
  return { running: false };
}

/** A hint only — a failed request is the authoritative "offline" signal. */
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** The state setters a finished run reports through. */
interface SyncReportHandlers {
  refreshPending: () => Promise<void>;
  refreshServerStatus: () => Promise<void>;
  setLastResult: (result: SyncRunResult) => void;
  setPhase: (phase: SyncPhase) => void;
  setSettingsBoth: (next: SyncSettings) => void;
}

async function reportSyncSuccess(
  result: SyncRunResult,
  silent: boolean,
  handlers: SyncReportHandlers
): Promise<void> {
  if (result.conflicts.length > 0 && !silent) {
    toast.warning(
      `${result.conflicts.length} sync conflict${result.conflicts.length === 1 ? "" : "s"} resolved`,
      {
        description: "The newer copy was kept; see Audit Logs → sync.",
        id: "sync-conflicts",
      }
    );
  }
  handlers.setLastResult(result);
  handlers.setPhase("idle");
  handlers.setSettingsBoth(
    await saveSyncSettings({
      lastError: null,
      lastSyncedAt: new Date().toISOString(),
    })
  );
  await handlers.refreshPending();
  // Keep "In the cloud" from going stale: a run that just pushed must re-read
  // server counts, otherwise the panel says "in sync" while showing the old 0.
  // ponytail: fire-and-forget refresh, sync already succeeded
  await handlers.refreshServerStatus().catch(() => undefined);
}

/**
 * How a failure reads in the UI. A slow server is not an offline device, and the
 * panel must not say it is: "offline" sends the operator to look at a network
 * that is working fine, when the real cause is a batch the Worker is still
 * chewing through.
 */
const FAILURE_PRESENTATION: Record<
  SyncFailureKind,
  { phase: SyncPhase; toast: string }
> = {
  offline: { phase: "offline", toast: "Offline — changes are queued" },
  protocol: { phase: "error", toast: "Sync failed" },
  server: { phase: "error", toast: "Sync failed" },
  timeout: { phase: "timeout", toast: "Sync timed out — changes are queued" },
};

async function reportSyncFailure(
  error: unknown,
  silent: boolean,
  handlers: SyncReportHandlers
): Promise<void> {
  const failure = asSyncFailure(error);
  const shown = FAILURE_PRESENTATION[failure.kind];
  handlers.setPhase(shown.phase);
  handlers.setSettingsBoth(
    await saveSyncSettings({ lastError: failure.message })
  );
  if (silent) {
    return;
  }
  toast.error(shown.toast, {
    description: failure.message,
    id: "sync-error",
  });
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [resolved, setResolved] = useState(false);
  const [phase, setPhase] = useState<SyncPhase>("disabled");
  const [pending, setPending] = useState(0);
  const [lastResult, setLastResult] = useState<SyncRunResult | null>(null);
  const [serverStatus, setServerStatus] = useState<SyncStatusResponse | null>(
    null
  );

  const runningRef = useRef<RunLock>(createRunLock());
  const settingsRef = useRef<SyncSettings | null>(null);
  const lastRunAtRef = useRef(0);

  const setSettingsBoth = useCallback((next: SyncSettings) => {
    settingsRef.current = next;
    setSettings(next);
  }, []);

  /**
   * The database, or `null` when this window has none (browser preview without
   * a dev server, or a desktop build whose plugin failed to open).
   */
  const openDb = useCallback(async (): Promise<SyncDatabase | null> => {
    try {
      return (await getDb()) as unknown as SyncDatabase;
    } catch {
      return null;
    }
  }, []);

  const refreshPending = useCallback(async () => {
    const db = await openDb();
    if (!db) {
      return;
    }
    try {
      const cursors = await readCursors(db);
      const counts = await pendingChangeCount(db, cursors.push);
      setPending(counts.rows + counts.deletes);
    } catch {
      // A database from before migration 0014 has no sync tables; the panel
      // simply shows what it last knew.
    }
  }, [openDb]);

  const refreshServerStatus = useCallback(async () => {
    const { current } = settingsRef;
    if (!current?.endpoint) {
      setServerStatus(null);
      return;
    }
    try {
      setServerStatus(
        await fetchSyncStatus({
          endpoint: current.endpoint,
          fetchImpl: globalThis.fetch.bind(globalThis),
          token: current.token || undefined,
        })
      );
    } catch {
      setServerStatus(null);
    }
  }, []);

  const syncNow = useCallback(
    async (opts?: { silent?: boolean }): Promise<SyncRunResult | null> => {
      const { current } = settingsRef;
      if (!(current?.enabled && current.endpoint)) {
        return null;
      }
      // A focus event, an interval tick and a click can land together. One run
      // at a time, or the same rows are pushed twice and the cursors race.
      if (runningRef.current.running) {
        return null;
      }
      if (!opts?.silent && isOffline()) {
        setPhase("offline");
        return null;
      }
      runningRef.current.running = true;
      setPhase("syncing");
      lastRunAtRef.current = Date.now();
      const silent = opts?.silent ?? false;
      const handlers = {
        refreshPending,
        refreshServerStatus,
        setLastResult,
        setPhase,
        setSettingsBoth,
      };

      try {
        const db = await openDb();
        if (!db) {
          setPhase("disabled");
          return null;
        }
        const result = await runEnginePass({ current, db, queryClient });
        await reportSyncSuccess(result, silent, handlers);
        return result;
      } catch (error) {
        await reportSyncFailure(error, silent, handlers);
        return null;
      } finally {
        runningRef.current.running = false;
      }
    },
    [openDb, queryClient, refreshPending, refreshServerStatus, setSettingsBoth]
  );

  const update = useCallback(
    async (patch: Partial<SyncSettings>) => {
      const next = await saveSyncSettings(patch);
      setSettingsBoth(next);
      if (!(patch.endpoint || patch.enabled)) {
        return;
      }
      if (patch.endpoint !== undefined) {
        setServerStatus(null);
        await refreshServerStatus();
      }
      setPhase(next.enabled && next.endpoint ? "idle" : "disabled");
      if (next.enabled && next.endpoint) {
        // Enabling is the operator asking for it now, not in 30 seconds.
        await syncNow();
      }
    },
    [refreshServerStatus, setSettingsBoth, syncNow]
  );

  // Settings load once. Until they do, `phase` stays `disabled`.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadSyncSettings();
      if (cancelled) {
        return;
      }
      setSettingsBoth(loaded);
      setResolved(true);
      setPhase(loaded.enabled && loaded.endpoint ? "idle" : "disabled");
      await refreshPending();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshPending, setSettingsBoth]);

  // The write-path trigger: `persistence.ts` and the mutation cache below both
  // funnel into this, and only while a sync is actually configured.
  useEffect(() => {
    if (!(settings?.enabled && settings.endpoint)) {
      return;
    }
    return registerSyncScheduler(() => {
      syncNow({ silent: true }).catch(() => undefined);
    });
  }, [settings?.enabled, settings?.endpoint, syncNow]);

  // Every completed mutation in the app schedules a sync — that is how "after
  // inventory changes → queue for sync" is satisfied without an edit in each of
  // the twenty inventory hooks: they all mutate through this cache.
  useEffect(() => {
    if (!(settings?.enabled && settings.endpoint)) {
      return;
    }
    return queryClient.getMutationCache().subscribe(() => {
      scheduleSync();
    });
  }, [queryClient, settings?.enabled, settings?.endpoint]);

  // Periodic trigger plus the launch sync.
  useEffect(() => {
    if (!(settings?.enabled && settings.endpoint)) {
      return;
    }
    const interval = Math.max(settings.intervalMs, MIN_AUTO_INTERVAL_MS);
    const first = setTimeout(() => {
      syncNow({ silent: true }).catch(() => undefined);
    }, STARTUP_DELAY_MS);
    const timer = setInterval(() => {
      syncNow({ silent: true }).catch(() => undefined);
    }, interval);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [settings?.enabled, settings?.endpoint, settings?.intervalMs, syncNow]);

  // Focus trigger, throttled: an operator alt-tabbing between two apps must not
  // generate a request per tab switch.
  useEffect(() => {
    if (!(settings?.enabled && settings.endpoint)) {
      return;
    }
    const onFocus = () => {
      if (Date.now() - lastRunAtRef.current < MIN_AUTO_INTERVAL_MS) {
        return;
      }
      syncNow({ silent: true }).catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [settings?.enabled, settings?.endpoint, syncNow]);

  // Offline detection. `navigator.onLine` is only a hint (it says nothing about
  // whether the Worker is reachable), which is why a failed request also sets
  // `offline`; these listeners just make the common case immediate.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const goOffline = () => {
      setPhase((current) => (current === "syncing" ? current : "offline"));
    };
    const goOnline = () => {
      setPhase((current) => (current === "syncing" ? current : "idle"));
      syncNow({ silent: true }).catch(() => undefined);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [syncNow]);

  // Queue depth, so the indicator can say "3 waiting" without a database poll on
  // every render.
  useEffect(() => {
    if (!(settings?.enabled && settings.endpoint)) {
      return;
    }
    const timer = setInterval(() => {
      refreshPending().catch(() => undefined);
    }, PENDING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshPending, settings?.enabled, settings?.endpoint, settings]);

  // The context is provided from the first render, with the build-time defaults,
  // rather than after the store read resolves. The title bar mounts immediately,
  // and a consumer that renders before the settings arrive must see "sync off"
  // instead of an exception.
  const active = settings ?? DEFAULT_SYNC_SETTINGS;

  const value = useMemo<SyncContextValue>(
    () => ({
      ...active,
      lastResult,
      pending,
      phase,
      refreshServerStatus,
      resolved,
      serverStatus,
      syncNow,
      tables: SYNC_TABLE_NAMES,
      update,
    }),
    [
      active,
      lastResult,
      pending,
      phase,
      refreshServerStatus,
      resolved,
      serverStatus,
      syncNow,
      update,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/**
 * Writes one audit row per resolved conflict, capped.
 *
 * The spec's open question 4 ("log conflicts for audit, or resolve silently?")
 * is answered with *log*, because a silent automatic overwrite is exactly the
 * kind of thing an operator needs to be able to find afterwards — and the
 * audit log already declares a `sync` action (migration 0004).
 */
async function auditConflicts(
  db: SyncDatabase,
  conflicts: SyncRunResult["conflicts"]
): Promise<void> {
  const audited = conflicts.slice(0, MAX_AUDITED_CONFLICTS);
  for (const conflict of audited) {
    // biome-ignore lint/performance/noAwaitInLoops: one audit row per conflict, in order, so the trail reads chronologically
    await recordAudit(
      db,
      {
        action: "sync",
        detail: describeConflict(conflict),
        targetId: conflict.rowKey,
      },
      { bestEffort: true }
    );
  }
  if (conflicts.length > audited.length) {
    await recordAudit(
      db,
      {
        action: "sync",
        detail: `Sync resolved ${conflicts.length} conflicts (${audited.length} listed individually)`,
      },
      { bestEffort: true }
    );
  }
}
