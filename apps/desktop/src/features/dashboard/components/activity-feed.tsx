/**
 * CMIS-UI-01 §6 — Activity feed (reimagined).
 *
 * Chronological list of recent system events with a timeline spine.
 * Each row pairs a coloured status dot with the action, actor, and target
 * (§5.3: colour never stands alone). The list shows the last 10 actions;
 * the full audit trail lives behind the Audit page.
 *
 * Apple Design — staggered entrance: rows fade up one-by-one so the
 * timeline "draws" itself on first paint.
 */

import { Clock } from "lucide-react";
import { motion } from "motion/react";

import { densitySpring } from "@/lib/motion";
import type { ActivityRow } from "../mock";

/**
 * CMIS-UI-01 §3.3 — accent bar color by action type.
 * stock-in: blue, dispense/denied: green/amber, request: amber
 */
const ACTION_ACCENT: Record<string, string> = {
  denied: "bg-amber-500",
  dispensed: "bg-[var(--success)]",
  "expiry warning": "bg-destructive",
  "low stock": "bg-amber-500",
  request: "bg-amber-500",
  "stock in": "bg-blue-500",
};

function accentForAction(action: string): string {
  return ACTION_ACCENT[action.toLowerCase()] ?? "bg-muted-foreground/40";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SECTION = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 12 },
} as const;

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="canvas-card flex items-center justify-center rounded-xl p-8">
        <p className="text-caption text-muted-foreground">No recent activity</p>
      </div>
    );
  }

  return (
    <motion.div
      className="canvas-card flex min-w-0 flex-col overflow-hidden rounded-xl"
      {...SECTION}
      transition={{ ...densitySpring, staggerChildren: 0.03 }}
    >
      <div className="flex items-center gap-2 border-border/50 border-b px-4 py-3">
        <Clock aria-hidden className="size-4 text-muted-foreground" />
        <h2 className="font-semibold text-ui">Recent activity — last 10</h2>
      </div>

      <ul className="relative">
        {/* Timeline spine */}
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-[19px] w-px bg-border/60"
        />

        {rows.map((row, index) => (
          <motion.li
            animate={{ opacity: 1, x: 0 }}
            className="relative flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30"
            initial={{ opacity: 0, x: -6 }}
            key={row.id}
            transition={{ ...densitySpring, delay: index * 0.03 }}
          >
            {/* Timeline node */}
            <span
              aria-hidden
              className="relative z-10 mt-1.5 flex size-[7px] shrink-0 items-center justify-center"
            >
              <span
                className={`size-[7px] rounded-full ${accentForAction(row.action)}`}
              />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs">
                <span className="font-medium">{row.action}</span>{" "}
                <span className="text-muted-foreground">{row.target}</span>
              </p>
              <p className="text-caption text-muted-foreground">
                {row.actor} · {relativeTime(row.timestamp)}
              </p>
            </div>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}
