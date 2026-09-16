/**
 * CMIS-UI-01 §3.2 — Alerts band (v4 — fixed-height pair).
 *
 * Two side-by-side cards with nested border radius:
 * - Outer card: rounded-2xl with shadow
 * - Inner card: rounded-xl with border, holds the rows
 * - Each row: status dot + item info + pill badge
 *
 * Both cards reserve room for the five rows the band can show, so a side that
 * is short — or showing "All clear" — is the same height as a full neighbour
 * instead of floating in the grid row with a gap beneath it. Header icons stay
 * neutral (no tint wash) to match the other /admin surfaces.
 */

import { Skeleton } from "@cmis/ui/components/skeleton";
import { cn } from "@cmis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { motion } from "motion/react";

import { densitySpring } from "@/lib/motion";
import type { DashboardLinkKey, ExpiryAlert, LowStockAlert } from "../types";

const SECTION = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 12 },
} as const;

const CARD_SHELL =
  "flex h-full min-w-0 flex-col rounded-2xl border bg-card p-1.5 shadow-[0_1px_3px_oklch(0_0_0/0.04),0_4px_12px_oklch(0_0_0/0.02)]";

/**
 * Five rows × 60px + dividers + inner padding ≈ 314px, so `min-h-80` (320px)
 * holds every state at one height. The card is a flex column, so the empty and
 * loading states simply fill the same box.
 */
const LIST_AREA = "flex min-h-80 flex-1 flex-col";
const ROW =
  "flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent/50";
const PILL =
  "inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs tabular-nums";
const SKELETON_ROW_KEYS = ["first", "second", "third", "fourth", "fifth"];

/** "Top 0 by urgency" next to "All clear" reads as a contradiction, so a clear
 *  or still-loading list gets a caption that matches its body. */
function expiryCaption(count: number, loading: boolean): string {
  if (loading) {
    return "Checking inventory";
  }
  if (count === 0) {
    return "Nothing expiring";
  }
  return `Top ${count} by urgency`;
}

function lowStockCaption(count: number, loading: boolean): string {
  if (loading) {
    return "Checking inventory";
  }
  if (count === 0) {
    return "Nothing below threshold";
  }
  return `Top ${count} by remaining units`;
}

function CardHeader({
  count,
  icon: Icon,
  iconSlot,
  subtitle,
  title,
  to,
}: {
  count: number;
  icon: LucideIcon;
  iconSlot: "expiring" | "low-stock";
  subtitle: string;
  title: string;
  to: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
      {/* Plain glyph — no tinted chip behind it (see other /admin headers). */}
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        data-icon={iconSlot}
      >
        <Icon aria-hidden className="size-4.5 text-muted-foreground/60" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-sm tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>
      {count > 0 ? (
        <span className="inline-flex size-5.5 items-center justify-center rounded-full bg-muted font-semibold text-xs tabular-nums">
          {count}
        </span>
      ) : null}
      <Link
        className="font-medium text-primary text-xs hover:underline"
        to={to}
      >
        View all
      </Link>
    </div>
  );
}

/** The three body states share one reserved height, so nothing about the pair
 *  shifts when a list empties out or arrives from SQLite. */
function CardBody({
  children,
  empty,
  loading,
  emptySlot,
}: {
  children: React.ReactNode;
  empty: boolean;
  emptySlot: "expiring" | "low-stock";
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className={cn(LIST_AREA, "gap-1 p-1")} data-slot="alerts-list">
        {SKELETON_ROW_KEYS.map((key) => (
          <Skeleton className="h-13 w-full rounded-lg" key={key} />
        ))}
      </div>
    );
  }

  if (empty) {
    return (
      <div
        className={cn(LIST_AREA, "items-center justify-center gap-2 p-6")}
        data-slot="alerts-list"
        data-state={`${emptySlot}-empty`}
      >
        <CheckCircle2 aria-hidden className="size-4 text-[var(--success)]" />
        <p className="text-caption text-muted-foreground">All clear</p>
      </div>
    );
  }

  return (
    <div
      className={cn(LIST_AREA, "rounded-xl border p-1")}
      data-slot="alerts-list"
    >
      {children}
    </div>
  );
}

function ExpiryCard({
  alerts,
  links,
  loading,
}: {
  alerts: ExpiryAlert[];
  links: Record<DashboardLinkKey, string>;
  loading: boolean;
}) {
  const urgentCount = alerts.filter((a) => a.daysUntilExpiry <= 7).length;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={CARD_SHELL}
      initial={{ opacity: 0, y: 10 }}
      transition={densitySpring}
    >
      <CardHeader
        count={urgentCount}
        icon={Clock}
        iconSlot="expiring"
        subtitle={expiryCaption(alerts.length, loading)}
        title="Expiring soon"
        to={links.expiry}
      />
      <CardBody
        empty={alerts.length === 0}
        emptySlot="expiring"
        loading={loading}
      >
        <ul className="divide-y divide-border/50">
          {alerts.slice(0, 5).map((alert) => (
            <li className={ROW} key={alert.id}>
              {/* Status dot */}
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-destructive"
              />

              {/* Item info */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{alert.medicine}</p>
                <p className="truncate text-muted-foreground text-xs">
                  Batch #{alert.batch}{" "}
                  <span className="text-muted-foreground/60">·</span> expires in{" "}
                  {alert.daysUntilExpiry} days
                </p>
              </div>

              {/* Days pill */}
              <span className={PILL}>{alert.daysUntilExpiry}d</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </motion.div>
  );
}

function LowStockCard({
  alerts,
  links,
  loading,
}: {
  alerts: LowStockAlert[];
  links: Record<DashboardLinkKey, string>;
  loading: boolean;
}) {
  const urgentCount = alerts.filter((a) => a.qty <= 5).length;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={CARD_SHELL}
      initial={{ opacity: 0, y: 10 }}
      transition={densitySpring}
    >
      <CardHeader
        count={urgentCount}
        icon={AlertTriangle}
        iconSlot="low-stock"
        subtitle={lowStockCaption(alerts.length, loading)}
        title="Low stock"
        to={links.lowStock}
      />
      <CardBody
        empty={alerts.length === 0}
        emptySlot="low-stock"
        loading={loading}
      >
        <ul className="divide-y divide-border/50">
          {alerts.slice(0, 5).map((alert) => (
            <li className={ROW} key={alert.id}>
              {/* Status dot */}
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-[var(--warning)]"
              />

              {/* Item info */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{alert.medicine}</p>
                <p className="truncate text-muted-foreground text-xs">
                  Reorder point: {alert.threshold}{" "}
                  <span className="text-muted-foreground/60">·</span> updated{" "}
                  {alert.updatedAt}
                </p>
              </div>

              {/* Qty pill */}
              <span className={PILL}>
                {alert.qty} {alert.unit}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </motion.div>
  );
}

// ── Band (side-by-side) ────────────────────────────────────────

export function AlertsBand({
  expiry,
  links,
  loading = false,
  lowStock,
}: {
  expiry: ExpiryAlert[];
  links: Record<DashboardLinkKey, string>;
  /** Inventory has not arrived yet — hold the height instead of claiming the
   *  lists are clear. */
  loading?: boolean;
  lowStock: LowStockAlert[];
}) {
  return (
    <motion.div
      className="grid gap-4 sm:gap-5 lg:grid-cols-2"
      {...SECTION}
      transition={{ ...densitySpring, staggerChildren: 0.06 }}
    >
      <ExpiryCard alerts={expiry} links={links} loading={loading} />
      <LowStockCard alerts={lowStock} links={links} loading={loading} />
    </motion.div>
  );
}
