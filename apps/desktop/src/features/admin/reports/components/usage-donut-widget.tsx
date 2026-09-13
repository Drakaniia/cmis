"use client";

import { useCallback, useMemo, useState } from "react";
import { Ring } from "@/components/charts/ring/ring";
import { RingCenter } from "@/components/charts/ring/ring-center";
import { RingChart } from "@/components/charts/ring/ring-chart";
import type { RingData } from "@/components/charts/ring/ring-context";
import type { CategoryUsage } from "../types";
import { EmptyWidget, WidgetCard } from "./widget-card";

function UsageLegendItem({
  color,
  hovered,
  index,
  label,
  onHoverChange,
  pct,
  value,
}: {
  color: string | undefined;
  hovered: boolean;
  index: number;
  label: string;
  onHoverChange: (index: number | null) => void;
  pct: number;
  value: number;
}) {
  const handleMouseEnter = useCallback(
    () => onHoverChange(index),
    [index, onHoverChange]
  );
  const handleMouseLeave = useCallback(
    () => onHoverChange(null),
    [onHoverChange]
  );

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: legend row hover syncs highlight with ring chart
    <li
      className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors ${
        hovered ? "bg-muted" : "bg-transparent"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {pct}%
      </span>
      <span className="shrink-0 font-semibold tabular-nums">{value}</span>
    </li>
  );
}

export function UsageDonutWidget({ data }: { data: CategoryUsage[] }) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  if (total === 0) {
    return (
      <WidgetCard
        subtitle="Dispensing volume by category"
        title="Usage by Category"
      >
        <EmptyWidget message="No dispensing volume in this period." />
      </WidgetCard>
    );
  }

  return <UsageRingChart data={data} total={total} />;
}

function UsageRingChart({
  data,
  total,
}: {
  data: CategoryUsage[];
  total: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // RingChart expects each ring's progress = value / maxValue.
  // Use total as maxValue so each concentric ring's arc length
  // represents its share of overall dispensing volume.
  const ringData: RingData[] = useMemo(
    () =>
      data.slice(0, 6).map((d) => ({
        color: d.color,
        label: d.category,
        maxValue: total,
        value: d.value,
      })),
    [data, total]
  );

  // Adaptive sizing: keep rings legible for 1..6 items
  const count = ringData.length;
  const strokeWidth = count > 4 ? 8 : 10;
  const ringGap = count > 4 ? 3 : 4;
  const baseInnerRadius = (() => {
    if (count === 1) {
      return 42;
    }
    if (count <= 3) {
      return 34;
    }
    return 28;
  })();

  return (
    <WidgetCard
      subtitle="Concentric rings — share of total dispensing"
      title="Usage by Category"
    >
      <div className="flex items-center gap-4">
        {/* Chart — fixed size keeps layout stable across filter changes */}
        <div className="relative flex size-[160px] shrink-0 items-center justify-center sm:size-[172px]">
          <RingChart
            baseInnerRadius={baseInnerRadius}
            data={ringData}
            hoveredIndex={hoveredIndex}
            onHoverChange={setHoveredIndex}
            ringGap={ringGap}
            size={168}
            strokeWidth={strokeWidth}
          >
            {ringData.map((_, i) => (
              <Ring index={i} key={ringData[i]?.label ?? i} />
            ))}
            <RingCenter defaultLabel="Total" />
          </RingChart>
        </div>

        {/* Legend — hover syncs with rings via controlled hoveredIndex */}
        <ul className="min-w-0 flex-1 space-y-1.5">
          {ringData.map((d, i) => {
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
            return (
              <UsageLegendItem
                color={d.color}
                hovered={hoveredIndex === i}
                index={i}
                key={d.label}
                label={d.label}
                onHoverChange={setHoveredIndex}
                pct={pct}
                value={d.value}
              />
            );
          })}
          {data.length === 1 ? (
            <li className="px-1.5 text-[11px] text-muted-foreground">
              Filtered to single category — ring is full
            </li>
          ) : null}
        </ul>
      </div>
    </WidgetCard>
  );
}
