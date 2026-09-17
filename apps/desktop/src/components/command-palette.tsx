import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@cmis/ui/components/command";
import { useRouter } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  Package,
  PackageMinus,
  Search,
  Settings,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useHelpDialogs } from "@/features/help/help-dialogs-context";
import {
  HELP_COMMANDS,
  type HelpCommandEntry,
  runHelpCommand,
} from "@/features/help/lib/help-commands";
import { useQuickDeductDialog } from "@/features/inventory/quick-deduct-dialog-context";
import { materializeEnter, paletteSpring } from "@/lib/motion";

/**
 * CMIS-UI-00 Apple Design §12 §4 — Command palette.
 *
 * Frosted material surface (§12) with spring-driven materialize enter/exit
 * (§4 Behavior over animation). Uses `paletteSpring` (critically damped,
 * bounce 0, response 0.3s) — the same family as sheetSpring but tuned for
 * the smaller command palette surface.
 *
 * §1 Response: items get press-feedback on pointer-down (instant highlight).
 * §14 Reduced motion: useReducedMotion skips blur/scale and uses opacity only.
 * §12 Translucent material: surface-frosted with backdrop-blur on the palette
 *   panel, scrim behind to dim the page and keep the spatial relationship clear.
 */
interface RouteCommandEntry {
  icon: LucideIcon;
  kind: "route";
  label: string;
  section: string;
  to: string;
}

/**
 * A palette entry that opens an app-wide modal instead of navigating. `Ctrl+D`
 * exists for speed; this exists so the action is discoverable without knowing it
 * (F7).
 */
interface ActionCommandEntry {
  action: "quick-deduct";
  icon: LucideIcon;
  kind: "action";
  label: string;
  section: string;
}

/**
 * Palette entries are straight navigation, an app-wide modal, or a Help action
 * handled by the shared Help host. `HelpCommandEntry` owns the help-side model so
 * the palette cannot drift from the header dropdown.
 */
type CommandEntry = ActionCommandEntry | HelpCommandEntry | RouteCommandEntry;

const ROUTE_ITEMS: RouteCommandEntry[] = [
  {
    icon: LayoutDashboard,
    kind: "route",
    label: "Home",
    section: "Overview",
    to: "/admin",
  },
  {
    icon: Package,
    kind: "route",
    label: "Stock Management",
    section: "Inventory",
    to: "/admin/inventory",
  },
  {
    icon: AlertTriangle,
    kind: "route",
    label: "Expiry Alerts",
    section: "Inventory",
    to: "/admin/inventory/expiry",
  },
  {
    icon: AlertCircle,
    kind: "route",
    label: "Low-Stock Alerts",
    section: "Inventory",
    to: "/admin/inventory/low-stock",
  },
  {
    icon: ClipboardList,
    kind: "route",
    label: "Request Queue",
    section: "Requests",
    to: "/admin/requests",
  },
  {
    icon: ClipboardCheck,
    kind: "route",
    label: "Dispensing Log",
    section: "Requests",
    to: "/admin/dispensing",
  },
  {
    icon: BarChart3,
    kind: "route",
    label: "Reports & Analytics",
    section: "Reports",
    to: "/admin/reports",
  },
  {
    icon: Settings,
    kind: "route",
    label: "Settings",
    section: "Administration",
    to: "/admin/settings",
  },
];

/**
 * Actions that open a modal in place rather than moving the user to a route —
 * the palette must not navigate away for these (F7).
 */
const ACTION_ITEMS: ActionCommandEntry[] = [
  {
    action: "quick-deduct",
    icon: PackageMinus,
    kind: "action",
    label: "Deduct stock…",
    section: "Inventory",
  },
];

const COMMAND_ITEMS: CommandEntry[] = [
  ...ROUTE_ITEMS,
  ...ACTION_ITEMS,
  ...HELP_COMMANDS,
];

/** Stable React key + handler identity for every entry kind. */
function commandKey(entry: CommandEntry): string {
  if (entry.kind === "route") {
    return entry.to;
  }
  return entry.kind === "action"
    ? `app-action:${entry.action}`
    : `help-action:${entry.action}`;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  // Focus the input when the dialog opens — Apple §1: instant response.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleDialogClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandEntry[]> = {};
    for (const item of COMMAND_ITEMS) {
      if (!groups[item.section]) {
        groups[item.section] = [];
      }
      groups[item.section].push(item);
    }
    return groups;
  }, []);

  const { openReportIssue } = useHelpDialogs();
  const { openQuickDeduct } = useQuickDeductDialog();

  const runEntry = useCallback(
    (entry: CommandEntry) => {
      setOpen(false);
      if (entry.kind === "route") {
        router.navigate({ to: entry.to });
        return;
      }
      if (entry.kind === "action") {
        // A modal over the current screen, never a navigation.
        if (entry.action === "quick-deduct") {
          openQuickDeduct();
        }
        return;
      }
      runHelpCommand(entry, {
        navigate: (to) => {
          router.navigate({ to });
        },
        openReportIssue,
      });
    },
    [openQuickDeduct, openReportIssue, router]
  );

  // Precomputed per entry so no handler is recreated per render.
  const selectHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const item of COMMAND_ITEMS) {
      handlers[commandKey(item)] = () => runEntry(item);
    }
    return handlers;
  }, [runEntry]);

  // §14 Reduced motion: skip blur/scale, use opacity-only transition.
  const dialogTransition = reduceMotion ? { duration: 0.15 } : paletteSpring;

  return (
    <>
      <button
        className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={handleOpen}
        type="button"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left sm:inline">Search...</span>
        <kbd className="pointer-events-none ml-auto hidden select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            {/* §12 Scrim — dim behind to separate the modal task from the page. */}
            <motion.div
              animate={{ opacity: 1 }}
              aria-hidden
              className="fixed inset-0 z-50 bg-black/32"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={handleClose}
              transition={{ duration: 0.18 }}
            />

            {/* Palette container — click outside the panel to close (Apple §2 Agency). */}
            <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[20vh] sm:pt-[18vh]">
              <button
                aria-label="Close command palette"
                className="absolute inset-0 cursor-default"
                onClick={handleClose}
                type="button"
              />
              {/* §12 surface-frosted: translucent material with backdrop-blur.
               * §4 materializeEnter: scale + blur enter, blur + fade exit.
               * §7 Spatial consistency: centered origin. */}
              <motion.div
                animate="animate"
                aria-label="Command palette"
                aria-modal="true"
                className="surface-frosted relative z-10 flex w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
                exit="exit"
                initial={reduceMotion ? "animate" : "initial"}
                onClick={handleDialogClick}
                role="dialog"
                style={{
                  transformOrigin: "center center",
                  willChange: "transform, opacity, filter",
                }}
                transition={dialogTransition}
                variants={materializeEnter}
              >
                {/* CommandPrimitive manages focus, keyboard navigation, filtering. */}
                <CommandPrimitive className="flex size-full flex-col overflow-hidden text-popover-foreground">
                  {/* §15 Typography: heading-style input with tight tracking. */}
                  <div
                    className="border-border/50 border-b"
                    data-slot="command-input-wrapper"
                  >
                    <div className="flex h-12 items-center gap-2 px-3">
                      <Search className="size-4 shrink-0 text-muted-foreground" />
                      <CommandPrimitive.Input
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        data-slot="command-input"
                        placeholder="Type a command or search…"
                        ref={inputRef}
                      />
                    </div>
                  </div>

                  <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    {Object.entries(groupedItems).map(([section, items]) => (
                      <CommandGroup heading={section} key={section}>
                        {items.map((item) => (
                          <CommandItem
                            className="press-feedback"
                            key={commandKey(item)}
                            onSelect={selectHandlers[commandKey(item)]}
                            value={item.label}
                          >
                            <item.icon className="mr-2 size-4" />
                            <span>{item.label}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </CommandPrimitive>
              </motion.div>
            </div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
