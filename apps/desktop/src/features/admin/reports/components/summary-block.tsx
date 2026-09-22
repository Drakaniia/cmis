"use client";

import { cn } from "@cmis/ui/lib/utils";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Clock3,
  Layers,
  Package,
  Timer,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import type { MonthActivity, StockSummary } from "../types";

/**
 * Stock Report summary — the month's status document header (§12, §15, §16).
 *
 * Apple §12: Bigger surfaces read as thicker — stronger shadow + blur than
 * small chips. The card is the page's first scrollable material, so it earns
 * a heavier shadow and a bright top edge. Dim vs separate: not a modal — no
 * scrim, just translucency and 1px hairline.
 *
 * Apple §15: Tracking is size-specific. Display values (22px) tighten to
 * -0.02em; body labels stay at 0; captions push to +0.05–0.06em uppercase.
 * Leading tightens on large numbers (1.0) and loosens on descriptions (1.5).
 *
 * Apple §4/§3: Values spring from the presentation value when the category
 * filter changes — interruptible, no jump. Critically damped (bounce 0) by
 * default; only momentum gestures earn bounce.
 */

function Figure({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone?: "default" | "muted" | "warn" | "danger";
  value: ReactNode;
}) {
  let toneDot = "bg-foreground/15";
  if (tone === "warn") {
    toneDot = "bg-amber-500";
  } else if (tone === "danger") {
    toneDot = "bg-red-500";
  } else if (tone === "muted") {
    toneDot = "bg-muted-foreground/40";
  }

  return (
    <div className="group relative min-w-0 rounded-xl border border-transparent px-2.5 py-2.5 transition-colors hover:border-border/40 hover:bg-muted/30">
      <div className="flex items-center gap-1.5">
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </span>
        <dt className="truncate text-[11px] text-muted-foreground leading-none tracking-[0.02em]">
          {label}
        </dt>
      </div>
      <dd className="mt-1.5 flex items-baseline gap-1.5">
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", toneDot)}
        />
        {/* §15 Tight tracking on large number, tabular-nums for stability */}
        <span className="font-semibold text-[22px] text-foreground tabular-nums leading-none tracking-[-0.02em]">
          {value}
        </span>
      </dd>
    </div>
  );
}

function FigureGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em]">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3">
        {children}
      </dl>
    </div>
  );
}

function MonthPill({ label, value }: { label: string; value: string }) {
  const isDash = value === "—";
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 rounded-full border px-3 py-2 transition-colors",
        isDash
          ? "border-border/40 bg-muted/30"
          : "border-border/60 bg-card shadow-xs"
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tracking-[0.02em]">
        {label === "Received" ? (
          <ArrowDownToLine aria-hidden className="size-3" />
        ) : (
          <ArrowUpFromLine aria-hidden className="size-3" />
        )}
        {label}
      </span>
      <motion.span
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "font-semibold tabular-nums leading-none tracking-[-0.015em]",
          isDash
            ? "text-muted-foreground/50 text-sm"
            : "text-[15px] text-foreground"
        )}
        initial={{ opacity: 0, y: 4 }}
        key={`${label}-${value}`}
        transition={{ damping: 30, stiffness: 380, type: "spring" }}
      >
        {value}
      </motion.span>
    </div>
  );
}

export function SummaryBlock({
  activity,
  asOf,
  category,
  monthLabel,
  summary,
}: {
  activity: MonthActivity;
  asOf: string;
  category: string;
  monthLabel: string;
  summary: StockSummary;
}) {
  const isFiltered = category !== "All";

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      aria-label="Month summary"
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card",
        /* §12 Bigger surface = thicker material */
        "shadow-[0_1px_3px_oklch(0_0_0/0.06),0_8px_24px_oklch(0_0_0/0.04),inset_0_1px_0_0_oklch(1_0_0/0.55)]",
        "dark:shadow-[0_1px_3px_oklch(0_0_0/0.25),0_8px_24px_oklch(0_0_0/0.2),inset_0_1px_0_0_oklch(1_0_0/0.08)]"
      )}
      initial={{ opacity: 0, y: 8 }}
      transition={{ damping: 28, stiffness: 320, type: "spring" }}
    >
      {/* Header — §12 translucent strip where chrome meets content */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-border/60 border-b bg-muted/[0.35] px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="hidden size-7 items-center justify-center rounded-full bg-foreground text-background shadow-sm sm:flex">
            <Archive aria-hidden className="size-3.5" />
          </span>
          <div>
            <h2 className="font-semibold text-[13px] leading-none tracking-[-0.01em]">
              Stock summary
            </h2>
            <p className="mt-0.5 hidden text-[11px] text-muted-foreground tracking-[0.01em] sm:block">
              Live snapshot · {isFiltered ? category : "All categories"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card px-2.5 py-1 font-medium tracking-[0.02em] shadow-xs">
            <Clock3 aria-hidden className="size-3 text-muted-foreground" />
            <span className="tabular-nums">{asOf}</span>
          </span>
          <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-1 font-medium text-background text-xs tracking-[-0.01em] shadow-sm">
            {monthLabel}
          </span>
        </div>
      </div>

      {/* Three groups — §16 hierarchy: order + spacing + contrast */}
      <div className="grid gap-5 px-4 py-4 sm:px-5 sm:py-5 lg:grid-cols-[1.15fr_1.35fr_0.9fr] lg:gap-0 lg:divide-x lg:divide-border/50">
        <div className="lg:pr-5">
          <FigureGroup title="Stock totals">
            <Figure
              icon={<Boxes aria-hidden className="size-3" />}
              label="Medicines"
              value={
                <motion.span
                  animate={{ opacity: 1 }}
                  initial={{ opacity: 0 }}
                  key={`meds-${summary.medicines}`}
                  transition={{ duration: 0.2 }}
                >
                  {summary.medicines}
                </motion.span>
              }
            />
            <Figure
              icon={<Package aria-hidden className="size-3" />}
              label="Units on hand"
              value={summary.unitsOnHand}
            />
            <Figure
              icon={<Layers aria-hidden className="size-3" />}
              label="Categories"
              value={summary.categories}
            />
          </FigureGroup>
        </div>

        <div className="border-border/40 border-t pt-5 lg:border-t-0 lg:px-5 lg:pt-0">
          <FigureGroup title="Shelf health">
            <Figure
              icon={<AlertTriangle aria-hidden className="size-3" />}
              label="Low stock"
              tone={summary.low > 0 ? "warn" : "muted"}
              value={summary.low}
            />
            <Figure
              icon={<Archive aria-hidden className="size-3" />}
              label="Out of stock"
              tone={summary.out > 0 ? "danger" : "muted"}
              value={summary.out}
            />
            <Figure
              icon={<Timer aria-hidden className="size-3" />}
              label="Expiring ≤ 30d"
              tone={summary.expiringSoon > 0 ? "warn" : "muted"}
              value={summary.expiringSoon}
            />
            <Figure
              icon={<Clock3 aria-hidden className="size-3" />}
              label="Expiring ≤ 90d"
              tone={summary.expiringLater > 0 ? "warn" : "muted"}
              value={summary.expiringLater}
            />
            <Figure
              icon={<AlertTriangle aria-hidden className="size-3" />}
              label="Expired"
              tone={summary.expired > 0 ? "danger" : "muted"}
              value={summary.expired}
            />
          </FigureGroup>
        </div>

        <div className="border-border/40 border-t pt-5 lg:border-t-0 lg:pt-0 lg:pl-5">
          <h3 className="mb-2.5 font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em]">
            This month
          </h3>
          <div className="grid gap-2">
            <MonthPill label="Received" value={activity.received} />
            <MonthPill label="Dispensed" value={activity.dispensed} />
            <p className="px-1 text-[11px] text-muted-foreground/70 leading-relaxed tracking-[0.01em]">
              Only this section follows the month picker. Stock stays live.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom provenance — §12 scroll edge hint, §15 caption */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-border/40 border-t bg-muted/20 px-4 py-2 sm:px-5">
        <span className="text-[11px] text-muted-foreground tracking-[0.02em]">
          {summary.medicines} medicines · {summary.unitsOnHand} units
          {isFiltered ? ` · ${category}` : null}
        </span>
        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
          {monthLabel}
        </span>
      </div>
    </motion.section>
  );
}
