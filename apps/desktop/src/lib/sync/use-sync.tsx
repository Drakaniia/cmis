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
import { SyncStrategyDialog } from "@/components/sync/sync-strategy-dialog";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";
import {
  backupSyncedTables,
  clearSyncedTables,
  readLatestBackup,
  reconcilePushCursors,
  restoreSyncedTables,
  type SyncBackupInfo,
} from "./cloud-takeover";
import { describeConflict } from "./conflict-resolver";
import {
  ensureDeviceId,
  pendingChangeCount,
  readCursors,
  writePullCursors,
} from "./offline-queue";
import { countAllRows, countRows } from "./scan";
import { registerSyncScheduler, scheduleSync } from "./schedule";
import { SYNC_TABLE_NAMES } from "./schema";
import {
  classifySyncSituation,
  rememberStrategy,
  type SyncStrategy,
  strategyForEndpoint,
} from "./strategy";
import {
  fetchSyncStatus,
  pullRemoteChanges,
  pushLocalChanges,
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
import type { SyncDatabase, SyncStatusResponse, SyncTableName } from "./types";

export type SyncPhase =
  | "disabled"
  | "error"
  | "idle"
  | "offline"
  | "syncing"
  | "timeout";

/** The both-sides-populated decision the operator has not yet answered (§6.4). */
export interface SyncDecisionState {
  cloudCounts: Partial<Record<SyncTableName, number>>;
  cloudTotals: Partial<Record<SyncTableName, number>>;
  endpoint: string;
  localCounts: Partial<Record<SyncTableName, number>>;
}

export interface SyncContextValue extends SyncSettings {
  /** The most recent automatic sync backup, restorable from the Status tab. */
  backup: SyncBackupInfo | null;
  /** Resolves the pending decision, remembers it, and runs the chosen pass. */
  chooseStrategy: (strategy: SyncStrategy) => Promise<SyncRunResult | null>;
  /**
   * The pending both-sides choice, or `null`. When this is set no data has
   * moved; the UI renders the chooser and calls `chooseStrategy`.
   */
  decision: SyncDecisionState | null;
  /** Closes the chooser without choosing; the next run asks again. */
  dismissDecision: () => void;
  /** `null` until a sync has run in this session. */
  lastResult: SyncRunResult | null;
  /** Rows plus deletes waiting to be sent. */
  pending: number;
  phase: SyncPhase;
  /** Pull-only: fetch cloud rows, never push. Pending local changes are kept. */
  pullNow: () => Promise<SyncRunResult | null>;
  /** Push-only: send local queue, never pull. */
  pushNow: () => Promise<SyncRunResult | null>;
  /** Re-reads `/sync/status`. `null` when there is no endpoint yet. */
  refreshServerStatus: () => Promise<void>;
  /**
   * `false` until the stored settings have been read. The context is always
   * usable (it starts from the build-time defaults), but a form that edits the
   * endpoint must not let someone save a value it has not loaded yet.
   */
  resolved: boolean;
  /** Replaces the synced tables with the latest automatic backup. */
  restoreBackup: () => Promise<void>;
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
  preferLocal?: boolean;
  queryClient: QueryClient;
}): Promise<SyncRunResult> {
  const { current, db, queryClient, preferLocal } = input;
  const deviceId = await ensureDeviceId(db);
  const result = await runSync({
    db,
    deviceId,
    endpoint: current.endpoint,
    fetchImpl: globalThis.fetch.bind(globalThis),
    limit: current.queueMaxSize,
    preferLocal,
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

/**
 * First-connection pass: pull-only, no push.
 *
 * A new device holds zero rows. Pushing that blank state is a no-op today
 * (empty payloads are skipped), but the intent on first save is "fetch what
 * the cloud has", so no push request leaves this device at all. Pull cursors
 * reset to empty first, so a repointed database fetches the new server in
 * full instead of resuming the old server's position.
 */
async function runPullOnlyPass(input: {
  current: SyncSettings;
  db: SyncDatabase;
  queryClient: QueryClient;
}): Promise<SyncRunResult> {
  const { current, db, queryClient } = input;
  const deviceId = await ensureDeviceId(db);
  await writePullCursors(db, { deleted: "", rows: {} });
  const pull = await pullRemoteChanges({
    db,
    deviceId,
    endpoint: current.endpoint,
    fetchImpl: globalThis.fetch.bind(globalThis),
    limit: current.queueMaxSize,
    token: current.token || undefined,
  });

  if (pull.appliedRows + pull.appliedDeletes > 0) {
    queryClient.invalidateQueries();
    const { notifyRequestsChanged } = await import(
      "@/features/requests/persistence"
    );
    notifyRequestsChanged();
  }
  if (pull.conflicts.length > 0) {
    await auditConflicts(db, pull.conflicts);
  }
  return {
    appliedDeletes: pull.appliedDeletes,
    appliedRows: pull.appliedRows,
    conflicts: pull.conflicts,
    moreToPush: false,
    pushedDeletes: 0,
    pushedRows: 0,
    serverTime: pull.serverTime,
    skipped: pull.skipped,
  };
}

/**
 * Manual pull: same as the first-connection pass but without resetting cursors,
 * so it resumes instead of re-fetching everything. Pending local changes are
 * left queued — apply is last-write-wins.
 */
async function runPullPass(input: {
  current: SyncSettings;
  db: SyncDatabase;
  queryClient: QueryClient;
}): Promise<SyncRunResult> {
  const { current, db, queryClient } = input;
  const deviceId = await ensureDeviceId(db);
  const pull = await pullRemoteChanges({
    db,
    deviceId,
    endpoint: current.endpoint,
    fetchImpl: globalThis.fetch.bind(globalThis),
    limit: current.queueMaxSize,
    token: current.token || undefined,
  });

  if (pull.appliedRows + pull.appliedDeletes > 0) {
    queryClient.invalidateQueries();
    const { notifyRequestsChanged } = await import(
      "@/features/requests/persistence"
    );
    notifyRequestsChanged();
  }
  if (pull.conflicts.length > 0) {
    await auditConflicts(db, pull.conflicts);
  }
  return {
    appliedDeletes: pull.appliedDeletes,
    appliedRows: pull.appliedRows,
    conflicts: pull.conflicts,
    moreToPush: false,
    pushedDeletes: 0,
    pushedRows: 0,
    serverTime: pull.serverTime,
    skipped: pull.skipped,
  };
}

/** Manual push: send the local queue, never pull. */
async function runPushPass(input: {
  current: SyncSettings;
  db: SyncDatabase;
}): Promise<SyncRunResult> {
  const { current, db } = input;
  const deviceId = await ensureDeviceId(db);
  const push = await pushLocalChanges({
    db,
    deviceId,
    endpoint: current.endpoint,
    fetchImpl: globalThis.fetch.bind(globalThis),
    limit: current.queueMaxSize,
    token: current.token || undefined,
  });
  if (push.response.conflicts.length > 0) {
    await auditConflicts(db, push.response.conflicts);
  }
  return {
    appliedDeletes: 0,
    appliedRows: 0,
    conflicts: push.response.conflicts,
    moreToPush: push.moreToPush,
    pushedDeletes: push.pushedDeletes,
    pushedRows: push.pushedRows,
    serverTime: push.response.serverTime,
    // biome-ignore lint/suspicious/noUnnecessaryConditions: older Workers may omit the field
    skipped: Object.values(push.response.skipped ?? {}).reduce(
      (total, value) => total + (value ?? 0),
      0
    ),
  };
}

/**
 * Adopts the cloud copy (§6.4 option 2). Backs up first, then clears and
 * refills from the cloud, then reconciles the push cursors so the mirror is not
 * uploaded back. A failed backup throws before anything is cleared.
 */
async function runCloudStrategyPass(input: {
  current: SyncSettings;
  db: SyncDatabase;
  onBackup?: (info: SyncBackupInfo) => void;
  queryClient: QueryClient;
}): Promise<SyncRunResult> {
  const { current, db, queryClient, onBackup } = input;
  const deviceId = await ensureDeviceId(db);
  // Refuse before anything is cleared if the cloud cannot be reached (§7.6):
  // emptying the local tables and then failing to refill them would be the one
  // data-loss path this whole flow exists to prevent.
  if ((await cloudStatusOrNull(current)) === null) {
    throw new SyncFailure(
      "The cloud is unreachable, so this device's copy cannot be replaced",
      "offline"
    );
  }
  onBackup?.(await backupSyncedTables(db));
  await clearSyncedTables(db);
  await writePullCursors(db, { deleted: "", rows: {} });
  const pull = await pullRemoteChanges({
    db,
    deviceId,
    endpoint: current.endpoint,
    fetchImpl: globalThis.fetch.bind(globalThis),
    limit: current.queueMaxSize,
    token: current.token || undefined,
  });
  await reconcilePushCursors(db);

  if (pull.appliedRows + pull.appliedDeletes > 0) {
    queryClient.invalidateQueries();
    const { notifyRequestsChanged } = await import(
      "@/features/requests/persistence"
    );
    notifyRequestsChanged();
  }
  if (pull.conflicts.length > 0) {
    await auditConflicts(db, pull.conflicts);
  }
  return {
    appliedDeletes: pull.appliedDeletes,
    appliedRows: pull.appliedRows,
    conflicts: pull.conflicts,
    moreToPush: false,
    pushedDeletes: 0,
    pushedRows: 0,
    serverTime: pull.serverTime,
    skipped: pull.skipped,
  };
}

/**
 * True when every synced table is empty.
 *
 * A table this build does not have locally (a pre-migration database) counts as
 * empty rather than as an error, which is the tolerance §7.10 asks for: the
 * decision must not crash on a database older than the sync metadata.
 */
async function isLocalEmpty(db: SyncDatabase): Promise<boolean> {
  for (const table of SYNC_TABLE_NAMES) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: eight fixed tables, sequential counts
      if ((await countRows(db, table)) > 0) {
        return false;
      }
    } catch {
      // Missing table → treated as empty.
    }
  }
  return true;
}

/** The cloud's status, or `null` when the server cannot be reached. */
async function cloudStatusOrNull(
  current: SyncSettings
): Promise<SyncStatusResponse | null> {
  try {
    return await fetchSyncStatus({
      endpoint: current.endpoint,
      fetchImpl: globalThis.fetch.bind(globalThis),
      token: current.token || undefined,
    });
  } catch {
    return null;
  }
}

/** True only when the cloud answered and holds at least one row. */
function cloudHasData(status: SyncStatusResponse | null): boolean {
  return (
    status !== null &&
    Object.values(status.counts).some((count) => (count ?? 0) > 0)
  );
}

/** What a first run against an endpoint (no remembered strategy) should do. */
type FirstRunPlan =
  | { kind: "ask"; decision: SyncDecisionState }
  | { kind: "idle" }
  | { kind: "merge" }
  | { kind: "pull-only" }
  | { kind: "push-only" };

/**
 * Classifies one first run against §6.1, kept out of `syncNow` so that callback
 * stays a readable guard-and-report shell (the provider's busiest callback).
 */
async function planFirstRun(input: {
  current: SyncSettings;
  db: SyncDatabase;
}): Promise<FirstRunPlan> {
  const localHasData = !(await isLocalEmpty(input.db));
  const status = await cloudStatusOrNull(input.current);
  // The cloud's state is unknown (status failed). Run the ordinary merge
  // rather than infer an authority from an absent answer.
  if (status === null && localHasData) {
    return { kind: "merge" };
  }
  const situation = classifySyncSituation({
    cloudHasData: cloudHasData(status),
    localHasData,
  });
  if (situation === "idle") {
    return { kind: "idle" };
  }
  if (situation === "pull-only") {
    return { kind: "pull-only" };
  }
  if (situation === "push-only") {
    return { kind: "push-only" };
  }
  return {
    decision: {
      cloudCounts: status?.counts ?? {},
      cloudTotals: status?.totals ?? {},
      endpoint: input.current.endpoint,
      localCounts: await countAllRows(input.db),
    },
    kind: "ask",
  };
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
  // A failed run still moved something: the push half may have advanced its
  // cursors before the pull half threw, and the pull may have adopted rows
  // before the row that failed. Without this the queue depth stays frozen at
  // whatever the last successful run counted, so "46 waiting" outlives the
  // backlog it described and sends the operator after changes that are gone.
  await handlers.refreshPending();
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
  const [decision, setDecision] = useState<SyncDecisionState | null>(null);
  const [backup, setBackup] = useState<SyncBackupInfo | null>(null);

  const runningRef = useRef<RunLock>(createRunLock());
  const settingsRef = useRef<SyncSettings | null>(null);
  const lastRunAtRef = useRef(0);

  const setSettingsBoth = useCallback((next: SyncSettings) => {
    settingsRef.current = next;
    setSettings(next);
  }, []);

  /** Runs the pass a remembered or newly chosen strategy calls for. */
  const runStrategyPass = useCallback(
    (
      strategy: SyncStrategy,
      input: {
        current: SyncSettings;
        db: SyncDatabase;
        queryClient: QueryClient;
      }
    ): Promise<SyncRunResult> =>
      strategy === "cloud"
        ? runCloudStrategyPass({ ...input, onBackup: setBackup })
        : runEnginePass({
            ...input,
            preferLocal: strategy === "local",
          }),
    []
  );

  /** Records the implicit `merge` once a non-overlap first run has succeeded. */
  const rememberEndpointStrategy = useCallback(
    async (current: SyncSettings, strategy: SyncStrategy) => {
      const next = await saveSyncSettings({
        endpointStrategies: rememberStrategy(
          current.endpointStrategies,
          current.endpoint,
          strategy
        ),
      });
      setSettingsBoth(next);
    },
    [setSettingsBoth]
  );

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

  /** Re-reads the latest automatic backup, for the Status tab. */
  const refreshBackup = useCallback(async () => {
    const db = await openDb();
    if (!db) {
      return;
    }
    try {
      setBackup(await readLatestBackup(db));
    } catch {
      // A database from before migration 0014 has no sync_state to read.
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

  /**
   * One run's decision: a remembered strategy, else the §6.1 first-run plan.
   * Extracted so `syncNow` stays a readable guard-and-report shell.
   */
  const runOnce = useCallback(
    async (input: {
      current: SyncSettings;
      db: SyncDatabase;
      handlers: SyncReportHandlers;
      queryClient: QueryClient;
      silent: boolean;
    }): Promise<SyncRunResult | null> => {
      const { current, db, handlers, silent } = input;
      // A remembered decision runs silently (D7) — the operator already
      // answered this endpoint's overlap question.
      const remembered = strategyForEndpoint(
        current.endpointStrategies,
        current.endpoint
      );
      if (remembered) {
        const result = await runStrategyPass(remembered, {
          current,
          db,
          queryClient: input.queryClient,
        });
        await reportSyncSuccess(result, silent, handlers);
        return result;
      }

      const plan = await planFirstRun({ current, db });
      if (plan.kind === "idle") {
        setPhase("idle");
        return null;
      }
      if (plan.kind === "ask") {
        // Both sides hold records and nothing is remembered: ask before any
        // data moves (D1, D4). No push, no pull happens until the operator
        // answers.
        setDecision(plan.decision);
        setPhase("idle");
        return null;
      }

      // §6.2: a first run against an endpoint must not resume from a stale
      // pull cursor, whatever the strategy turns out to be. `runPullOnlyPass`
      // resets it anyway; the engine pass needs the reset done here.
      await writePullCursors(db, { deleted: "", rows: {} });
      // `pull-only` is the guaranteed full pull (D13); `push-only` and the
      // unknown-cloud `merge` fall through to the ordinary engine pass.
      const result =
        plan.kind === "pull-only"
          ? await runPullOnlyPass({
              current,
              db,
              queryClient: input.queryClient,
            })
          : await runEnginePass({
              current,
              db,
              queryClient: input.queryClient,
            });
      await reportSyncSuccess(result, silent, handlers);
      // A non-overlap first run is remembered as `merge` so the next run — now
      // that both sides hold records — does not surprise the operator with the
      // chooser.
      if (plan.kind === "pull-only" || plan.kind === "push-only") {
        await rememberEndpointStrategy(current, "merge");
      }
      return result;
    },
    [rememberEndpointStrategy, runStrategyPass]
  );

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
        return await runOnce({ current, db, handlers, queryClient, silent });
      } catch (error) {
        await reportSyncFailure(error, silent, handlers);
        return null;
      } finally {
        runningRef.current.running = false;
      }
    },
    [
      openDb,
      queryClient,
      refreshPending,
      refreshServerStatus,
      runOnce,
      setSettingsBoth,
    ]
  );

  /**
   * Builds a manual one-direction run (pull or push) on the shared
   * guard-and-report shell. One run at a time via `runningRef`.
   */
  const runManual = useCallback(
    async (
      run: (input: {
        current: SyncSettings;
        db: SyncDatabase;
        queryClient: QueryClient;
      }) => Promise<SyncRunResult>
    ): Promise<SyncRunResult | null> => {
      const { current } = settingsRef;
      if (!(current?.enabled && current.endpoint)) {
        return null;
      }
      if (runningRef.current.running) {
        return null;
      }
      if (isOffline()) {
        setPhase("offline");
        return null;
      }
      runningRef.current.running = true;
      setPhase("syncing");
      lastRunAtRef.current = Date.now();
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
        const result = await run({ current, db, queryClient });
        await reportSyncSuccess(result, false, handlers);
        return result;
      } catch (error) {
        await reportSyncFailure(error, false, handlers);
        return null;
      } finally {
        runningRef.current.running = false;
      }
    },
    [openDb, queryClient, refreshPending, refreshServerStatus, setSettingsBoth]
  );

  const pullNow = useCallback(() => runManual(runPullPass), [runManual]);

  const pushNow = useCallback(
    () => runManual(({ current, db }) => runPushPass({ current, db })),
    [runManual]
  );

  /**
   * Resolves the chooser: remembers the choice for this endpoint, then runs it.
   * Persisting first means the run sees a remembered strategy, and a failed run
   * does not ask again for a decision the operator already made.
   */
  const chooseStrategy = useCallback(
    async (strategy: SyncStrategy): Promise<SyncRunResult | null> => {
      const { current } = settingsRef;
      if (!(current?.enabled && current.endpoint)) {
        return null;
      }
      await rememberEndpointStrategy(current, strategy);
      setDecision(null);
      return runManual(async (input) => {
        // The first run under a freshly chosen strategy is a first connection:
        // reset the pull cursors so it cannot skip cloud data below a stale
        // cursor (§6.2). A later remembered run resumes normally.
        await writePullCursors(input.db, { deleted: "", rows: {} });
        return runStrategyPass(strategy, input);
      });
    },
    [rememberEndpointStrategy, runManual, runStrategyPass]
  );

  const dismissDecision = useCallback(() => setDecision(null), []);

  const restoreBackup = useCallback(async () => {
    const db = await openDb();
    if (!db) {
      return;
    }
    try {
      const restored = await restoreSyncedTables(db);
      if (!restored) {
        toast.error("No sync backup to restore");
        return;
      }
      await queryClient.invalidateQueries();
      const { notifyRequestsChanged } = await import(
        "@/features/requests/persistence"
      );
      notifyRequestsChanged();
      await refreshPending();
      toast.success("Sync backup restored");
    } catch (error) {
      toast.error("Restore failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [openDb, queryClient, refreshPending]);

  const update = useCallback(
    async (patch: Partial<SyncSettings>) => {
      const next = await saveSyncSettings(patch);
      setSettingsBoth(next);
      if (patch.endpoint !== undefined) {
        setServerStatus(null);
        await refreshServerStatus();
      }
      setPhase(next.enabled && next.endpoint ? "idle" : "disabled");
      if (next.enabled && next.endpoint) {
        // Every run — first connection included — now classifies the state and
        // decides (§6.1) instead of blindly pulling or pushing.
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
      await refreshBackup();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBackup, refreshPending, setSettingsBoth]);

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

  // Sync on app close: push pending changes when window close is requested.
  // This uses Tauri's window close event which allows async operations to complete.
  useEffect(() => {
    if (!(settings?.enabled && settings.endpoint)) {
      return;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const off = await listen("tauri://close-requested", async () => {
          if (cancelled) {
            return;
          }
          // Check pending count at close time, not from stale closure
          const db = await openDb();
          if (!db) {
            return;
          }
          try {
            const cursors = await readCursors(db);
            const counts = await pendingChangeCount(db, cursors.push);
            if (counts.rows + counts.deletes === 0) {
              return;
            }
            // Push pending changes before allowing close
            await pushNow().catch(() => undefined);
          } catch {
            // If checking fails, just allow close
          }
        });
        if (cancelled) {
          off();
        } else {
          unlisten = off;
        }
      } catch {
        // browser preview — no Tauri events
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [openDb, pushNow, settings?.enabled, settings?.endpoint]);

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
      backup,
      chooseStrategy,
      decision,
      dismissDecision,
      lastResult,
      pending,
      phase,
      pullNow,
      pushNow,
      refreshServerStatus,
      resolved,
      restoreBackup,
      serverStatus,
      syncNow,
      tables: SYNC_TABLE_NAMES,
      update,
    }),
    [
      active,
      backup,
      chooseStrategy,
      decision,
      dismissDecision,
      lastResult,
      pending,
      phase,
      pullNow,
      pushNow,
      refreshServerStatus,
      resolved,
      restoreBackup,
      serverStatus,
      syncNow,
      update,
    ]
  );

  return (
    <SyncContext.Provider value={value}>
      {children}
      <SyncStrategyDialog
        decision={decision}
        onChoose={chooseStrategy}
        onDismiss={dismissDecision}
      />
    </SyncContext.Provider>
  );
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
