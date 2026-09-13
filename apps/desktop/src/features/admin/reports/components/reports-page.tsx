"use client";

import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { downloadReportsCsv } from "../export-reports";
import { useReportsFilters } from "../hooks/use-reports-filters";
import {
  mockExpiryBuckets,
  mockFulfillment,
  mockLowStockTrend,
  mockStockMovement,
  mockTopDispensed,
  mockUsageByCategory,
} from "../mock";
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
export function ReportsPage() {
  const { filters, setCategory, setPreset } = useReportsFilters();
  const reduceMotion = useReducedMotion();

  const movement = mockStockMovement(filters.preset, filters.category);
  const lowStock = mockLowStockTrend(filters.preset, filters.category);
  const expiry = mockExpiryBuckets(filters.category);
  const usage = mockUsageByCategory(filters.category, filters.preset);
  const fulfillment = mockFulfillment(filters.category);
  const top = mockTopDispensed(filters.category, filters.preset);

  const hasData = movement.length > 0;

  function handleExportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadReportsCsv(
      {
        category: filters.category,
        expiry,
        fulfillment,
        lowStock,
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
  }

  function handleExportPdf() {
    // PDF generation is presentation-grade (cover + chart images).
    // Keep as client-print placeholder — respects Agency: no fake download.
    toast.message("PDF export", {
      description:
        "Use Print (Ctrl+P) for paginated report. Native PDF via print is next.",
    });
    if (typeof window !== "undefined") {
      window.print();
    }
  }

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
      <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3 sm:p-4">
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
            <LowStockTrendWidget data={lowStock} />
            <ExpiryTimelineWidget buckets={expiry} />
            <UsageDonutWidget data={usage} />
            <DispensedVsRequestedWidget data={fulfillment} />
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
      </div>
    </div>
  );
}
