"use client";

import { motion } from "motion/react";
import { XAxis } from "@/components/charts/axes/x-axis";
import { Grid } from "@/components/charts/grid";
import { Line } from "@/components/charts/line/line";
import { LineChart } from "@/components/charts/line/line-chart";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import type { LowStockPoint } from "../types";
import { EmptyWidget, WidgetCard } from "./widget-card";

export function LowStockTrendWidget({ data }: { data: LowStockPoint[] }) {
  if (data.length === 0) {
    return (
      <WidgetCard
        subtitle="Items below reorder point over time"
        title="Low-Stock Trend"
      >
        <EmptyWidget message="No low-stock trend in this period." />
      </WidgetCard>
    );
  }

  const last = data.at(-1);
  const first = data[0];
  if (!(last && first)) {
    return (
      <WidgetCard
        subtitle="Items below reorder point over time"
        title="Low-Stock Trend"
      >
        <EmptyWidget message="No low-stock trend in this period." />
      </WidgetCard>
    );
  }
  // LineChart expects Record<string, unknown>[] with xDataKey="date"
  const chartData = data as unknown as Record<string, unknown>[];

  return (
    <WidgetCard
      subtitle={`System stress trending · ${last.count} items now (was ${first.count})`}
      title="Low-Stock Trend"
    >
      <motion.div
        animate={{ opacity: 1 }}
        className="relative overflow-hidden rounded-md border bg-card"
        initial={{ opacity: 0.6 }}
        key={`${first.date}-${data.length}`}
        transition={{ duration: 0.18 }}
      >
        <LineChart
          animationDuration={1100}
          aspectRatio="2.2 / 1"
          className="h-[168px] w-full"
          data={chartData}
          margin={{ bottom: 28, left: 12, right: 16, top: 12 }}
          style={{ height: 168 }}
          xDataKey="date"
          yDomainTween
        >
          <Grid horizontal />
          <Line
            dataKey="count"
            fadeEdges
            stroke="var(--foreground)"
            strokeWidth={2.5}
          />
          <XAxis />
          <ChartTooltip
            rows={(point) => [
              {
                color: "var(--foreground)",
                label: "Low stock",
                value: (point.count as number) ?? 0,
              },
            ]}
          />
        </LineChart>
      </motion.div>

      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground leading-none">
        <span>{first.label}</span>
        <span>{last.label}</span>
      </div>
    </WidgetCard>
  );
}
