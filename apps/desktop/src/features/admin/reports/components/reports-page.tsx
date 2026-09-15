"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback } from "react";
import { toast } from "sonner";
import { downloadReportsCsv } from "../export-reports";
import {
  useExpiryBuckets,
  useStockMovement,
  useTopDispensed,
  useUsageByCategory,
} from "../hooks/use-reports";
import { useReportsFilters } from "../hooks/use-reports-filters";
import type { FulfillmentPoint, LowStockPoint } from "../types";
import { DispensedVsRequestedWidget } from "./dispensed-vs-requested-widget";
import { ExpiryTimelineWidget } from "./expiry-timeline-widget";
import { LowStockTrendWidget } from "./low-stock-trend-widget";
import { ReportsFilterBar } from "./reports-filter-bar";
import { StockMovementWidget } from "./stock-movement-widget";
import { TopDispensedTable } from "./top-dispensed-table";
import { UsageDonutWidget } from "./usage-donut-widget";

/**
 * CMIS-UI-07 — Reports & Analytics (Admin-only revision).
 *
 * No staff/viewer persona split — single Admin scope. Filters-first
 * layout with sticky translucent bar + 6-widget grid (density-aware).
 * Chart updates cross-fade (not spring grow) per §5; reduce-motion
 * falls back to instant opacity via CSS. Export CSV delivers
 * presentation-grade data; PDF is toast-placeholder until print.
 *
 * Apple §12 material: filter bar is heavy translucent layer; cards
 * use compositor-only motion. Response on pointerdown via
 * press-feedback; every widget reads from the same filter truth.
 */
// Low-stock and fulfillment history have no writer yet — both stay empty until
// the batch/history tables are populated, so the widgets render their empty
// state. Module scope keeps them referentially stable, which is why they are
// not hook dependencies below.
const EMPTY_LOW_STOCK: LowStockPoint[] = [];
const EMPTY_FULFILLMENT: FulfillmentPoint[] = [];

export function ReportsPage() {
  const { filters, setCategory, setPreset } = useReportsFilters();
  const reduceMotion = useReducedMotion();

  // Live queries — default month 2026-08, reports toggle by month in future ticket
  const month = "2026-08";
  const { data: movementData } = useStockMovement(month, filters.category);
  const { data: topData } = useTopDispensed(month, filters.category);
  const { data: expiryData } = useExpiryBuckets(filters.category);
  const { data: usageData } = useUsageByCategory(month);

  const movement = movementData ?? [];
  const expiry = expiryData ?? [];
  const usage = usageData ?? [];
  const top = topData ?? [];

  const hasData = movement.length > 0 || top.length > 0 || expiry.length > 0;
  const isEmptyDb =
    movement.length === 0 && top.length === 0 && usage.length === 0;

  const handleExportCsv = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadReportsCsv(
      {
        category: filters.category,
        expiry,
        fulfillment: EMPTY_FULFILLMENT,
        lowStock: EMPTY_LOW_STOCK,
        movement,
        preset: filters.preset,
        top,
        usage,
      },
      `cmis-reports-${filters.preset}-${stamp}.csv`
    );
    toast.success("Reports CSV exported", {
      description: `cmis-reports-${filters.preset}-${stamp}.csv`,
    });
  }, [expiry, filters.category, filters.preset, movement, top, usage]);

  const handleExportPdf = useCallback(() => {
    // PDF generation is presentation-grade (cover + chart images).
    // Keep as client-print placeholder — respects Agency: no fake download.
    toast.message("PDF export", {
      description:
        "Use Print (Ctrl+P) for paginated report. Native PDF via print is next.",
    });
    if (typeof window !== "undefined") {
      window.print();
    }
  }, []);

  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <ReportsFilterBar
        category={filters.category}
        hasData={hasData}
        onCategoryChange={setCategory}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        onPresetChange={setPreset}
        preset={filters.preset}
      />

      {/* Grid — density-aware breakpoints per spec §6: 2 cols ≥900 Compact, ≥1200 Comfortable */}
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        {isEmptyDb ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <h3 className="font-semibold text-lg">
              No data yet — import CSV to see trends
            </h3>
            <p className="mt-2 text-muted-foreground text-sm">
              After importing your inventory CSV, charts will render from
              dispensing_events.
            </p>
            <a
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
              href="/admin/data"
            >
              Import CSV
            </a>
          </div>
        ) : (
          <div className="mx-auto max-w-[1280px]">
            <motion.div
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2"
              initial={{ opacity: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { delayChildren: 0.04, staggerChildren: 0.05 }
              }
            >
              <StockMovementWidget data={movement} />
              <LowStockTrendWidget data={EMPTY_LOW_STOCK} />
              <ExpiryTimelineWidget buckets={expiry} />
              <UsageDonutWidget data={usage} />
              <DispensedVsRequestedWidget data={EMPTY_FULFILLMENT} />
              <TopDispensedTable rows={top} />
            </motion.div>

            {/* Footer meta — Purpose: provenance without clutter */}
            <p className="mt-4 text-center text-[11px] text-muted-foreground leading-relaxed">
              Generated {new Date().toLocaleString()} · Filters:{" "}
              {filters.preset.toUpperCase()} · {filters.category}
              <span className="mx-1">·</span>
              Offline shows local cache with dimmed charts — not in this mock.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
