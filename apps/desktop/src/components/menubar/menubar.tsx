"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@cmis/ui/components/menubar";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import {
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useHelpDialogs } from "@/features/help/help-dialogs-context";
import { useQuickDeductDialog } from "@/features/inventory/quick-deduct-dialog-context";
import { useNewRequestDialog } from "@/features/requests/new-request-dialog-context";
import { useUpdaterOptional } from "@/features/updater/use-updater";
import { isTauriRuntime, openExternal } from "@/lib/open-external";
import { acceptsTypedText } from "@/lib/typed-text";

import { AboutModal } from "./about-modal";
import {
  MENUS,
  type MenuAction,
  type MenuDef,
  type MenuItemDef,
} from "./menu-config";
import { ShortcutsModal } from "./shortcuts-modal";
import { initZoomFromStorage } from "./use-menu-actions";

/**
 * Apple Design §1/3/4/7/12/14 — Desktop menubar inside the custom TitleBar.
 * - Response on pointer-down (Base UI trigger highlight instant)
 * - Interruptible: only one menu open at a time; hover switches target instantly
 * - Springs are CSS `data-open/data-closed` with 100ms fade/zoom; reduced-motion uses fade only
 * - Spatially anchored: each popup `side=bottom align=start` from its trigger
 * - Material: dropdown uses popover + ring + translucent
 * - Typography: triggers -0.01em tighter at 12px; items 13px
 */

type OpenMenuSetter = Dispatch<SetStateAction<string | null>>;

interface MenuDispatchContext {
  navigate: ReturnType<typeof useNavigate>;
  onToggleSidebar: () => void;
  openNewRequest: () => void;
  openQuickDeduct: () => void;
  openReportIssue: () => void;
  setAboutOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setTheme: (theme: string) => void;
  updater: ReturnType<typeof useUpdaterOptional>;
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return (
    navigator.platform.toLowerCase().includes("mac") ||
    navigator.userAgent.toLowerCase().includes("mac")
  );
}

function getZoom(): number {
  try {
    const raw = window.localStorage.getItem("cmis-zoom");
    const n = raw ? Number.parseFloat(raw) : 1;
    return Number.isFinite(n) ? n : 1;
  } catch {
    return 1;
  }
}

function applyZoom(next: number) {
  const clamped = Math.min(1.8, Math.max(0.6, Math.round(next * 10) / 10));
  try {
    window.localStorage.setItem("cmis-zoom", String(clamped));
  } catch {
    // ignore
  }
  document.documentElement.style.zoom = String(clamped);
}

function execClipboard(id: string) {
  try {
    switch (id) {
      case "undo":
        document.execCommand("undo");
        break;
      case "redo":
        document.execCommand("redo");
        break;
      case "cut":
        document.execCommand("cut");
        break;
      case "copy":
        document.execCommand("copy");
        break;
      case "paste":
        document.execCommand("paste");
        break;
      case "select-all":
        document.execCommand("selectAll");
        break;
      default:
        break;
    }
  } catch {
    // ignore
  }
}

/** Stable handler for drag-region wrappers — inline arrows would re-create per render. */
function stopPropagation(event: ReactMouseEvent) {
  event.stopPropagation();
}

function focusTrigger(menuId: string) {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLButtonElement>(`[data-menubar-trigger="${menuId}"]`)
      ?.focus();
  });
}

/** Keys for the window keydown listener — "ctrl+shift+z", "f11", … */
function buildCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("ctrl");
  }
  if (event.metaKey) {
    parts.push("meta");
  }
  if (event.shiftKey) {
    parts.push("shift");
  }
  if (event.altKey) {
    parts.push("alt");
  }
  parts.push(event.key.toLowerCase());
  return parts.join("+");
}

function findAccelerator(
  item: MenuItemDef,
  combo: string
): MenuItemDef | undefined {
  if (item.accelKeys?.includes(combo)) {
    return item;
  }
  return item.submenu?.find((sub) => sub.accelKeys?.includes(combo));
}

/** Runs the first menu item whose accelerator matches. Returns whether it fired. */
function runAccelerator(
  combo: string,
  event: KeyboardEvent,
  dispatchById: (id: string) => Promise<void>,
  setOpenMenuId: OpenMenuSetter
): boolean {
  for (const menu of MENUS) {
    for (const item of menu.items) {
      const match = findAccelerator(item, combo);
      if (match) {
        event.preventDefault();
        dispatchById(match.id).catch(() => undefined);
        setOpenMenuId(null);
        return true;
      }
    }
  }
  return false;
}

/** Alt+<mnemonic> toggles a menubar menu (Windows convention). */
function handleMnemonic(
  event: KeyboardEvent,
  setOpenMenuId: OpenMenuSetter
): boolean {
  const key = event.key.toLowerCase();
  if (!(event.altKey && !event.ctrlKey && !event.metaKey && key.length === 1)) {
    return false;
  }
  const target = MENUS.find((menu) => menu.mnemonic === key);
  if (!target) {
    return false;
  }
  event.preventDefault();
  setOpenMenuId((prev) => (prev === target.id ? null : target.id));
  focusTrigger(target.id);
  return true;
}

/** ←/→ cycles between menus while one is open. */
function handleMenuArrow(
  event: KeyboardEvent,
  openMenuId: string | null,
  setOpenMenuId: OpenMenuSetter
): boolean {
  const isArrow = event.key === "ArrowLeft" || event.key === "ArrowRight";
  if (!(openMenuId && isArrow)) {
    return false;
  }
  const index = MENUS.findIndex((menu) => menu.id === openMenuId);
  if (index === -1) {
    return false;
  }
  event.preventDefault();
  const nextIndex =
    event.key === "ArrowRight"
      ? (index + 1) % MENUS.length
      : (index - 1 + MENUS.length) % MENUS.length;
  const next = MENUS[nextIndex];
  if (!next) {
    return true;
  }
  setOpenMenuId(next.id);
  focusTrigger(next.id);
  return true;
}

async function toggleFullscreen(): Promise<void> {
  const isFullscreen = Boolean(document.fullscreenElement);
  try {
    if (isFullscreen) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // ignore — not allowed or not in Tauri
  }
}

function openTheme(theme: string) {
  document.documentElement.setAttribute("data-theme-pick", theme);
  window.dispatchEvent(new CustomEvent("cmis:theme", { detail: theme }));
}

/** Ctrl/⌘ commands, keyed by the id in `menu-config`. */
const COMMANDS: Record<
  string,
  (ctx: MenuDispatchContext) => void | Promise<void>
> = {
  "check-updates": (ctx) => ctx.updater?.checkNow().catch(() => undefined),
  copy: () => execClipboard("copy"),
  cut: () => execClipboard("cut"),
  paste: () => execClipboard("paste"),
  redo: () => execClipboard("redo"),
  "select-all": () => execClipboard("select-all"),
  "theme-dark": (ctx) => ctx.setTheme("dark"),
  "theme-light": (ctx) => ctx.setTheme("light"),
  "theme-system": (ctx) => ctx.setTheme("system"),
  "toggle-fullscreen": () => toggleFullscreen(),
  "toggle-sidebar": (ctx) => ctx.onToggleSidebar(),
  undo: () => execClipboard("undo"),
  "zoom-in": () => applyZoom(getZoom() + 0.1),
  "zoom-out": () => applyZoom(getZoom() - 0.1),
  "zoom-reset": () => applyZoom(1),
};

const MODALS: Record<string, (ctx: MenuDispatchContext) => void> = {
  about: (ctx) => ctx.setAboutOpen(true),
  "new-request": (ctx) => ctx.openNewRequest(),
  "quick-deduct": (ctx) => ctx.openQuickDeduct(),
  "report-issue": (ctx) => ctx.openReportIssue(),
  shortcuts: (ctx) => ctx.setShortcutsOpen(true),
};

/**
 * The accelerators that must not fire while the user is typing: in a field,
 * Ctrl/⌘+N is a line break, not "new request", and Ctrl/⌘+D is a bookmark and
 * must not open the quick-deduct form over a half-typed word (F1/E12).
 */
const TYPE_SENSITIVE_KEYS = new Set(["ctrl+n", "ctrl+d", "meta+n", "meta+d"]);

/**
 * Window commands. The Tauri window API is imported lazily so the menubar keeps
 * working in a plain browser preview, where the module is not available.
 */
async function runNative(id: string): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (id === "minimize") {
      await win.minimize();
    } else if (id === "maximize") {
      await win.toggleMaximize().catch(async () => {
        const maximized = await win.isMaximized();
        if (maximized) {
          await win.unmaximize();
        } else {
          await win.maximize();
        }
      });
    } else if (id === "close" || id === "exit") {
      await win.close();
    }
  } catch {
    // browser preview
  }
}

async function runAction(
  action: MenuAction,
  ctx: MenuDispatchContext
): Promise<void> {
  switch (action.type) {
    case "navigate":
      ctx.navigate({ to: action.to }).catch(() => undefined);
      return;
    case "command":
      await COMMANDS[action.id]?.(ctx);
      return;
    case "modal":
      MODALS[action.id]?.(ctx);
      return;
    case "external":
      await openExternal(action.href);
      return;
    case "native":
      await runNative(action.id);
      return;
    default:
      return;
  }
}

/** Depth-first search over the menu tree for the action registered under `id`. */
function findAction(id: string): MenuAction | undefined {
  const stack: MenuItemDef[] = MENUS.flatMap((menu) => [...menu.items]);
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) {
      continue;
    }
    if (item.submenu) {
      stack.push(...item.submenu);
    }
    if (item.id === id && item.action) {
      return item.action;
    }
  }
  return undefined;
}

export function DesktopMenubar({
  onToggleSidebar,
}: {
  onToggleSidebar: () => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const updater = useUpdaterOptional();
  const { openReportIssue } = useHelpDialogs();
  const { openNewRequest } = useNewRequestDialog();
  const { openQuickDeduct } = useQuickDeductDialog();

  const [hideOnMac, setHideOnMac] = useState(false);
  useEffect(() => {
    const isMac = isMacPlatform();
    const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
    setHideOnMac(isMac && isTauri);
  }, []);

  useEffect(() => {
    initZoomFromStorage();
    const onTheme = (e: Event) => {
      const { detail } = e as CustomEvent<string>;
      if (detail === "light" || detail === "dark" || detail === "system") {
        setTheme(detail);
      }
    };
    window.addEventListener(
      "cmis:theme" as unknown as string,
      onTheme as EventListener
    );
    return () =>
      window.removeEventListener(
        "cmis:theme" as unknown as string,
        onTheme as EventListener
      );
  }, [setTheme]);

  const dispatchContext = useMemo<MenuDispatchContext>(
    () => ({
      navigate,
      onToggleSidebar,
      openNewRequest,
      openQuickDeduct,
      openReportIssue,
      setAboutOpen,
      setShortcutsOpen,
      setTheme,
      updater,
    }),
    [
      navigate,
      onToggleSidebar,
      openNewRequest,
      openQuickDeduct,
      openReportIssue,
      setTheme,
      updater,
    ]
  );

  /** Walks the menu tree and runs the first item with this id. */
  const dispatchById = useCallback(
    async (id: string) => {
      const action = findAction(id);
      if (action) {
        await runAction(action, dispatchContext);
      }
    },
    [dispatchContext]
  );

  // Bridge native macOS menu -> React actions (Tauri event "menu:action")
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<string>("menu:action", (event) => {
          const mid = event.payload;
          dispatchById(mid).catch(() => undefined);
          setOpenMenuId(null);
        });
      } catch {
        // not in Tauri
      }
    })();
    return () => {
      unlisten?.();
    };
  }, [dispatchById]);

  // In a plain browser tab Ctrl+D is a bookmark — the Tauri shell owns that
  // shortcut natively, but outside it the browser may win even after a bubbling
  // preventDefault. Capture early so the bookmark never fires, then let the
  // normal accelerator dispatch open the modal. The palette (Ctrl+K → "Deduct
  // stock…") remains the fallback when the browser cannot be prevented.
  useEffect(() => {
    if (isTauriRuntime()) {
      return;
    }
    const capture = (event: KeyboardEvent) => {
      const combo = buildCombo(event);
      if (
        (combo === "ctrl+d" || combo === "meta+d") &&
        !acceptsTypedText(event.target)
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, []);

  // Global accelerator + Alt mnemonics
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (handleMnemonic(event, setOpenMenuId)) {
        return;
      }
      if (handleMenuArrow(event, openMenuId, setOpenMenuId)) {
        return;
      }
      if (event.key === "Escape" && openMenuId) {
        setOpenMenuId(null);
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl || event.key === "F11") {
        const combo = buildCombo(event);
        if (TYPE_SENSITIVE_KEYS.has(combo) && acceptsTypedText(event.target)) {
          return;
        }
        runAccelerator(combo, event, dispatchById, setOpenMenuId);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatchById, openMenuId]);

  // Close on click outside, Alt alone toggles first menu (Windows convention)
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (barRef.current?.contains(target)) {
        return;
      }
      const inPopup = target.closest(
        "[data-slot='dropdown-menu-content'], [data-menubar-popup]"
      );
      if (!inPopup) {
        setOpenMenuId(null);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.key !== "Alt" ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest("[role='menubar']")) {
        setOpenMenuId(null);
        active.blur();
        return;
      }
      if (openMenuId) {
        setOpenMenuId(null);
        return;
      }
      const [first] = MENUS;
      if (!first) {
        return;
      }
      setOpenMenuId(first.id);
      focusTrigger(first.id);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [openMenuId]);

  if (hideOnMac) {
    return (
      <>
        <AboutModal onOpenChange={setAboutOpen} open={aboutOpen} />
        <ShortcutsModal onOpenChange={setShortcutsOpen} open={shortcutsOpen} />
      </>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- menubar */}
      <div
        aria-label="Application menu"
        aria-orientation="horizontal"
        className="hidden items-center gap-0.5 sm:flex"
        data-menubar-root
        data-tauri-drag-region="false"
        onMouseDown={stopPropagation}
        ref={barRef}
        role="menubar"
      >
        {MENUS.map((menu) => (
          <DesktopMenu
            dispatchById={dispatchById}
            key={menu.id}
            menu={menu}
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
          />
        ))}
      </div>

      <AboutModal onOpenChange={setAboutOpen} open={aboutOpen} />
      <ShortcutsModal onOpenChange={setShortcutsOpen} open={shortcutsOpen} />
    </>
  );
}

function DesktopMenu({
  dispatchById,
  menu,
  openMenuId,
  setOpenMenuId,
}: {
  dispatchById: (id: string) => Promise<void>;
  menu: MenuDef;
  openMenuId: string | null;
  setOpenMenuId: OpenMenuSetter;
}) {
  const isOpen = openMenuId === menu.id;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpenMenuId(open ? menu.id : null);
    },
    [menu.id, setOpenMenuId]
  );

  const handleTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" && !isOpen) {
        event.preventDefault();
        setOpenMenuId(menu.id);
      }
    },
    [isOpen, menu.id, setOpenMenuId]
  );

  const handleMouseEnter = useCallback(() => {
    if (openMenuId && openMenuId !== menu.id) {
      setOpenMenuId(menu.id);
    }
  }, [menu.id, openMenuId, setOpenMenuId]);

  return (
    <MenubarMenu onOpenChange={handleOpenChange} open={isOpen}>
      <MenubarTrigger
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={menu.label}
        className={isOpen ? "bg-accent text-accent-foreground" : undefined}
        data-menubar-trigger={menu.id}
        data-tauri-drag-region="false"
        onKeyDown={handleTriggerKeyDown}
        onMouseDown={stopPropagation}
        onMouseEnter={handleMouseEnter}
      >
        <span className="pointer-events-none">{menu.label}</span>
      </MenubarTrigger>

      <MenubarContent data-menubar-popup>
        {menu.items.map((item) =>
          item.separatorBefore ? (
            <div key={`${item.id}-wrap`}>
              <MenubarSeparator />
              <MenuItemRow dispatchById={dispatchById} item={item} />
            </div>
          ) : (
            <MenuItemRow
              dispatchById={dispatchById}
              item={item}
              key={item.id}
            />
          )
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}

function MenuItemRow({
  dispatchById,
  item,
}: {
  dispatchById: (id: string) => Promise<void>;
  item: MenuItemDef;
}) {
  const handleSelect = useCallback(() => {
    dispatchById(item.id).catch(() => undefined);
  }, [dispatchById, item.id]);

  if (item.submenu && item.submenu.length > 0) {
    return (
      <MenubarSub>
        <MenubarSubTrigger data-tauri-drag-region="false">
          <span className="flex-1 text-left">{item.label}</span>
        </MenubarSubTrigger>
        <MenubarSubContent>
          {item.submenu.map((sub) => (
            <SubMenuItem key={sub.id} sub={sub} />
          ))}
        </MenubarSubContent>
      </MenubarSub>
    );
  }

  return (
    <MenubarItem
      data-tauri-drag-region="false"
      disabled={item.enabled === false}
      onClick={handleSelect}
      variant={item.variant}
    >
      <span className="flex-1">{item.label}</span>
      {item.accelerator ? (
        <MenubarShortcut>{item.accelerator}</MenubarShortcut>
      ) : null}
    </MenubarItem>
  );
}

function SubMenuItem({ sub }: { sub: MenuItemDef }) {
  const handleClick = useCallback(() => {
    const { action } = sub;
    if (action?.type !== "command" || !action.id.startsWith("theme-")) {
      return;
    }
    openTheme(action.id.replace("theme-", ""));
  }, [sub]);

  return (
    <MenubarItem disabled={sub.enabled === false} onClick={handleClick}>
      <span className="flex-1">{sub.label}</span>
      {sub.accelerator ? (
        <MenubarShortcut>{sub.accelerator}</MenubarShortcut>
      ) : null}
    </MenubarItem>
  );
}
