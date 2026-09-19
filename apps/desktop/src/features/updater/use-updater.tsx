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
  devGuard =
    (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
} catch {
  devGuard = false;
}

const UPDATER_ENDPOINT =
  "https://github.com/Drakaniia/cmis/releases/latest/download/latest.json";

const VERSION_PREFIX_RE = /^v/;

function compareVersions(a: string, b: string): number {
  const pa = a.replace(VERSION_PREFIX_RE, "").split(".").map(Number);
  const pb = b.replace(VERSION_PREFIX_RE, "").split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) {
      return 1;
    }
    if (av < bv) {
      return -1;
    }
  }
  return 0;
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
      // Dev / browser has no Tauri updater plugin. Previously this faked
      // "up to date" which hid real releases (1.5.0 vs local 1.2.0).
      // Now we do a real fetch of latest.json so Check for Updates works in dev.
      if (devGuard) {
        if (state.status === "checking") {
          return;
        }
        setState((s) => ({ ...s, error: null, status: "checking" }));
        if (!silent) {
          showCheckingToast();
        }
        let currentVersion = versionRef.current ?? state.currentVersion;
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
        try {
          const res = await fetch(UPDATER_ENDPOINT, { cache: "no-store" });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
          }
          const data = (await res.json()) as {
            notes?: string;
            pub_date?: string;
            version?: string;
          };
          const latest = (data.version ?? "").replace(VERSION_PREFIX_RE, "");
          if (!latest) {
            throw new Error("latest.json missing version field");
          }
          const ts = new Date().toISOString();
          const nextSettings = await saveUpdaterSettings({
            lastCheckedAt: ts,
          });
          setSettings(nextSettings);

          if (compareVersions(latest, currentVersion ?? "0.0.0") <= 0) {
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
              showUpToDateToast(currentVersion ?? "unknown");
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

          // Update available (dev preview — can't download installer from browser)
          notesRef.current = data.notes ?? null;
          setState((s) => ({
            ...s,
            availableVersion: latest,
            error: null,
            notes: notesRef.current,
            progress: null,
            status: "available",
          }));
          if (silent) {
            showAvailableToast(latest, {
              onDownload: () => {
                toast.info("Download requires the installed Tauri app", {
                  description: `v${latest} is available on GitHub Releases. Install the desktop build to update.`,
                });
              },
              onViewNotes: () => {
                // handled by Updates tab
              },
            });
          } else {
            showAvailableToast(latest, {
              onDownload: () => {
                toast.info("Download requires the installed Tauri app", {
                  description: `v${latest} is available on GitHub Releases.`,
                });
              },
              onViewNotes: () => {
                // handled by Updates tab
              },
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setState((s) => ({ ...s, error: msg, status: "error" }));
          if (silent) {
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
          if (!silent) {
            const ts = new Date().toISOString();
            const next = await saveUpdaterSettings({ lastCheckedAt: ts });
            setSettings(next);
          }
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
