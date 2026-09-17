import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { DesktopMenubar } from "./menubar/menubar";

/**
 * Desktop window title bar — grey chrome that matches the header
 * (`surface-frosted`) and sidebar (`material-sidebar`).
 *
 * Uses the same structural material as the sidebar so the three
 * chrome surfaces read as one continuous grey shell:
 *   titlebar (top) + sidebar (left) + header (content top)
 *
 * `decorations: false` in `tauri.conf.json` hides the native OS
 * chrome; this component provides drag + window controls.
 * It keeps `data-tauri-drag-region` for native drag and also
 * calls `startDragging()` on mousedown as a fallback (required
 * when `withGlobalTauri` is false and for WebView2).
 */
export function TitleBar({
  onToggleSidebar,
}: {
  onToggleSidebar?: () => void;
}) {
  const [isMaximized, setIsMaximized] = useState(false);

  const syncMaximized = useCallback(async () => {
    try {
      const m = await getCurrentWindow().isMaximized();
      setIsMaximized(m);
    } catch {
      // not in Tauri preview — ignore
    }
  }, []);

  useEffect(() => {
    syncMaximized().catch(() => {
      // ignore — not in Tauri preview
    });

    const handleFocus = () => {
      syncMaximized().catch(() => {
        // ignore — not in Tauri preview
      });
    };
    window.addEventListener("focus", handleFocus);

    // Tauri window resize/maximize events — keep icon in sync when
    // user maximizes via OS snap, double-click, or Win+Up.
    let unlistenResized: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const win = getCurrentWindow();
        // onResized is the idiomatic Tauri v2 helper; fallback to
        const maybeOnResized = (
          win as unknown as {
            onResized?: (cb: () => void) => Promise<() => void>;
          }
        ).onResized;
        if (maybeOnResized) {
          const off = await maybeOnResized.call(win, () => {
            if (!cancelled) {
              syncMaximized().catch(() => {
                // ignore — not in Tauri
              });
            }
          });
          if (cancelled) {
            off();
          } else {
            unlistenResized = off;
          }
        } else {
          const { listen } = await import("@tauri-apps/api/event");
          const off = await listen("tauri://resize", () => {
            if (!cancelled) {
              syncMaximized().catch(() => {
                // ignore — not in Tauri
              });
            }
          });
          if (cancelled) {
            off();
          } else {
            unlistenResized = off;
          }
        }
      } catch {
        // browser preview — no window events
      }
    })();

    // also watch DOM resize as cheap fallback
    window.addEventListener("resize", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("resize", handleFocus);
      unlistenResized?.();
    };
  }, [syncMaximized]);

  const handleDragMouseDown = useCallback(async (event: React.MouseEvent) => {
    // only left-drag on the drag region itself, not on buttons/menubar
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("[role='menubar']") ||
      target.closest("[role='menu']") ||
      target.closest("[data-menubar-root]") ||
      target.closest("[data-menubar-popup]")
    ) {
      return;
    }
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // browser preview — no-op
    }
  }, []);

  const handleMinimize = useCallback(async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("[TitleBar] minimize failed", error);
    }
  }, []);

  const handleMaximize = useCallback(async () => {
    try {
      await getCurrentWindow().toggleMaximize();
      await syncMaximized();
    } catch (error) {
      console.error("[TitleBar] toggleMaximize failed", error);
      try {
        const m = await getCurrentWindow().isMaximized();
        if (m) {
          await getCurrentWindow().unmaximize();
        } else {
          await getCurrentWindow().maximize();
        }
        await syncMaximized();
      } catch (fallbackError) {
        console.error("[TitleBar] maximize fallback failed", fallbackError);
      }
    }
  }, [syncMaximized]);

  const handleClose = useCallback(async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("[TitleBar] close failed", error);
    }
  }, []);

  const handleDoubleClick = useCallback(
    async (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("[role='menubar']") ||
        target.closest("[role='menu']")
      ) {
        return;
      }
      await handleMaximize();
    },
    [handleMaximize]
  );

  const noopToggle = useCallback(() => {
    onToggleSidebar?.();
  }, [onToggleSidebar]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Tauri drag region requires mouse handlers on header
    <header
      className="titlebar flex h-8 shrink-0 select-none items-center justify-between border-border/70 border-b pr-0 pl-2"
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleDragMouseDown}
    >
      {/* Left — Apple §7 menubar only (logo removed per user request) */}
      <div className="flex min-w-0 flex-1 items-center">
        <DesktopMenubar onToggleSidebar={noopToggle} />
      </div>

      {/* Right — window controls (functional inside Tauri, no-op in browser) */}
      <div className="flex shrink-0 items-center">
        <button
          aria-label="Minimize"
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]"
          onClick={handleMinimize}
          type="button"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          aria-label={isMaximized ? "Restore" : "Maximize"}
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]"
          onClick={handleMaximize}
          type="button"
        >
          {isMaximized ? (
            <Copy className="size-3" />
          ) : (
            <Square className="size-3" />
          )}
        </button>
        <button
          aria-label="Close"
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
          onClick={handleClose}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </header>
  );
}
