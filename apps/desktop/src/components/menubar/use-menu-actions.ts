import { useNavigate } from "@tanstack/react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { toast } from "sonner";

import { useUpdaterOptional } from "@/features/updater/use-updater";
import { openExternal } from "@/lib/open-external";
import type { MenuItemDef } from "./menu-config";

const ZOOM_KEY = "cmis-zoom";
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.8;

function getZoom(): number {
  try {
    const raw = window.localStorage.getItem(ZOOM_KEY);
    const n = raw ? Number.parseFloat(raw) : 1;
    return Number.isFinite(n) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) : 1;
  } catch {
    return 1;
  }
}

function applyZoom(next: number) {
  const clamped = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.round(next * 10) / 10)
  );
  try {
    window.localStorage.setItem(ZOOM_KEY, String(clamped));
  } catch {
    // ignore
  }
  document.documentElement.style.zoom = String(clamped);
  // fallback for browsers that ignore zoom (e.g. Firefox)
  if (document.documentElement.style.zoom === "") {
    document.documentElement.style.setProperty("--cmis-zoom", String(clamped));
    document.documentElement.style.fontSize = `${clamped * 100}%`;
  }
}

function execClipboardCommand(id: string) {
  const active = document.activeElement as HTMLElement | null;
  const isEditable =
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active?.isContentEditable ?? false);

  try {
    switch (id) {
      case "undo":
        document.execCommand("undo");
        break;
      case "redo":
        document.execCommand("redo");
        break;
      case "cut":
        if (isEditable) {
          document.execCommand("cut");
        } else {
          // try clipboard write of selection
          const sel = window.getSelection()?.toString();
          if (sel) {
            navigator.clipboard.writeText(sel).catch(() => undefined);
            document.execCommand("cut");
          }
        }
        break;
      case "copy": {
        const sel = window.getSelection()?.toString();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => undefined);
        }
        document.execCommand("copy");
        break;
      }
      case "paste": {
        if (isEditable && navigator.clipboard?.readText) {
          navigator.clipboard
            .readText()
            .then((text) => {
              if (!text) {
                return;
              }
              if (
                active instanceof HTMLInputElement ||
                active instanceof HTMLTextAreaElement
              ) {
                const start = active.selectionStart ?? active.value.length;
                const end = active.selectionEnd ?? active.value.length;
                const before = active.value.slice(0, start);
                const after = active.value.slice(end);
                active.value = before + text + after;
                const pos = start + text.length;
                active.setSelectionRange(pos, pos);
                active.dispatchEvent(new Event("input", { bubbles: true }));
              } else if (active?.isContentEditable) {
                document.execCommand("insertText", false, text);
              }
            })
            .catch(() => {
              document.execCommand("paste");
            });
        } else {
          document.execCommand("paste");
        }
        break;
      }
      case "select-all":
        if (isEditable) {
          if (
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement
          ) {
            active.select();
          } else {
            document.execCommand("selectAll");
          }
        } else {
          document.execCommand("selectAll");
        }
        break;
      default:
        break;
    }
  } catch {
    // browser may block execCommand — ignore
  }
}

export function useMenuActions(opts: {
  onOpenAbout: () => void;
  onOpenReportIssue: () => void;
  onOpenShortcuts: () => void;
  onToggleSidebar: () => void;
}) {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const updater = useUpdaterOptional();

  const handleNavigate = useCallback(
    (to: string) => {
      navigate({ to }).catch(() => undefined);
    },
    [navigate]
  );

  const handleNative = useCallback(async (id: string) => {
    try {
      const win = getCurrentWindow();
      switch (id) {
        case "minimize":
          await win.minimize();
          break;
        case "maximize":
          await win.toggleMaximize().catch(async () => {
            const m = await win.isMaximized();
            if (m) {
              await win.unmaximize();
            } else {
              await win.maximize();
            }
          });
          break;
        case "close":
        case "exit":
          await win.close();
          break;
        default:
          break;
      }
    } catch (e) {
      console.error("[menubar] native action failed", id, e);
    }
  }, []);

  const handleCommand = useCallback(
    async (id: string) => {
      switch (id) {
        case "toggle-sidebar":
          opts.onToggleSidebar();
          break;
        case "zoom-in":
          applyZoom(getZoom() + ZOOM_STEP);
          break;
        case "zoom-out":
          applyZoom(getZoom() - ZOOM_STEP);
          break;
        case "zoom-reset":
          applyZoom(1);
          break;
        case "toggle-fullscreen": {
          const isFs = !!document.fullscreenElement;
          try {
            if (isFs) {
              await document.exitFullscreen();
            } else {
              await document.documentElement.requestFullscreen();
            }
          } catch {
            // ignore — not allowed or not in Tauri
          }
          break;
        }
        case "theme-light":
          setTheme("light");
          break;
        case "theme-dark":
          setTheme("dark");
          break;
        case "theme-system":
          setTheme("system");
          break;
        case "check-updates": {
          if (updater) {
            await updater.checkNow().catch(() => undefined);
          } else {
            toast.info("Updater not available in this preview.");
          }
          break;
        }
        case "undo":
        case "redo":
        case "cut":
        case "copy":
        case "paste":
        case "select-all":
          execClipboardCommand(id);
          break;
        default:
          break;
      }
    },
    [opts, setTheme, updater]
  );

  const handleExternal = useCallback(async (href: string) => {
    await openExternal(href);
  }, []);

  const dispatchItem = useCallback(
    async (item: MenuItemDef) => {
      if (!item.action) {
        return;
      }
      const a = item.action;
      switch (a.type) {
        case "navigate":
          handleNavigate(a.to);
          break;
        case "command":
          await handleCommand(a.id);
          break;
        case "native":
          await handleNative(a.id);
          break;
        case "modal":
          if (a.id === "about") {
            opts.onOpenAbout();
          } else if (a.id === "shortcuts") {
            opts.onOpenShortcuts();
          } else if (a.id === "report-issue") {
            opts.onOpenReportIssue();
          }
          break;
        case "external":
          await handleExternal(a.href);
          break;
        default:
          break;
      }
    },
    [handleCommand, handleExternal, handleNavigate, handleNative, opts]
  );

  // Apply persisted zoom on mount
  // (called from component via useEffect)

  return {
    applyZoom,
    dispatchItem,
    getZoom,
    handleCommand,
    handleExternal,
    handleNative,
    handleNavigate,
  };
}

export function initZoomFromStorage() {
  const z = getZoom();
  if (z !== 1) {
    applyZoom(z);
  }
}
