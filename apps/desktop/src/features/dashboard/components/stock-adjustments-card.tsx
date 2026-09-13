/**
 * CMIS-UI-01 §5 — Stock adjustments card.
 *
 * Compact card showing three categories of adjustments:
 * discrepancies (physical vs system count), inter-branch transfers,
 * and flagged items (damaged, expired-but-not-logged, etc.).
 *
 * Status-oriented: neutral by default; only shows warning tone when
 * a category has items needing attention.
 */

import { cn } from "@cmis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CircleAlert,
  CircleCheck,
  FileWarning,
} from "lucide-react";
import { motion } from "motion/react";
import { densitySpring } from "@/lib/motion";
import type { StockAdjustmentsData } from "../mock";
import type { DashboardLinkKey } from "../types";

const SECTION = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 12 },
} as const;

function SectionRow({
  count,
  icon: Icon,
  items,
  label,
  tone,
}: {
  count: number;
  icon: React.ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
  items: { detail: string; medicine: string }[];
  label: string;
  tone: "default" | "warning";
}) {
  return (
    <div className="border-border/30 border-b px-4 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs">
          <Icon
            aria-hidden
            className={cn(
              "size-3.5",
              tone === "warning"
                ? "text-[var(--warning)]"
                : "text-muted-foreground"
            )}
          />
          <span className="text-muted-foreground">{label}</span>
        </span>
        <span
          className={cn(
            "font-medium text-xs tabular-nums",
            tone === "warning" ? "text-[var(--warning)]" : "text-foreground"
          )}
        >
          {count}
        </span>
      </div>
      {count > 0 && items.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
          {items[0].medicine} — {items[0].detail}
        </p>
      ) : null}
    </div>
  );
}

export function StockAdjustmentsCard({
  data,
  links,
}: {
  data: StockAdjustmentsData;
  links: Record<DashboardLinkKey, string>;
}) {
  const total =
    data.discrepancies.count + data.transfers.count + data.flagged.count;
  const hasAny = total > 0;

  return (
    <motion.div
      className="canvas-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl"
      {...SECTION}
      transition={densitySpring}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-border/50 border-b px-4 py-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg",
            hasAny ? "bg-[var(--warning)]/10" : "bg-muted"
          )}
        >
          {hasAny ? (
            <CircleAlert
              aria-hidden
              className="size-3.5 text-[var(--warning)]"
            />
          ) : (
            <CircleCheck
              aria-hidden
              className="size-3.5 text-muted-foreground"
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ui">Stock adjustments</h2>
          <p className="text-caption text-muted-foreground">
            Discrepancies, transfers and flagged items
          </p>
        </div>
        <Link
          className="shrink-0 font-medium text-primary text-xs hover:underline"
          to={links.inventory}
        >
          Inventory
        </Link>
      </div>

      {/* Sections */}
      <div className="flex flex-col">
        <SectionRow
          count={data.discrepancies.count}
          icon={CircleAlert}
          items={data.discrepancies.items}
          label="Discrepancies"
          tone={data.discrepancies.count > 0 ? "warning" : "default"}
        />
        <SectionRow
          count={data.transfers.count}
          icon={ArrowLeftRight}
          items={data.transfers.items}
          label="Pending transfers"
          tone="default"
        />
        <SectionRow
          count={data.flagged.count}
          icon={FileWarning}
          items={data.flagged.items}
          label="Flagged items"
          tone={data.flagged.count > 0 ? "warning" : "default"}
        />
      </div>

      {/* Summary footer */}
      <div className="border-border/30 border-t px-4 py-2.5">
        <p className="text-[11px] text-muted-foreground leading-snug">
          {total === 0
            ? "All stock counts verified — no action needed."
            : `${total} item${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} attention.`}
        </p>
      </div>
    </motion.div>
  );
}
