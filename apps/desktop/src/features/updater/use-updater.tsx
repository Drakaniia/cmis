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
import {
  getBlockingModalCount,
  subscribeBlockingModal,
} from "./blocking-modal-gate";
import {
  DEFAULT_UPDATER_SETTINGS,
  UPDATER_TOAST_ID,
  type UpdaterSettings,
  type UpdaterState,
  type UpdaterStatus,
} from "./types";
import {
  dismissUpdaterToast,
  showAvailableToast,
  showCheckingToast,
  showDownloadingToast,
  showErrorToast,
  showReadyToast,
  showUpToDateToast,
} from "./update-toasts";
import { loadUpdaterSettings, saveUpdaterSettings } from "./updater-settings";

// Tauri updater types are dynamic — we lazy-import to keep browser dev working
interface TauriUpdate {
  body?: string | null;
  date?: string | null;
  downloadAndInstall: (
    onEvent?: (e: { event: string; data: unknown }) => void
  ) => Promise<void>;
  version: string;
}

let devGuard = false;
try {
  // import.meta.env.DEV is replaced by Vite at build time
  devGuard =
    (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
} catch {
  devGuard = false;
}

interface UpdaterContextValue extends UpdaterState {
  checkNow: (opts?: { silent?: boolean }) => Promise<void>;
  dismiss: () => void;
  downloadNow: () => Promise<void>;
  notes: string | null;
  progress: number | null;
  restartNow: () => Promise<void>;
  setAutoCheck: (v: boolean) => Promise<void>;
  setAutoDownload: (v: boolean) => Promise<void>;
  settings: UpdaterSettings;
}

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

export function useUpdater(): UpdaterContextValue {
  const v = useContext(UpdaterContext);
  if (!v) {
    throw new Error("useUpdater must be used within UpdaterProvider");
  }
  return v;
}

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UpdaterSettings>(
    DEFAULT_UPDATER_SETTINGS
  );
  const [state, setState] = useState<UpdaterState>({
    availableVersion: null,
    currentVersion: null,
    error: null,
    notes: null,
    progress: null,
    status: "idle",
  });
  const pendingUpdateRef = useRef<TauriUpdate | null>(null);
  const deferredReadyRef = useRef(false);
  const notesRef = useRef<string | null>(null);
  const versionRef = useRef<string | null>(null);

  // Load current version + settings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) {
          versionRef.current = v;
          setState((s) => ({ ...s, currentVersion: v }));
        }
      } catch {
        // not in Tauri (browser dev) — use package version fallback
        if (!cancelled) {
          setState((s) => ({ ...s, currentVersion: "0.1.0" }));
        }
      }
      try {
        const s = await loadUpdaterSettings();
        if (!cancelled) {
          setSettings(s);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAutoCheck = useCallback(async (v: boolean) => {
    const next = await saveUpdaterSettings({ autoCheckOnStartup: v });
    setSettings(next);
    toast.success(v ? "Auto-check enabled" : "Auto-check disabled", {
      id: "updater-pref",
    });
  }, []);

  const setAutoDownload = useCallback(async (v: boolean) => {
    const next = await saveUpdaterSettings({ autoDownload: v });
    setSettings(next);
    toast.success(v ? "Auto-download enabled" : "Auto-download disabled", {
      id: "updater-pref",
    });
  }, []);

  const dismiss = useCallback(() => {
    deferredReadyRef.current = false;
    pendingUpdateRef.current = null;
    setState((s) => ({ ...s, error: null, progress: null, status: "idle" }));
    dismissUpdaterToast();
  }, []);

  const restartNow = useCallback(async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      showErrorToast(
        "Couldn't restart",
        e instanceof Error ? e.message : String(e)
      );
    }
  }, []);

  const doDownload = useCallback(async () => {
    const update = pendingUpdateRef.current;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome infers `current` from useRef's initial value; this ref holds the update checkNow stored
    if (!update) {
      return;
    }
    setState((s) => ({
      ...s,
      error: null,
      progress: 0,
      status: "downloading",
    }));
    showDownloadingToast(0);
    let totalBytes: number | null = null;
    let downloaded = 0;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: updater event funnel
    const handleEvent = (evt: { event: string; data: unknown }) => {
      const d = evt.data as Record<string, unknown>;
      if (evt.event === "Started") {
        totalBytes =
          typeof d.contentLength === "number"
            ? (d.contentLength as number)
            : null;
        setState((s) => ({ ...s, progress: 0 }));
        showDownloadingToast(0);
      } else if (evt.event === "Progress") {
        const chunk =
          typeof d.chunkLength === "number" ? (d.chunkLength as number) : 0;
        downloaded += chunk;
        const pct = totalBytes
          ? Math.min(99, Math.round((downloaded / totalBytes) * 100))
          : 0;
        setState((s) => ({ ...s, progress: pct }));
        showDownloadingToast(pct);
      } else if (evt.event === "Finished") {
        setState((s) => ({ ...s, progress: 100 }));
        // Defer ready toast if a blocking modal is open
        if (getBlockingModalCount() > 0) {
          deferredReadyRef.current = true;
          setState((s) => ({ ...s, status: "ready" }));
          dismissUpdaterToast();
          // keep toast dismissed until modal closes — effect below will show it
          return;
        }
        setState((s) => ({ ...s, progress: 100, status: "ready" }));
        showReadyToast({
          onLater: () => {
            deferredReadyRef.current = false;
            dismissUpdaterToast();
            setState((s) => ({ ...s, progress: null, status: "idle" }));
          },
          // Tauri relaunch is fire-and-forget so the toast closes immediately
          onRestart: () => {
            restartNow().catch(() => undefined);
          },
        });
      }
    };

    try {
      await update.downloadAndInstall(handleEvent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, error: msg, status: "error" }));
      showErrorToast("Download failed", msg);
    }
  }, [restartNow]);

  const downloadNow = useCallback(async () => {
    await doDownload();
  }, [doDownload]);

  const checkNow = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrator check flow per spec §3.1-§3.8
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      // Dev has no Tauri updater plugin, but an explicit check must still give
      // feedback — otherwise the Help/Settings action looks broken.
      if (devGuard) {
        if (!silent) {
          showUpToDateToast(
            versionRef.current ?? state.currentVersion ?? "0.0.0"
          );
        }
        return;
      }
      if (state.status === "checking") {
        return;
      }

      setState((s) => ({ ...s, error: null, status: "checking" }));
      if (!silent) {
        showCheckingToast();
      }

      let update: TauriUpdate | null = null;
      let currentVersion = versionRef.current;
      try {
        if (!currentVersion) {
          try {
            const { getVersion } = await import("@tauri-apps/api/app");
            currentVersion = await getVersion();
            versionRef.current = currentVersion;
            setState((s) => ({ ...s, currentVersion }));
          } catch {
            currentVersion = "0.1.0";
          }
        }
        const mod = await import("@tauri-apps/plugin-updater");
        // Tauri's JS API exports `check` (v2.11 docs)
        const checkFn = (
          mod as unknown as { check: () => Promise<TauriUpdate | null> }
        ).check;
        if (typeof checkFn !== "function") {
          throw new Error("updater plugin not available");
        }
        update = await checkFn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, error: msg, status: "error" }));
        if (silent) {
          // silent launch failure: optionally log, but don't toast
          try {
            toast.dismiss(UPDATER_TOAST_ID);
          } catch {
            // ignore
          }
        } else {
          showErrorToast(
            "Couldn't check for updates — check your internet connection",
            msg
          );
        }
        // persist lastCheckedAt even on failure for manual path
        if (!silent) {
          const ts = new Date().toISOString();
          const next = await saveUpdaterSettings({ lastCheckedAt: ts });
          setSettings(next);
        }
        return;
      }

      const ts = new Date().toISOString();
      const nextSettings = await saveUpdaterSettings({ lastCheckedAt: ts });
      setSettings(nextSettings);

      if (!update) {
        setState((s) => ({
          ...s,
          availableVersion: null,
          notes: null,
          progress: null,
          status: "up-to-date",
        }));
        if (silent) {
          toast.dismiss(UPDATER_TOAST_ID);
          setState((s) =>
            s.status === "up-to-date" ? { ...s, status: "idle" } : s
          );
        } else {
          const ver = currentVersion ?? "unknown";
          showUpToDateToast(ver);
          // auto-reset to idle after a short delay so button re-enables
          setTimeout(
            () =>
              setState((s) =>
                s.status === "up-to-date" ? { ...s, status: "idle" } : s
              ),
            3000
          );
        }
        return;
      }

      pendingUpdateRef.current = update;
      notesRef.current = (update.body as string | null) ?? null;
      setState((s) => ({
        ...s,
        availableVersion: update.version,
        error: null,
        notes: notesRef.current,
        progress: null,
        status: "available",
      }));

      if (nextSettings.autoDownload) {
        await doDownload();
      } else if (silent) {
        // silent launch with autoDownload OFF: show non-blocking "Version X available" toast
        // spec says available toast is informational and does NOT need deferral
        showAvailableToast(update.version, {
          onDownload: () => {
            doDownload().catch(() => undefined);
          },
          onViewNotes: () => {
            // handled by Updates tab
          },
        });
      } else {
        showAvailableToast(update.version, {
          onDownload: () => {
            doDownload().catch(() => undefined);
          },
          onViewNotes: () => {
            // notes modal is handled by Updates tab; keep toast open
          },
        });
      }
    },
    [doDownload, state.currentVersion, state.status]
  );

  // Deferred ready-toast: when blocking modal closes, show the queued ready toast
  useEffect(
    () =>
      subscribeBlockingModal(() => {
        if (
          // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome infers `current` from useRef's initial value; this ref is set when a download finishes behind a modal
          deferredReadyRef.current &&
          getBlockingModalCount() === 0 &&
          state.status === "ready"
        ) {
          deferredReadyRef.current = false;
          showReadyToast({
            onLater: () => {
              dismissUpdaterToast();
              setState((s) => ({ ...s, progress: null, status: "idle" }));
            },
            onRestart: () => {
              restartNow().catch(() => undefined);
            },
          });
        }
      }),
    [state.status, restartNow]
  );

  // Launch check 5s after mount (spec §3.1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once after version/settings become available; checkNow intentionally not a dep to avoid loop
  useEffect(() => {
    if (devGuard) {
      return;
    }
    if (!settings.autoCheckOnStartup) {
      return;
    }
    if (!state.currentVersion) {
      return;
    }
    if (state.status !== "idle") {
      return;
    }
    const t = window.setTimeout(() => {
      checkNow({ silent: true }).catch(() => undefined);
    }, 5000);
    return () => window.clearTimeout(t);
    // only run once after version/settings become available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoCheckOnStartup, state.currentVersion]);

  const value = useMemo<UpdaterContextValue>(
    () => ({
      availableVersion: state.availableVersion,
      checkNow,
      currentVersion: state.currentVersion,
      dismiss,
      downloadNow,
      error: state.error,
      notes: state.notes,
      progress: state.progress,
      restartNow,
      setAutoCheck,
      setAutoDownload,
      settings,
      status: state.status as UpdaterStatus,
    }),
    [
      state,
      checkNow,
      dismiss,
      downloadNow,
      restartNow,
      setAutoCheck,
      setAutoDownload,
      settings,
    ]
  );

  return (
    <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>
  );
}

export function useUpdaterOptional(): UpdaterContextValue | null {
  return useContext(UpdaterContext);
}
