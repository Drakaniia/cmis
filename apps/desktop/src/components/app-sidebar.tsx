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
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type * as React from "react";
import { useCallback, useState } from "react";

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
      { icon: BarChart3, label: "Reports & Analytics", to: "/admin/reports" },
    ],
    title: "Reports",
  },
];

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
        "press-feedback group relative flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13px] leading-tight",
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        collapsed && "justify-center px-0 py-1.5"
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
      <item.icon
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 transition-colors",
          active
            ? "text-primary"
            : "text-muted-foreground/80 group-hover:text-accent-foreground"
        )}
      />{" "}
      {collapsed ? null : (
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      )}
      {showBadge && badge ? (
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-1.5 py-0.25 font-semibold text-[10px] tabular-nums leading-none",
            badge.className
          )}
        >
          {badge.count}
        </span>
      ) : null}
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
      animate={{ width: collapsed ? 68 : 248 }}
      aria-label="Sidebar"
      className="material-sidebar relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-border/60 border-r"
      transition={reduceMotion ? { duration: 0 } : chromeSpring}
    >
      {/* Brand — maroon mark so the identity reads before any nav label. */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center px-3",
          collapsed ? "justify-center" : "gap-2.5"
        )}
        onMouseEnter={handleBrandMouseEnter}
        onMouseLeave={handleBrandMouseLeave}
        role="none"
      >
        {collapsed ? (
          <>
            {/* Logo — cross-fades with expand icon on hover */}
            <div
              className={cn(
                "flex items-center transition-opacity duration-200",
                brandHovered && "pointer-events-none opacity-0"
              )}
            >
              <img
                alt="CMIS logo"
                className="size-7 shrink-0 rounded-[0.5rem] dark:hidden"
                height={28}
                src="/cmis-dark-rounded.png"
                width={28}
              />
              <img
                alt="CMIS logo"
                className="hidden size-7 shrink-0 rounded-[0.5rem] dark:block"
                height={28}
                src="/cmis-white-rounded.png"
                width={28}
              />
            </div>
            {/* Expand icon — revealed on hover */}
            <Button
              aria-label="Expand sidebar"
              className={cn(
                "press-feedback absolute transition-opacity duration-200",
                brandHovered ? "opacity-100" : "pointer-events-none opacity-0"
              )}
              onClick={onToggle}
              size="icon-sm"
              variant="ghost"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <img
              alt="CMIS logo"
              className="size-7 shrink-0 rounded-[0.5rem] dark:hidden"
              height={28}
              src="/cmis-dark-rounded.png"
              width={28}
            />
            <img
              alt="CMIS logo"
              className="hidden size-7 shrink-0 rounded-[0.5rem] dark:block"
              height={28}
              src="/cmis-white-rounded.png"
              width={28}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-foreground text-xs leading-tight">
                CMIS
              </span>
              <span className="block truncate text-[10.5px] text-muted-foreground leading-tight">
                BukSU Clinic
              </span>
            </span>
            <Button
              aria-label="Collapse sidebar"
              className="press-feedback -mr-1"
              onClick={onToggle}
              size="icon-sm"
              variant="ghost"
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </>
        )}
      </div>

      <div className="scrollbar-subtle flex-1 overflow-y-auto overflow-x-hidden px-2 pt-1 pb-3">
        <TooltipProvider>
          <div className="space-y-3.5">
            {sections.map((section) => (
              <div key={section.title}>
                {collapsed ? (
                  <div aria-hidden className="mx-2 mb-2 h-px bg-border/70" />
                ) : (
                  <p className="mb-1 px-2.5 font-semibold text-[10.5px] text-muted-foreground/70 uppercase tracking-[0.06em]">
                    {section.title}
                  </p>
                )}
                <nav className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = pathname === item.to;
                    const badge = resolveBadge(item.label, badgeCounts);
                    const showBadge =
                      !collapsed &&
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

      {collapsed ? null : (
        <div className="shrink-0 px-3 pb-3">
          <p className="border-border/70 border-t pt-2 text-[10.5px] text-muted-foreground/70">
            Clinical Inventory System
          </p>
        </div>
      )}
    </motion.aside>
  );
}
