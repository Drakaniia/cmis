/**
 * CMIS-UI-01 §5 — Bottom row (v3).
 *
 * Three side-by-side cards:
 * - Dispensing velocity: 7-day bar chart with category breakdown
 * - Activity last 24h: bar chart with event count
 * - Stock adjustments: discrepancies, transfers, flagged items
 *
 * Apple Design — entrance animation.
 */

import { Activity } from "lucide-react";
import { motion } from "motion/react";

import { densitySpring } from "@/lib/motion";
import type {
  DispensingVelocityData,
  HourlyCount,
  StockAdjustmentsData,
} from "../mock";
import type { DashboardLinkKey } from "../types";
import { ActivityStatsCard } from "./activity-stats-card";
import { DispensingVelocityCard } from "./dispensing-velocity-card";
import { StockAdjustmentsCard } from "./stock-adjustments-card";

const SECTION = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 12 },
} as const;

function buildChartData(hourly: HourlyCount[]) {
  const slots = [
    { end: 3, label: "00–03" },
    { end: 6, label: "03–06" },
    { end: 9, label: "06–09" },
    { end: 12, label: "09–12" },
    { end: 15, label: "12–15" },
    { end: 18, label: "15–18" },
    { end: 21, label: "18–21" },
    { end: 24, label: "21–23" },
  ];
  const avg = hourly.reduce((sum, s) => sum + s.requests + s.dispensed, 0) / 24;

  return slots.map(({ end, label }) => {
    const start = end - 3;
    const currentValue = hourly
      .slice(start, end)
      .reduce((s, h) => s + h.requests + h.dispensed, 0);
    return { currentValue, label, previousValue: Math.round(avg * 3) };
  });
}

// ── Row (3 cards) ──────────────────────────────────────────────

export function AdminHealthRow({
  dispensingVelocity,
  hourly,
  links,
  stockAdjustments,
}: {
  dispensingVelocity: DispensingVelocityData;
  hourly: HourlyCount[];
  links: Record<DashboardLinkKey, string>;
  stockAdjustments: StockAdjustmentsData;
}) {
  return (
    <motion.div
      className="grid gap-4 sm:gap-5 lg:grid-cols-3"
      {...SECTION}
      transition={{ ...densitySpring, staggerChildren: 0.04 }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 10 }}
        transition={densitySpring}
      >
        <DispensingVelocityCard data={dispensingVelocity} links={links} />
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 10 }}
        transition={densitySpring}
      >
        <ActivityStatsCard
          changeDescription="vs previous 24h"
          changeValue={
            hourly
              .slice(0, 12)
              .reduce((s, h) => s + h.requests + h.dispensed, 0) -
            hourly
              .slice(12, 24)
              .reduce((s, h) => s + h.requests + h.dispensed, 0)
          }
          chartData={buildChartData(hourly)}
          className="h-full"
          icon={<Activity aria-hidden="true" className="h-4 w-4" />}
          mainValue={`${hourly.reduce((s, h) => s + h.requests + h.dispensed, 0)} events`}
          onActionClick={() => window.location.assign(links.audit)}
          title="Activity, last 24h"
        />
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 10 }}
        transition={densitySpring}
      >
        <StockAdjustmentsCard data={stockAdjustments} links={links} />
      </motion.div>
    </motion.div>
  );
}
