/**
 * Config-driven menubar definitions — File | Edit | View | Window | Help.
 * Single source of truth for both custom React menubar (Win/Linux) and
 * native macOS menu (Rust). Apple §4/8: purpose + spatial consistency —
 * grouping & mapping mirrors what each control affects.
 */

export type MenuAction =
  | { type: "navigate"; to: string }
  | { type: "command"; id: string }
  | { type: "native"; id: string }
  | { type: "modal"; id: string }
  | { type: "external"; href: string };

export interface MenuItemDef {
  /** accelerator display string, e.g. "Ctrl+," / "⌘," */
  accelerator?: string;
  /** keys for window keydown listener — normalized lower case, e.g. "ctrl+," */
  accelKeys?: string[];
  action?: MenuAction;
  enabled?: boolean;
  id: string;
  label: string;
  separatorBefore?: boolean;
  submenu?: MenuItemDef[];
  variant?: "default" | "destructive";
}

export interface MenuDef {
  id: string;
  items: MenuItemDef[];
  label: string;
  /** Alt+<mnemonic> opens this menu (single char) */
  mnemonic: string;
}

export const MENUS: MenuDef[] = [
  {
    id: "file",
    items: [
      {
        accelerator: "Ctrl+N",
        accelKeys: ["ctrl+n", "meta+n"],
        action: { to: "/admin/requests", type: "navigate" },
        id: "file.new-request",
        label: "New Request…",
      },
      {
        enabled: false,
        id: "file.separator-1",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        action: { to: "/admin/data", type: "navigate" },
        id: "file.import",
        label: "Import…",
      },
      {
        action: { to: "/admin/data", type: "navigate" },
        id: "file.export",
        label: "Export…",
      },
      {
        enabled: false,
        id: "file.separator-2",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        accelerator: "Ctrl+,",
        accelKeys: ["ctrl+,", "meta+,"],
        action: { to: "/admin/settings", type: "navigate" },
        id: "file.settings",
        label: "Settings…",
      },
      {
        enabled: false,
        id: "file.separator-3",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        accelerator: "Ctrl+Q",
        accelKeys: ["ctrl+q", "meta+q"],
        action: { id: "exit", type: "native" },
        id: "file.exit",
        label: "Exit",
      },
    ].filter((i) => i.label !== "—") as MenuItemDef[],
    label: "File",
    mnemonic: "f",
  },
  {
    id: "edit",
    items: [
      {
        accelerator: "Ctrl+Z",
        accelKeys: ["ctrl+z", "meta+z"],
        action: { id: "undo", type: "command" },
        id: "edit.undo",
        label: "Undo",
      },
      {
        accelerator: "Ctrl+Shift+Z",
        accelKeys: ["ctrl+shift+z", "meta+shift+z", "ctrl+y", "meta+y"],
        action: { id: "redo", type: "command" },
        id: "edit.redo",
        label: "Redo",
      },
      {
        id: "edit.separator-1",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        accelerator: "Ctrl+X",
        accelKeys: ["ctrl+x", "meta+x"],
        action: { id: "cut", type: "command" },
        id: "edit.cut",
        label: "Cut",
      },
      {
        accelerator: "Ctrl+C",
        accelKeys: ["ctrl+c", "meta+c"],
        action: { id: "copy", type: "command" },
        id: "edit.copy",
        label: "Copy",
      },
      {
        accelerator: "Ctrl+V",
        accelKeys: ["ctrl+v", "meta+v"],
        action: { id: "paste", type: "command" },
        id: "edit.paste",
        label: "Paste",
      },
      {
        id: "edit.separator-2",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        accelerator: "Ctrl+A",
        accelKeys: ["ctrl+a", "meta+a"],
        action: { id: "select-all", type: "command" },
        id: "edit.select-all",
        label: "Select All",
      },
    ].filter((i) => i.label !== "—") as MenuItemDef[],
    label: "Edit",
    mnemonic: "e",
  },
  {
    id: "view",
    items: [
      {
        accelerator: "Ctrl+B",
        accelKeys: ["ctrl+b", "meta+b"],
        action: { id: "toggle-sidebar", type: "command" },
        id: "view.toggle-sidebar",
        label: "Toggle Sidebar",
      },
      {
        id: "view.separator-1",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        accelerator: "Ctrl++",
        accelKeys: ["ctrl+=", "meta+=", "ctrl+plus", "meta+plus"],
        action: { id: "zoom-in", type: "command" },
        id: "view.zoom-in",
        label: "Zoom In",
      },
      {
        accelerator: "Ctrl+–",
        accelKeys: ["ctrl+-", "meta+-"],
        action: { id: "zoom-out", type: "command" },
        id: "view.zoom-out",
        label: "Zoom Out",
      },
      {
        accelerator: "Ctrl+0",
        accelKeys: ["ctrl+0", "meta+0"],
        action: { id: "zoom-reset", type: "command" },
        id: "view.zoom-reset",
        label: "Actual Size",
      },
      {
        accelerator: "F11",
        accelKeys: ["f11"],
        action: { id: "toggle-fullscreen", type: "command" },
        id: "view.fullscreen",
        label: "Toggle Full Screen",
      },
      {
        id: "view.separator-2",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        id: "view.appearance",
        label: "Appearance",
        submenu: [
          {
            action: { id: "theme-light", type: "command" },
            id: "view.appearance.light",
            label: "Light",
          },
          {
            action: { id: "theme-dark", type: "command" },
            id: "view.appearance.dark",
            label: "Dark",
          },
          {
            action: { id: "theme-system", type: "command" },
            id: "view.appearance.system",
            label: "System",
          },
        ],
      },
      {
        id: "view.separator-3",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        action: { to: "/admin", type: "navigate" },
        id: "view.go-overview",
        label: "Go to Overview",
      },
      {
        action: { to: "/admin/inventory", type: "navigate" },
        id: "view.go-inventory",
        label: "Go to Stock Management",
      },
      {
        action: { to: "/admin/inventory/expiry", type: "navigate" },
        id: "view.go-expiry",
        label: "Go to Expiry Alerts",
      },
      {
        action: { to: "/admin/inventory/low-stock", type: "navigate" },
        id: "view.go-lowstock",
        label: "Go to Low-Stock Alerts",
      },
      {
        action: { to: "/admin/requests", type: "navigate" },
        id: "view.go-requests",
        label: "Go to Request Queue",
      },
      {
        action: { to: "/admin/dispensing", type: "navigate" },
        id: "view.go-dispensing",
        label: "Go to Dispensing Log",
      },
      {
        action: { to: "/admin/reports", type: "navigate" },
        id: "view.go-reports",
        label: "Go to Reports",
      },
      {
        action: { to: "/admin/audit", type: "navigate" },
        id: "view.go-audit",
        label: "Go to Audit Logs",
      },
      {
        action: { to: "/admin/health", type: "navigate" },
        id: "view.go-health",
        label: "Go to System Health",
      },
      {
        action: { to: "/admin/data", type: "navigate" },
        id: "view.go-data",
        label: "Go to Data Export / Import",
      },
      {
        action: { to: "/admin/settings", type: "navigate" },
        id: "view.go-settings",
        label: "Go to Settings",
      },
    ].filter((i) => i.label !== "—") as MenuItemDef[],
    label: "View",
    mnemonic: "v",
  },
  {
    id: "window",
    items: [
      {
        accelerator: "Ctrl+M",
        accelKeys: ["ctrl+m", "meta+m"],
        action: { id: "minimize", type: "native" },
        id: "window.minimize",
        label: "Minimize",
      },
      {
        action: { id: "maximize", type: "native" },
        id: "window.zoom",
        label: "Zoom",
      },
      {
        id: "window.separator-1",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        accelerator: "Ctrl+W",
        accelKeys: ["ctrl+w", "meta+w"],
        action: { id: "close", type: "native" },
        id: "window.close",
        label: "Close Window",
      },
    ].filter((i) => i.label !== "—") as MenuItemDef[],
    label: "Window",
    mnemonic: "w",
  },
  {
    id: "help",
    items: [
      {
        action: { id: "about", type: "modal" },
        id: "help.about",
        label: "About CMIS",
      },
      {
        action: { id: "check-updates", type: "command" },
        id: "help.check-updates",
        label: "Check for Updates…",
      },
      {
        accelerator: "Ctrl+/",
        accelKeys: ["ctrl+/", "meta+/"],
        action: { id: "shortcuts", type: "modal" },
        id: "help.shortcuts",
        label: "Keyboard Shortcuts",
      },
      {
        id: "help.separator-1",
        label: "—",
        separatorBefore: true,
      } as unknown as MenuItemDef,
      {
        action: { id: "report-issue", type: "modal" },
        id: "help.report-issue",
        label: "Report Issue…",
      },
      {
        // F1 is handled globally by `use-help-shortcuts` (so it also works on
        // macOS, where this custom menubar is hidden) — listed here for the
        // accelerator hint and the Shortcuts modal.
        accelerator: "F1",
        action: { to: "/docs", type: "navigate" },
        id: "help.docs",
        label: "View Documentation",
      },
    ].filter((i) => i.label !== "—") as MenuItemDef[],
    label: "Help",
    mnemonic: "h",
  },
];

// Mark separators via separatorBefore rather than dummy items — fix above filter was placeholder.
// Rebuild cleanly with proper separatorBefore flags:
for (const menu of MENUS) {
  // File separators
  if (menu.id === "file") {
    const ids = [
      "file.new-request",
      "file.import",
      "file.settings",
      "file.exit",
    ];
    const seps = new Set(["file.import", "file.settings", "file.exit"]);
    for (const item of menu.items) {
      if (seps.has(item.id) && ids.includes(item.id)) {
        item.separatorBefore = true;
      }
    }
  }
  if (menu.id === "edit") {
    for (const item of menu.items) {
      if (["edit.cut", "edit.select-all"].includes(item.id)) {
        item.separatorBefore = true;
      }
    }
  }
  if (menu.id === "view") {
    for (const item of menu.items) {
      if (
        ["view.zoom-in", "view.appearance", "view.go-overview"].includes(
          item.id
        )
      ) {
        item.separatorBefore = true;
      }
    }
  }
  if (menu.id === "window") {
    for (const item of menu.items) {
      if (item.id === "window.close") {
        item.separatorBefore = true;
      }
    }
  }
  if (menu.id === "help") {
    for (const item of menu.items) {
      if (item.id === "help.report-issue") {
        item.separatorBefore = true;
      }
    }
  }
}
