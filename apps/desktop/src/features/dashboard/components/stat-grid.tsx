/**
 * CMIS-UI-01 §3 / §4 — Key-numbers grid.
 *
 * Four stat cards in a responsive 2×2 (mobile) → 4×1 (desktop) grid.
 * Uses DashboardMetricCard from components.md spec.
 *
 * Apple Design §4 — Stagger springs: each card enters with a slight delay,
 * creating a cascading reveal that telegraphs hierarchy (§8 hint).
 * Apple Design §12 — Cards are glass materials; grid is semantic grouping.
 */

import { Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, Clock, Package } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { densitySpring } from "@/lib/motion";
import type { DashboardLinkKey, HomeStat } from "../types";
import type { TrendType } from "./dashboard-metric-card";
import { DashboardMetricCard } from "./dashboard-metric-card";

const STAT_ICONS: Record<string, React.ElementType> = {
  expiry: Clock,
  inventory: Package,
  lowStock: AlertTriangle,
  requests: ClipboardList,
};

function toneToTrendType(tone: string): TrendType {
  if (tone === "ok") {
    return "up";
  }
  if (tone === "danger") {
    return "down";
  }
  return "neutral";
}

export function StatGrid({
  links,
  stats,
}: {
  links: Record<DashboardLinkKey, string>;
  stats: HomeStat[];
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { ...densitySpring, staggerChildren: 0.06 }
      }
    >
      {stats.map((stat) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          key={stat.label}
          transition={densitySpring}
        >
          <Link to={links[stat.link]}>
            <DashboardMetricCard
              icon={STAT_ICONS[stat.link]}
              title={stat.label}
              trendChange={stat.context}
              trendType={toneToTrendType(stat.tone)}
              value={stat.value}
            />
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
