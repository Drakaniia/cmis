"use client";

import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { KeyboardEvent } from "react";
import { memo } from "react";
import { BarChart } from "@/components/charts/bar/bar-chart";
import { BarYAxis } from "@/components/charts/bar/bar-y-axis";
import { useChart } from "@/components/charts/chart-context";
import { Grid } from "@/components/charts/grid";
import { transitionWithDelay } from "@/components/charts/motion-utils";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { chartNumber } from "@/lib/chart-number";
import type { ExpiryBucket } from "../types";
import { EmptyWidget, WidgetCard } from "./widget-card";

function fillForUrgency(
  urgencyMap: Map<string, ExpiryBucket["urgency"]>,
  label: string
): string {
  const urgency = urgencyMap.get(label);
  if (!urgency) {
    return "var(--chart-3)";
  }
  return urgencyFill[urgency];
}

const urgencyFill: Record<ExpiryBucket["urgency"], string> = {
  caution: "var(--chart-3)",
  danger: "var(--destructive)",
  warn: "var(--warning)",
};

const urgencyLabel: Record<ExpiryBucket["urgency"], string> = {
  caution: "90d+",
  danger: "≤30d",
  warn: "31–90d",
};

function expiryTooltipRows(point: Record<string, unknown>) {
  const urgency =
    point.urgency === "danger" ||
    point.urgency === "warn" ||
    point.urgency === "caution"
      ? point.urgency
      : "caution";
  return [
    {
      color: urgencyFill[urgency],
      label: String(point.label ?? ""),
      value: chartNumber(point.count),
    },
  ];
}

const ExpiryBars = memo(function ExpiryBarsImpl({
  urgencyMap,
}: {
  urgencyMap: Map<string, ExpiryBucket["urgency"]>;
}) {
  const {
    data,
    barScale,
    bandWidth,
    barXAccessor,
    yScale,
    isLoaded,
    hoveredBarIndex,
    animationDuration,
    enterTransition,
    revealEpoch = 0,
  } = useChart();

  const navigate = useNavigate();

  // biome-ignore lint/suspicious/noEqualsToNull: bandWidth is `number | undefined`, nullish check narrows both
  if (!(barScale && bandWidth != null && barXAccessor && yScale)) {
    return null;
  }

  const totalDuration = animationDuration || 1100;
  const staggerSpread = totalDuration * 0.4;
  const staggerDelay = data.length > 1 ? staggerSpread / 1000 / data.length : 0;

  return (
    <g>
      {data.map((d, i) => {
        const rawLabel = barXAccessor(d);
        const bandPos = barScale(rawLabel) ?? 0;
        const value = chartNumber(d.count);
        const barHeight = bandWidth;
        const y = bandPos;
        const x = 0;
        const barW = chartNumber(yScale(value));
        const fill = fillForUrgency(urgencyMap, String(d.label));
        const isFaded = hoveredBarIndex !== null && hoveredBarIndex !== i;
        const rx = 6;
        const barKey = `expiry-${String(d.label)}-${String(d.monthKey)}`;

        const handleClick = () => {
          const { monthKey } = d;
          if (typeof monthKey !== "string" || monthKey.length === 0) {
            return;
          }
          navigate({ to: "/admin/inventory/expiry" }).then(
            () => undefined,
            () => undefined
          );
        };

        const handleBarKeyDown = (event: KeyboardEvent<SVGGElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleClick();
          }
        };

        const enterAnim = transitionWithDelay(
          enterTransition,
          i * staggerDelay
        );

        if (!isLoaded) {
          return (
            <g
              key={barKey}
              onClick={handleClick}
              onKeyDown={handleBarKeyDown}
              opacity={isFaded ? 0.3 : 1}
              role="button"
              style={{
                cursor: "pointer",
                transition: "opacity 0.15s ease-in-out",
              }}
              tabIndex={0}
            >
              <motion.rect
                animate={{ height: barHeight, width: barW, x: 0, y }}
                aria-label={`${String(d.label)}: ${value} batches`}
                fill={fill}
                initial={{ height: barHeight, width: 0, x: 0, y }}
                key={`${barKey}-grow-${revealEpoch}`}
                rx={rx}
                ry={rx}
                transition={enterAnim}
              />
              <motion.text
                animate={{ opacity: 1 }}
                className="tabular-nums"
                fill="var(--foreground)"
                fontSize={11}
                fontWeight={600}
                initial={{ opacity: 0 }}
                transition={transitionWithDelay(
                  enterTransition,
                  i * staggerDelay + 0.15
                )}
                x={barW + 6}
                y={y + barHeight / 2 + 3.5}
              >
                {value}
              </motion.text>
            </g>
          );
        }

        return (
          <g
            key={barKey}
            onClick={handleClick}
            onKeyDown={handleBarKeyDown}
            opacity={isFaded ? 0.3 : 1}
            role="button"
            style={{
              cursor: "pointer",
              transition: "opacity 0.15s ease-in-out",
            }}
            tabIndex={0}
          >
            <rect
              aria-label={`${String(d.label)}: ${value} batches`}
              fill={fill}
              height={barHeight}
              rx={rx}
              ry={rx}
              width={barW}
              x={x}
              y={y}
            />
            <text
              className="tabular-nums"
              fill="var(--foreground)"
              fontSize={11}
              fontWeight={600}
              x={barW + 6}
              y={y + barHeight / 2 + 3.5}
            >
              {value}
            </text>
          </g>
        );
      })}
    </g>
  );
});

export function ExpiryTimelineWidget({ buckets }: { buckets: ExpiryBucket[] }) {
  if (buckets.length === 0 || buckets.every((b) => b.count === 0)) {
    return (
      <WidgetCard subtitle="Grouped by expiry month" title="Expiry Timeline">
        <EmptyWidget message="No expiries in the filtered set." />
      </WidgetCard>
    );
  }

  const chartData = buckets.map((b) => ({
    count: b.count,
    label: b.label,
    monthKey: b.monthKey,
    urgency: b.urgency,
  })) as unknown as Record<string, unknown>[];

  const urgencyMap = new Map(buckets.map((b) => [b.label, b.urgency] as const));

  const revealSignature = `${buckets[0]?.monthKey}-${buckets.length}-${buckets.map((b) => b.count).join(",")}`;

  return (
    <WidgetCard
      subtitle="Click a bar to review that month in Expiry Alerts — bLKit horizontal"
      title="Expiry Timeline"
    >
      <div className="relative overflow-hidden rounded-md border bg-card">
        <BarChart
          animationDuration={1100}
          aspectRatio="2.2 / 1"
          barGap={0.28}
          className="h-[180px] w-full"
          data={chartData}
          margin={{ bottom: 12, left: 84, right: 32, top: 8 }}
          orientation="horizontal"
          revealSignature={revealSignature}
          xDataKey="label"
        >
          <Grid horizontal={false} vertical />
          <ExpiryBars urgencyMap={urgencyMap} />
          <BarYAxis />
          <ChartTooltip rows={expiryTooltipRows} showCrosshair={false} />
        </BarChart>
      </div>
      <div className="mt-3 flex gap-2 text-[10px] text-muted-foreground leading-none">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-destructive" />{" "}
          {urgencyLabel.danger}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-[var(--warning)]" />{" "}
          {urgencyLabel.warn}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-[var(--chart-3)]" />{" "}
          {urgencyLabel.caution}
        </span>
      </div>
    </WidgetCard>
  );
}
