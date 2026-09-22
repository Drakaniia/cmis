import { Button } from "@cmis/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@cmis/ui/components/tooltip";
import { cn } from "@cmis/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type * as React from "react";
import { useCallback, useState } from "react";

import { useUpdaterOptional } from "@/features/updater/use-updater";
import { chromeSpring } from "@/lib/motion";

interface NavItem {
  icon: React.ElementType;
  label: string;
  to: string;
}

interface NavSection {
  items: NavItem[];
  title: string;
}

interface ResolvedBadge {
  className: string;
  count: number | undefined;
}

function resolveBadge(
  label: string,
  badgeCounts?: { expiry?: number; lowStock?: number; pending?: number }
): ResolvedBadge | null {
  if (label === "Expiry Alerts") {
    return {
      className: "bg-destructive/12 text-destructive",
      count: badgeCounts?.expiry,
    };
  }
  if (label === "Low-Stock Alerts") {
    return {
      className: "bg-warning/15 text-warning-foreground",
      count: badgeCounts?.lowStock,
    };
  }
  if (label === "Request Queue") {
    return {
      className: "bg-warning/15 text-warning-foreground",
      count: badgeCounts?.pending,
    };
  }
  return null;
}

/** CMIS — admin-only navigation. Administration section moved to Settings page. */
const ADMIN_NAV: NavSection[] = [
  {
    items: [{ icon: LayoutDashboard, label: "Home", to: "/admin" }],
    title: "Overview",
  },
  {
    items: [
      { icon: Package, label: "Stock Management", to: "/admin/inventory" },
      {
        icon: AlertTriangle,
        label: "Expiry Alerts",
        to: "/admin/inventory/expiry",
      },
      {
        icon: AlertCircle,
        label: "Low-Stock Alerts",
        to: "/admin/inventory/low-stock",
      },
    ],
    title: "Inventory",
  },
  {
    items: [
      { icon: ClipboardList, label: "Request Queue", to: "/admin/requests" },
      {
        icon: ClipboardCheck,
        label: "Dispensing Log",
        to: "/admin/dispensing",
      },
    ],
    title: "Requests",
  },
  {
    items: [
      { icon: FileText, label: "Stock Report", to: "/admin/reports" },
      { icon: BarChart3, label: "Analytics", to: "/admin/analytics" },
    ],
    title: "Reports",
  },
];

/*
 * CMIS-UI-00 §2.1 — rail geometry.
 *
 * A tab icon is anchored to the *collapsed* rail's centre column, so the one
 * thing that never moves while the panel springs between widths is the icon
 * itself (Apple §2 direct manipulation, §7 spatial consistency). Every offset
 * below is derived from the two rail widths instead of being pinned per
 * element, which is what makes the anchor hold in both states.
 */
const RAIL_WIDTH_COLLAPSED = 68;
const RAIL_WIDTH_EXPANDED = 248;
/** `px-2` on the nav scroller — the gutter between the rail edge and a tab. */
const RAIL_PAD_X = 8;
/** `size-3.5`. */
const TAB_ICON_SIZE = 14;
/** The icon's gravity point, measured from the aside's left edge. */
const ICON_COLUMN_CENTER = RAIL_WIDTH_COLLAPSED / 2;
/** Link-relative offsets, and a link starts at RAIL_PAD_X. */
const TAB_ICON_LEFT = ICON_COLUMN_CENTER - RAIL_PAD_X - TAB_ICON_SIZE / 2;
/** Icon → `gap-2` → label, so the label keeps its original spacing. */
const TAB_LABEL_LEFT = TAB_ICON_LEFT + TAB_ICON_SIZE + 8;
/** `pr-2` on the link — keeps the badge off the pill's own edge. */
const TAB_LABEL_RIGHT_PAD = 8;
/**
 * The label keeps a fixed box and is clipped by the rail rather than being
 * unmounted, so hiding it can never re-measure the row around it.
 */
const TAB_LABEL_WIDTH =
  RAIL_WIDTH_EXPANDED - RAIL_PAD_X * 2 - TAB_LABEL_RIGHT_PAD;

/** `gap-2.5` — the mark keeps its original breathing room from the wordmark. */
const BRAND_MARK_GAP = 10;
/** `size-7`. */
const BRAND_MARK_SIZE = 28;
/** `pr-3` on the brand row. */
const BRAND_ROW_PAD_RIGHT = 12;
/**
 * Apple §7 spatial consistency — the mark and (on hover, while collapsed) the
 * expand affordance occupy one rail-anchored slot, so the morph between them
 * happens in place instead of jumping to the centre.
 */
const BRAND_SLOT = { left: 0, width: RAIL_WIDTH_COLLAPSED } as const;
/** The wordmark starts where the centred mark ends, plus BRAND_MARK_GAP. */
const BRAND_LABEL_LEFT =
  ICON_COLUMN_CENTER + BRAND_MARK_SIZE / 2 + BRAND_MARK_GAP;
/** Fixed box, so hiding the wordmark can never re-measure the row. */
const BRAND_LABEL_WIDTH =
  RAIL_WIDTH_EXPANDED - BRAND_LABEL_LEFT - BRAND_ROW_PAD_RIGHT;

function NavItemLink({
  item,
  active,
  badge,
  showBadge,
  collapsed,
  hoveredItem,
  onMouseEnter,
  onMouseLeave,
}: {
  active: boolean;
  badge: ResolvedBadge | null;
  collapsed: boolean;
  hoveredItem: string | null;
  item: NavItem;
  onMouseEnter: React.MouseEventHandler<HTMLAnchorElement>;
  onMouseLeave: React.MouseEventHandler<HTMLAnchorElement>;
  showBadge: boolean;
}) {
  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "press-feedback group relative flex items-center rounded-[6px] py-1.5 pr-2 text-[13px] leading-tight",
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      data-label={item.label}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      to={item.to}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-0 h-3.5 w-[2.5px] -translate-y-1/2 rounded-r-full bg-primary"
        />
      ) : null}
      {/* The icon is out of flow and pinned to the rail centre, so the fading
          label below can never re-measure it (Apple §2, §7). */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 -translate-y-1/2"
        style={{ left: TAB_ICON_LEFT }}
      >
        <item.icon
          className={cn(
            "size-3.5 transition-colors",
            active
              ? "text-primary"
              : "text-muted-foreground/80 group-hover:text-accent-foreground"
          )}
        />
      </span>
      {/* Collapsing hides *only* the label — it keeps its box and fades, so the
          rail clips it instead of the row reflowing around it. */}
      <span
        className={cn(
          "flex shrink-0 items-center gap-2 transition-opacity duration-200",
          collapsed && "opacity-0"
        )}
        style={{ paddingLeft: TAB_LABEL_LEFT, width: TAB_LABEL_WIDTH }}
      >
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {showBadge && badge ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.25 font-semibold text-[10px] tabular-nums leading-none",
              badge.className
            )}
          >
            {badge.count}
          </span>
        ) : null}
      </span>
    </Link>
  );

  if (!collapsed) {
    return <span>{link}</span>;
  }
  if (hoveredItem !== item.label) {
    return <span>{link}</span>;
  }
  return (
    <span>
      <Tooltip>
        <TooltipTrigger render={link} />
        <TooltipContent
          className="rounded-[var(--radius-field)] border border-border bg-popover px-2.5 py-1.5 font-medium text-[13px] text-popover-foreground"
          side="right"
          sideOffset={8}
        >
          {item.label}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

/**
 * CMIS-UI-00 §1.2 / §2.1 — the sidebar is the *heavy* structural material:
 * tonally deeper than the canvas (Apple §12 material weight encodes
 * hierarchy) so it separates the structural region without a hard divider.
 * It spans the full window height so the brand owns the top-left corner and
 * the header only has to cover the content column.
 *
 * Active state carries the BukSU maroon (§1.4) so wayfinding is branded
 * rather than a generic grey pill.
 */
export function AppSidebar({
  collapsed,
  onToggle,
  badgeCounts,
}: {
  badgeCounts?: { expiry?: number; lowStock?: number; pending?: number };
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sections = ADMIN_NAV;
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [brandHovered, setBrandHovered] = useState(false);
  const reduceMotion = useReducedMotion();
  const updater = useUpdaterOptional();
  const hasUpdate =
    updater?.status === "available" ||
    updater?.status === "ready" ||
    updater?.status === "downloading";
  const displayVersion = updater?.currentVersion ?? null;

  const handleBrandMouseEnter = useCallback(() => {
    if (collapsed) {
      setBrandHovered(true);
    }
  }, [collapsed]);

  const handleBrandMouseLeave = useCallback(() => {
    if (collapsed) {
      setBrandHovered(false);
    }
  }, [collapsed]);

  /** Dropping the hover flag too, so the mark is back the next time it opens. */
  const handleBrandToggle = useCallback(() => {
    setBrandHovered(false);
    onToggle();
  }, [onToggle]);

  const handleItemMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (collapsed) {
        const label = event.currentTarget.getAttribute("data-label");
        setHoveredItem(label);
      }
    },
    [collapsed]
  );

  const handleItemMouseLeave = useCallback(() => {
    if (collapsed) {
      setHoveredItem(null);
    }
  }, [collapsed]);

  return (
    <motion.aside
      animate={{
        width: collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED,
      }}
      aria-label="Sidebar"
      className="material-sidebar relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-border/60 border-r print:hidden"
      transition={reduceMotion ? { duration: 0 } : chromeSpring}
    >
      {/* Brand — maroon mark so the identity reads before any nav label. */}
      <div
        className="relative flex h-14 shrink-0 items-center pr-3"
        onMouseEnter={handleBrandMouseEnter}
        onMouseLeave={handleBrandMouseLeave}
        role="none"
      >
        {/*
         * Apple §7 spatial consistency — the mark is pinned to the same centre
         * column as every tab icon and is never unmounted, so collapsing can
         * only hide the wordmark: it cannot blink the image or slide the mark.
         */}
        <div
          className="pointer-events-none absolute inset-y-0 flex items-center justify-center"
          style={BRAND_SLOT}
        >
          <div
            className={cn(
              "flex items-center transition-opacity duration-200",
              collapsed && brandHovered && "opacity-0"
            )}
          >
            {/* Apple card style — same as splash (dark-theme apple style) — bg-card + transparent logo */}
            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[0.5rem] border bg-card p-[3px] shadow-sm">
              <img
                alt="CMIS logo"
                className="size-[22px] object-contain dark:hidden"
                height={22}
                src="/cmis-dark-transparent.png"
                width={22}
              />
              <img
                alt="CMIS logo"
                className="hidden size-[22px] object-contain dark:block"
                height={22}
                src="/cmis-white-transparent.png"
                width={22}
              />
            </span>
          </div>
        </div>
        {/* Expand affordance — the mark morphs into it in place on hover. */}
        {collapsed ? (
          <div
            className={cn(
              "absolute inset-y-0 flex items-center justify-center transition-opacity duration-200",
              brandHovered ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            style={BRAND_SLOT}
          >
            <Button
              aria-label="Expand sidebar"
              className="press-feedback"
              onClick={handleBrandToggle}
              size="icon-sm"
              variant="ghost"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          </div>
        ) : null}
        {/* Wordmark — fills its fixed box and is clipped by the rail on close. */}
        <span
          className={cn(
            "pointer-events-none flex shrink-0 flex-col justify-center transition-opacity duration-200",
            collapsed && "opacity-0"
          )}
          style={{ paddingLeft: BRAND_LABEL_LEFT, width: BRAND_LABEL_WIDTH }}
        >
          <span className="truncate font-semibold text-foreground text-xs leading-tight">
            CMIS
          </span>
          <span className="truncate text-[10.5px] text-muted-foreground leading-tight">
            BukSU Clinic
          </span>
        </span>
        {collapsed ? null : (
          <Button
            aria-label="Collapse sidebar"
            className="press-feedback -mr-1 ml-auto"
            onClick={handleBrandToggle}
            size="icon-sm"
            variant="ghost"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>

      <div className="scrollbar-subtle flex-1 overflow-y-auto overflow-x-hidden px-2 pt-1 pb-3">
        <TooltipProvider>
          <div className="space-y-3.5">
            {sections.map((section) => (
              <div key={section.title}>
                {/*
                 * Apple §7 spatial consistency — the heading and its collapsed
                 * stand-in (a hairline rule) cross-fade inside one fixed-height
                 * row, so the tabs below never shift when the panel closes.
                 */}
                <div className="relative">
                  <div
                    aria-hidden
                    className={cn(
                      "absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-border/70 transition-opacity duration-200",
                      collapsed ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <p
                    className={cn(
                      "mb-1 truncate px-2.5 font-semibold text-[10.5px] text-muted-foreground/70 uppercase tracking-[0.06em] transition-opacity duration-200",
                      collapsed && "opacity-0"
                    )}
                  >
                    {section.title}
                  </p>
                </div>
                <nav className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = pathname === item.to;
                    const badge = resolveBadge(item.label, badgeCounts);
                    const showBadge =
                      badge !== null &&
                      badge.count !== undefined &&
                      badge.count > 0;
                    return (
                      <span key={item.label}>
                        <NavItemLink
                          active={active}
                          badge={badge}
                          collapsed={collapsed}
                          hoveredItem={hoveredItem}
                          item={item}
                          onMouseEnter={handleItemMouseEnter}
                          onMouseLeave={handleItemMouseLeave}
                          showBadge={showBadge}
                        />
                      </span>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </TooltipProvider>
      </div>

      {collapsed ? (
        <div className="flex shrink-0 justify-center px-2 pb-3">
          {hasUpdate ? (
            <span
              aria-hidden
              className="size-2 rounded-full bg-primary"
              title="Update available"
            />
          ) : null}
        </div>
      ) : (
        <div className="shrink-0 space-y-1 px-3 pb-3">
          <p className="border-border/70 border-t pt-2 text-[10.5px] text-muted-foreground/70">
            Clinic Medicine Inventory System
          </p>
          <div className="flex items-center gap-2">
            {displayVersion ? (
              <span className="font-mono text-[10.5px] text-muted-foreground">
                v{displayVersion}
              </span>
            ) : null}
            {hasUpdate ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-[10px] text-primary">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-primary"
                />{" "}
                Update
              </span>
            ) : null}
          </div>
        </div>
      )}
    </motion.aside>
  );
}
