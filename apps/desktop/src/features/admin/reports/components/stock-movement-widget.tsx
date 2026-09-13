"use client";

import { motion } from "motion/react";
import * as React from "react";
import { Area } from "@/components/charts/area/area";
import { AreaChart } from "@/components/charts/area/area-chart";
import { XAxis } from "@/components/charts/axes/x-axis";
import { useChart } from "@/components/charts/chart-context";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import type { StockMovementPoint } from "../types";
import { EmptyWidget, WidgetCard } from "./widget-card";

function StockMovementHoverSync({
  data,
  onHover,
}: {
  data: StockMovementPoint[];
  onHover?: (point: StockMovementPoint | null) => void;
}) {
  const { tooltipData } = useChart();
  const lastIndexRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!onHover) {
      return;
    }
    if (tooltipData === null) {
      if (lastIndexRef.current !== null) {
        lastIndexRef.current = null;
        onHover(null);
      }
      return;
    }
    if (lastIndexRef.current === tooltipData.index) {
      return;
    }
    lastIndexRef.current = tooltipData.index;
    const point = data[tooltipData.index];
    if (point) {
      onHover(point);
    }
  }, [tooltipData, data, onHover]);

  return null;
}

export function StockMovementWidget({
  data,
  onHover,
}: {
  data: StockMovementPoint[];
  onHover?: (point: StockMovementPoint | null) => void;
}) {
  if (data.length === 0) {
    return (
      <WidgetCard subtitle="Inbound vs outbound" title="Stock Movement">
        <EmptyWidget message="No movement in this period. Widen the date range." />
      </WidgetCard>
    );
  }

  const chartData = data as unknown as Record<string, unknown>[];

  return (
    <WidgetCard
      subtitle="Inbound vs outbound — shared time axis"
      title="Stock Movement"
    >
      <div className="mb-2 flex items-center gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full bg-[var(--chart-1)]"
          />
          In
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full bg-[var(--chart-2)]"
          />
          Out
        </span>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {data.length} points
        </span>
      </div>

      <motion.div
        animate={{ opacity: 1 }}
        className="relative overflow-hidden rounded-md border bg-card"
        initial={{ opacity: 0.6 }}
        key={`${data[0]?.date}-${data.length}`}
        transition={{ duration: 0.18 }}
      >
        <AreaChart
          animationDuration={1100}
          aspectRatio="2.2 / 1"
          className="h-[168px] w-full"
          data={chartData}
          margin={{ bottom: 28, left: 12, right: 16, top: 12 }}
          revealSignature={`${data[0]?.date}-${data.length}`}
          style={{ height: 168 }}
          xDataKey="date"
        >
          <Grid horizontal />
          <Area
            dataKey="in"
            fadeEdges
            fill="var(--chart-1)"
            fillOpacity={0.3}
            stroke="var(--chart-1)"
            strokeWidth={2}
          />
          <Area
            dataKey="out"
            fadeEdges
            fill="var(--chart-2)"
            fillOpacity={0.3}
            stroke="var(--chart-2)"
            strokeWidth={2}
          />
          <XAxis />
          <ChartTooltip
            rows={(point) => [
              {
                color: "var(--chart-1)",
                label: "In",
                value: (point.in as number) ?? 0,
              },
              {
                color: "var(--chart-2)",
                label: "Out",
                value: (point.out as number) ?? 0,
              },
            ]}
          />
          {onHover ? (
            <StockMovementHoverSync data={data} onHover={onHover} />
          ) : null}
        </AreaChart>
      </motion.div>

      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground leading-none">
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </div>
    </WidgetCard>
  );
}
