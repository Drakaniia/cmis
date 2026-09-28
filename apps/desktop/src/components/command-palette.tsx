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
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Package,
  PackageMinus,
  Search,
  Settings,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useHelpDialogs } from "@/features/help/help-dialogs-context";
import {
  HELP_COMMANDS,
  type HelpCommandEntry,
  runHelpCommand,
} from "@/features/help/lib/help-commands";
import {
  type HighlightRange,
  searchStockItems,
} from "@/features/inventory/domain/item-search";
import { composeListLabel } from "@/features/inventory/domain/strength";
import { useInventoryItems } from "@/features/inventory/hooks/use-inventory-items";
import { useQuickDeductDialog } from "@/features/inventory/quick-deduct-dialog-context";
import { useStockItemDetailDialog } from "@/features/inventory/stock-item-detail-dialog-context";
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
  keywords?: string[];
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
    icon: FileText,
    kind: "route",
    label: "Stock Report",
    section: "Reports",
    to: "/admin/reports",
  },
  {
    icon: BarChart3,
    kind: "route",
    label: "Analytics",
    section: "Reports",
    to: "/admin/analytics",
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
    keywords: ["deduct", "stock", "inventory", "ctrl+d", "quick deduct"],
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

/**
 * The haystack cmdk used to score: the label, plus an action's keywords so
 * `ctrl+d` keeps finding `Deduct stock…` (F2, SI3).
 */
function commandHaystack(entry: CommandEntry): string {
  const keywords =
    entry.kind === "action" && entry.keywords ? entry.keywords.join(" ") : "";
  return keywords ? `${entry.label} ${keywords}` : entry.label;
}

/**
 * F2 — the palette filters commands itself now. The item group must keep the
 * ranking `searchStockItems` produced, which means `shouldFilter={false}` and a
 * plain, case-insensitive match for the static entries (D23: no fuzzy here, so
 * a mistyped route still shows nothing, exactly as today).
 */
function matchesCommand(entry: CommandEntry, query: string): boolean {
  return query === "" || commandHaystack(entry).toLowerCase().includes(query);
}

/** Same normalization as the matcher, so the two halves agree on "what was typed". */
function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * D11 — bold the matched ranges inside the label and the SKU.
 *
 * A module-level function rather than a nested component: it renders plain nodes
 * and must not remount between keystrokes. Empty ranges render the text as-is,
 * which is what a fuzzy match with no contiguous run produces.
 */
function emphasize(text: string, ranges: readonly HighlightRange[]): ReactNode {
  if (ranges.length === 0) {
    return text;
  }
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }
    nodes.push(
      <span className="font-semibold text-foreground" key={`${start}-${end}`}>
        {text.slice(start, end)}
      </span>
    );
    cursor = end;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const { openStockItem } = useStockItemDetailDialog();
  // SI2 — cmdk owns the input today, so the typed text has to be wired out for
  // a dynamic group to exist at all.
  const normalizedQuery = normalizeQuery(query);
  // F4/D13 — nothing is fetched until the palette first opens; the shared
  // `["inventory_items"]` cache serves it from then on.
  const { data: inventoryItems } = useInventoryItems({ enabled: open });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        // Allow Ctrl/Cmd+K even while typing; ignore Alt-combos (e.g. Ctrl+Alt+K)
        if (e.altKey) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };

    // Use window + capture so we beat the browser's own Ctrl+K (focus address bar)
    // which can fire before a bubbling document listener.
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
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

  // A closed palette starts empty next time (D3): the query is not a persisted
  // filter, so reopening should not land on the previous operator's search.
  useEffect(() => {
    if (!open) {
      setQuery("");
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

  // The commands, filtered in the same order they always rendered in — the
  // sections and their membership are untouched, only the hiding is ours now.
  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandEntry[]> = {};
    for (const item of COMMAND_ITEMS) {
      if (!matchesCommand(item, normalizedQuery)) {
        continue;
      }
      if (!groups[item.section]) {
        groups[item.section] = [];
      }
      groups[item.section].push(item);
    }
    return groups;
  }, [normalizedQuery]);

  // F3/D7 — recomputed only when the rows or the query change; the returned
  // order is final, so the render below never re-sorts.
  const itemResults = useMemo(
    () => searchStockItems(inventoryItems ?? [], query),
    [inventoryItems, query]
  );

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

  // Selecting a medicine closes the palette and opens the real detail over the
  // current screen (D1). The open is deferred one frame so the palette's input
  // focus and the modal's focus capture do not race (F5.4).
  const runItem = useCallback(
    (itemId: string) => {
      setOpen(false);
      requestAnimationFrame(() => openStockItem(itemId));
    },
    [openStockItem]
  );

  // Precomputed per entry so no handler is recreated per render.
  const selectHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const item of COMMAND_ITEMS) {
      handlers[commandKey(item)] = () => runEntry(item);
    }
    return handlers;
  }, [runEntry]);

  const itemHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const match of itemResults.matches) {
      handlers[match.item.id] = () => runItem(match.item.id);
    }
    return handlers;
  }, [itemResults.matches, runItem]);

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
        <span className="hidden flex-1 text-left sm:inline">
          Search medicines…
        </span>
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
                {/* CommandPrimitive manages focus and keyboard navigation.
                 * F2 — `shouldFilter={false}` because cmdk would otherwise
                 * re-sort the item group and could hide a result our matcher
                 * accepted; the palette filters both halves itself. */}
                <CommandPrimitive
                  className="flex size-full flex-col overflow-hidden text-popover-foreground"
                  shouldFilter={false}
                >
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
                        onValueChange={setQuery}
                        placeholder="Search medicines, pages and actions…"
                        ref={inputRef}
                        value={query}
                      />
                    </div>
                  </div>

                  <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    {/* D2 — medicines first, then the command groups exactly
                     * as they were. Absent for an empty query (D3) and absent
                     * when the catalogue is unavailable (D25). */}
                    {itemResults.matches.length > 0 ? (
                      <CommandGroup heading="Stock items" key="stock-items">
                        {itemResults.matches.map((match) => (
                          <CommandItem
                            /* The label takes the free space and the SKU is
                             * pinned right. The trailing `Check` the shared
                             * wrapper appends is never checked here, so it is
                             * hidden rather than allowed to push the SKU off
                             * the edge. */
                            className="press-feedback [&>svg:last-child]:hidden"
                            key={`inventory-item:${match.item.id}`}
                            onSelect={itemHandlers[match.item.id]}
                            value={`inventory-item:${match.item.id}`}
                          >
                            <Package className="mr-2 size-4" />
                            <span className="min-w-0 flex-1 truncate">
                              {emphasize(
                                composeListLabel(match.item),
                                match.highlight.label
                              )}
                            </span>
                            <span className="shrink-0 text-muted-foreground text-xs">
                              {emphasize(match.item.sku, match.highlight.sku)}
                            </span>
                          </CommandItem>
                        ))}
                        {itemResults.total > itemResults.matches.length ? (
                          <div
                            aria-hidden
                            className="select-none px-2 py-1.5 text-muted-foreground text-xs"
                          >
                            …and{" "}
                            {itemResults.total - itemResults.matches.length}{" "}
                            more
                          </div>
                        ) : null}
                      </CommandGroup>
                    ) : null}
                    {Object.entries(groupedItems).map(([section, items]) => (
                      <CommandGroup heading={section} key={section}>
                        {items.map((item) => {
                          const keywords =
                            item.kind === "action" && item.keywords
                              ? item.keywords.join(" ")
                              : "";
                          const value = keywords
                            ? `${item.label} ${keywords}`
                            : item.label;
                          return (
                            <CommandItem
                              className="press-feedback"
                              key={commandKey(item)}
                              onSelect={selectHandlers[commandKey(item)]}
                              value={value}
                            >
                              <item.icon className="mr-2 size-4" />
                              <span>{item.label}</span>
                            </CommandItem>
                          );
                        })}
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
