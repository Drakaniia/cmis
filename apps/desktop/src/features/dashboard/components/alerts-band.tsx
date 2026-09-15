/**
 * CMIS-UI-01 §3.2 — Alerts band (v3 — Apple nested-card layout).
 *
 * Two side-by-side cards with nested border radius:
 * - Outer card: rounded-2xl with shadow
 * - Inner card: rounded-xl with border, holds the rows
 * - Each row: status dot + item info + pill badge
 *
 * Matches the reference design: clean, minimal, layered depth.
 */

import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { motion } from "motion/react";

import { densitySpring } from "@/lib/motion";
import type { DashboardLinkKey, ExpiryAlert, LowStockAlert } from "../types";

const SECTION = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 12 },
} as const;

// ── Expiry card ────────────────────────────────────────────────

function ExpiryCard({
  alerts,
  links,
}: {
  alerts: ExpiryAlert[];
  links: Record<DashboardLinkKey, string>;
}) {
  const urgentCount = alerts.filter((a) => a.daysUntilExpiry <= 7).length;

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border bg-card p-1.5 shadow-[0_1px_3px_oklch(0_0_0/0.04),0_4px_12px_oklch(0_0_0/0.02)]">
      {/* Header — icon + title + count + View all */}
      <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
          <Clock aria-hidden className="size-4.5 text-destructive" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sm tracking-tight">
            Expiring soon
          </h2>
          <p className="text-muted-foreground text-xs">
            Top {alerts.length} by urgency
          </p>
        </div>
        {urgentCount > 0 ? (
          <span className="inline-flex size-5.5 items-center justify-center rounded-full bg-muted font-semibold text-xs tabular-nums">
            {urgentCount}
          </span>
        ) : null}
        <Link
          className="font-medium text-primary text-xs hover:underline"
          to={links.expiry}
        >
          View all
        </Link>
      </div>

      {/* Inner nested card — rows */}
      {alerts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border p-6">
          <CheckCircle2 aria-hidden className="size-4 text-[var(--success)]" />
          <p className="text-caption text-muted-foreground">All clear</p>
        </div>
      ) : (
        <div className="rounded-xl border p-1">
          <ul className="divide-y divide-border/50">
            {alerts.slice(0, 5).map((alert) => (
              <li
                className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent/50"
                key={alert.id}
              >
                {/* Status dot */}
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-destructive"
                />

                {/* Item info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {alert.medicine}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    Batch #{alert.batch}{" "}
                    <span className="text-muted-foreground/60">·</span> expires
                    in {alert.daysUntilExpiry} days
                  </p>
                </div>

                {/* Days pill */}
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs tabular-nums">
                  {alert.daysUntilExpiry}d
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Low-stock card ─────────────────────────────────────────────

function LowStockCard({
  alerts,
  links,
}: {
  alerts: LowStockAlert[];
  links: Record<DashboardLinkKey, string>;
}) {
  const urgentCount = alerts.filter((a) => a.qty <= 5).length;

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border bg-card p-1.5 shadow-[0_1px_3px_oklch(0_0_0/0.04),0_4px_12px_oklch(0_0_0/0.02)]">
      {/* Header — icon + title + count + View all */}
      <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--warning)]/10">
          <AlertTriangle
            aria-hidden
            className="size-4.5 text-[var(--warning)]"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sm tracking-tight">Low stock</h2>
          <p className="text-muted-foreground text-xs">
            Top {alerts.length} by remaining units
          </p>
        </div>
        {urgentCount > 0 ? (
          <span className="inline-flex size-5.5 items-center justify-center rounded-full bg-muted font-semibold text-xs tabular-nums">
            {urgentCount}
          </span>
        ) : null}
        <Link
          className="font-medium text-primary text-xs hover:underline"
          to={links.lowStock}
        >
          View all
        </Link>
      </div>

      {/* Inner nested card — rows */}
      {alerts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border p-6">
          <CheckCircle2 aria-hidden className="size-4 text-[var(--success)]" />
          <p className="text-caption text-muted-foreground">All clear</p>
        </div>
      ) : (
        <div className="rounded-xl border p-1">
          <ul className="divide-y divide-border/50">
            {alerts.slice(0, 5).map((alert) => (
              <li
                className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent/50"
                key={alert.id}
              >
                {/* Status dot */}
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-[var(--warning)]"
                />

                {/* Item info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {alert.medicine}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    Reorder point: {alert.threshold}{" "}
                    <span className="text-muted-foreground/60">·</span> updated{" "}
                    {alert.updatedAt}
                  </p>
                </div>

                {/* Qty pill */}
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs tabular-nums">
                  {alert.qty} {alert.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Band (side-by-side) ────────────────────────────────────────

export function AlertsBand({
  expiry,
  links,
  lowStock,
}: {
  expiry: ExpiryAlert[];
  links: Record<DashboardLinkKey, string>;
  lowStock: LowStockAlert[];
}) {
  if (expiry.length === 0 && lowStock.length === 0) {
    return null;
  }

  return (
    <motion.div
      className="grid gap-4 sm:gap-5 lg:grid-cols-2"
      {...SECTION}
      transition={{ ...densitySpring, staggerChildren: 0.06 }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 10 }}
        transition={densitySpring}
      >
        <ExpiryCard alerts={expiry} links={links} />
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 10 }}
        transition={densitySpring}
      >
        <LowStockCard alerts={lowStock} links={links} />
      </motion.div>
    </motion.div>
  );
}
