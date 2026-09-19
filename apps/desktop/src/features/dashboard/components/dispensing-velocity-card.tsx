/**
 * CMIS-UI-01 §5 — Dispensing velocity card.
 *
 * Chart-based card showing dispensed items over the last7 days with a
 * category breakdown legend. Replaces the old System health card.
 *
 * Status-oriented: neutral by default, no warning unless data is anomalous.
 */

import { cn } from "@cmis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Pill, TrendingDown, TrendingUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { densitySpring } from "@/lib/motion";
import type { DashboardLinkKey, DispensingVelocityData } from "../types";

const SECTION = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 12 },
} as const;

export function DispensingVelocityCard({
  data,
  links,
}: {
  data: DispensingVelocityData;
  links: Record<DashboardLinkKey, string>;
}) {
  const maxCount = Math.max(...data.dailyCounts.map((d) => d.count));
  const isUp = data.changePercent > 0;
  const reduceMotion = useReducedMotion();
  const signature = data.dailyCounts
    .map((d) => `${d.label}:${d.count}`)
    .join("|");

  return (
    <motion.div
      className="canvas-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl"
      {...SECTION}
      transition={densitySpring}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-border/50 border-b px-4 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Pill aria-hidden className="size-3.5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ui">Dispensing velocity</h2>
          <p className="text-caption text-muted-foreground">Items dispensed</p>
        </div>
        <Link
          className="shrink-0 font-medium text-primary text-xs hover:underline"
          to={links.inventory}
        >
          Inventory
        </Link>
      </div>

      {/* Total + trend — §3 interruptible: keyed cross-fade from presentation value */}
      <div className="flex items-baseline gap-2 px-4 pt-3">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={{ opacity: 1, y: 0 }}
            className="font-bold text-2xl text-foreground tabular-nums tracking-tight"
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            key={`total-${data.todayTotal}-${signature}`}
            transition={densitySpring}
          >
            {data.todayTotal}
          </motion.span>
        </AnimatePresence>
        <motion.span
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "flex items-center gap-0.5 font-medium text-xs",
            isUp
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          )}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          key={`trend-${data.changePercent}-${signature}`}
          transition={densitySpring}
        >
          {isUp ? (
            <TrendingUp aria-hidden className="size-3" />
          ) : (
            <TrendingDown aria-hidden className="size-3" />
          )}
          {Math.abs(data.changePercent)}% vs yesterday
        </motion.span>
      </div>

      {/* Bar chart — 7 days — §3/§4 interruptible spring from presentation height */}
      <div className="mt-3 flex h-24 items-end gap-1.5 px-4">
        {data.dailyCounts.map((day, i) => {
          const heightPct = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
          const isToday = i === data.dailyCounts.length - 1;
          return (
            <div
              className="flex flex-1 flex-col items-center gap-1"
              key={day.label}
            >
              <motion.div
                animate={{ height: `${heightPct}%`, opacity: 1 }}
                aria-label={`${day.label}: ${day.count} dispensed`}
                className={cn(
                  "w-full origin-bottom rounded-t-sm",
                  isToday ? "bg-primary" : "bg-muted"
                )}
                initial={reduceMotion ? false : { height: "0%", opacity: 0 }}
                style={{
                  minHeight: day.count > 0 ? 2 : 0,
                }}
                transition={densitySpring}
              />
              <span
                className={cn(
                  "text-[10px] leading-none",
                  isToday
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {day.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Category breakdown legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-border/30 border-t px-4 pt-3 pb-3">
        {data.categoryBreakdown.map((cat) => (
          <span className="flex items-center gap-1.5 text-xs" key={cat.label}>
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", cat.color)}
            />
            <span className="text-muted-foreground">{cat.label}</span>
            <span className="font-medium text-foreground tabular-nums">
              {cat.count}
            </span>
          </span>
        ))}
      </div>
    </motion.div>
  );
}
