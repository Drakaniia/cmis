"use client";

import { motion } from "motion/react";
import { Bar } from "@/components/charts/bar/bar";
import { BarChart } from "@/components/charts/bar/bar-chart";
import { BarXAxis } from "@/components/charts/bar/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { chartNumber } from "@/lib/chart-number";
import type { FulfillmentPoint } from "../types";
import { EmptyWidget, WidgetCard } from "./widget-card";

function fulfillmentTooltipRows(point: Record<string, unknown>) {
  return [
    {
      color: "var(--muted-foreground)",
      label: "Requested",
      value: chartNumber(point.requested),
    },
    {
      color: "var(--chart-2)",
      label: "Dispensed",
      value: chartNumber(point.dispensed),
    },
  ];
}

export function DispensedVsRequestedWidget({
  data,
}: {
  data: FulfillmentPoint[];
}) {
  if (data.length === 0) {
    return (
      <WidgetCard
        subtitle="Fulfillment rate per category"
        title="Dispensed vs Requested"
      >
        <EmptyWidget message="No fulfillment data in this period." />
      </WidgetCard>
    );
  }

  // Use full category as x-domain key to guarantee uniqueness (avoid "Anti" collision
  // between Antibiotic / Antiseptic when using 4-char slice). Axis shows full name.
  const chartData = data as unknown as Record<string, unknown>[];

  return (
    <WidgetCard
      subtitle="Fulfillment rate per category — grouped bars"
      title="Dispensed vs Requested"
    >
      <div className="mb-2 flex items-center gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full bg-[var(--muted-foreground)] dark:bg-[var(--muted-foreground)]"
          />
          Requested
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full bg-[var(--chart-2)]"
          />
          Dispensed
        </span>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {data.length} categories
        </span>
      </div>

      <motion.div
        animate={{ opacity: 1 }}
        className="relative overflow-hidden rounded-md border bg-card"
        initial={{ opacity: 0.6 }}
        key={`${data[0]?.category}-${data.length}`}
        transition={{ duration: 0.18 }}
      >
        <BarChart
          animationDuration={1100}
          aspectRatio="2.2 / 1"
          barGap={0.22}
          className="h-[168px] w-full"
          data={chartData}
          margin={{ bottom: 28, left: 12, right: 16, top: 12 }}
          revealSignature={`${data[0]?.category}-${data.length}`}
          xDataKey="category"
        >
          <Grid horizontal />
          <Bar
            dataKey="requested"
            fill="var(--muted-foreground)"
            lineCap="round"
          />
          <Bar dataKey="dispensed" fill="var(--chart-2)" lineCap="round" />
          <BarXAxis maxLabels={12} showAllLabels={data.length <= 4} />
          <ChartTooltip rows={fulfillmentTooltipRows} />
        </BarChart>
      </motion.div>

      <p className="mt-2 text-center text-[10px] text-muted-foreground leading-none">
        Dispensed vs requested — fulfillment gap per category
      </p>
    </WidgetCard>
  );
}
