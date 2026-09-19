import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { AdminHealthRow } from "@/features/dashboard/components/admin-health-row";
import { AlertsBand } from "@/features/dashboard/components/alerts-band";
import { DashboardMonthFilter } from "@/features/dashboard/components/dashboard-month-filter";
import { StatGrid } from "@/features/dashboard/components/stat-grid";
import {
  useDashboardStats,
  useDispensingVelocity,
  useHourlyActivity,
  useStockAdjustments,
} from "@/features/dashboard/hooks/use-dashboard-stats";
import { dashboardLinks } from "@/features/dashboard/links";
import { NoInventoryEmptyState } from "@/features/inventory/components/no-inventory-empty-state";
import { buildExpiryRows } from "@/features/inventory/domain/expiry";
import { buildLowStockRows } from "@/features/inventory/domain/low-stock";
import { useInventoryItems } from "@/features/inventory/hooks/use-inventory-items";
import { isMonthKey, monthKey } from "@/lib/month";

export interface AdminSearch {
  month?: string;
}

function validateAdminSearch(search: Record<string, unknown>): AdminSearch {
  const { month } = search;
  if (typeof month === "string" && isMonthKey(month)) {
    return { month };
  }
  return {};
}

export const Route = createFileRoute("/admin/")({
  component: AdminIndex,
  validateSearch: validateAdminSearch,
});

const links = dashboardLinks();

function AdminIndex() {
  const { month } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeMonth = month ?? monthKey();

  const handleMonthChange = useCallback(
    (next: string) => {
      const cur = monthKey();
      navigate({
        replace: true,
        search: next === cur ? {} : { month: next },
      });
    },
    [navigate]
  );

  const { data: stats } = useDashboardStats();
  const { data: inventory, isLoading: inventoryLoading } = useInventoryItems();
  const { data: velocity } = useDispensingVelocity(activeMonth);
  const { data: hourly } = useHourlyActivity();
  const { data: adjustments } = useStockAdjustments();

  const totalItems = stats?.totalItems ?? 0;
  const isEmpty = totalItems === 0 && inventory?.length === 0;

  if (isEmpty) {
    return (
      <NoInventoryEmptyState description="Import your inventory CSV to see dashboard metrics." />
    );
  }

  const homeStats = [
    {
      context: `${stats?.sparkline[stats.sparkline.length - 1] ?? 0} this week`,
      label: "TOTAL ITEMS",
      link: "inventory" as const,
      sparkline: stats?.sparkline ?? [0, 0, 0, 0, 0, 0, 0],
      tone: "ok" as const,
      value: String(stats?.totalItems ?? 0),
    },
    {
      context: `${stats?.lowStock ?? 0} below threshold`,
      label: "LOW STOCK",
      link: "lowStock" as const,
      sparkline: stats?.sparkline ?? [0, 0, 0, 0, 0, 0, 0],
      tone: "warn" as const,
      value: String(stats?.lowStock ?? 0),
    },
    {
      context: "live from requests",
      label: "PENDING REQUESTS",
      link: "requests" as const,
      sparkline: [0, 0, 0, 0, 0, 0, stats?.pendingRequests ?? 0],
      tone: "warn" as const,
      value: String(stats?.pendingRequests ?? 0),
    },
    {
      context: stats?.needsBatch
        ? `${stats.needsBatch} need batch`
        : "all have batches",
      label: "EXPIRING IN 30D",
      link: "expiry" as const,
      sparkline: [0, 0, 0, 0, 0, 0, stats?.expiring30d ?? 0],
      tone: "danger" as const,
      value: String(stats?.expiring30d ?? 0),
    },
  ];

  const expiryAlerts = inventory
    ? buildExpiryRows(inventory)
        .slice(0, 5)
        .map((r) => ({
          batch: r.batch.batch,
          daysUntilExpiry: r.daysUntil,
          expiry: r.batch.expiry,
          id: r.batch.batch,
          medicine: r.item.name,
          qty: r.batch.qty,
          unit: "units",
        }))
    : [];

  const lowStockAlerts = inventory
    ? buildLowStockRows(inventory)
        .filter((r) => r.lowStockStatus !== "in-stock")
        .slice(0, 5)
        .map((r) => ({
          category: r.item.category,
          id: r.item.id,
          medicine: r.item.name,
          qty: r.item.qty,
          threshold: r.item.threshold,
          unit: "left",
          updatedAt: "now",
        }))
    : [];

  const dispensingVelocity = velocity ?? {
    categoryBreakdown: [{ color: "bg-muted", count: 0, label: "No data" }],
    changePercent: 0,
    dailyCounts: Array.from({ length: 7 }, () => ({ count: 0, label: "-" })),
    todayTotal: 0,
  };
  const hourlyActivity =
    hourly ??
    Array.from({ length: 24 }, (_, hour) => ({
      dispensed: 0,
      hour,
      requests: 0,
    }));
  const stockAdjustments = adjustments ?? {
    discrepancies: { count: 0, items: [] },
    flagged: { count: 0, items: [] },
    transfers: { count: 0, items: [] },
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8">
      <div className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
        <section aria-label="Alerts">
          <AlertsBand
            expiry={expiryAlerts}
            links={links}
            loading={inventoryLoading}
            lowStock={lowStockAlerts}
          />
        </section>
        <section aria-label="Key numbers">
          <StatGrid links={links} stats={homeStats} />
        </section>
      </div>
      {/* Month filter — controls only Dispensing velocity (user choice), §12 pill, §1 press-feedback */}
      <div className="mt-4 flex items-center justify-between gap-3 sm:mt-5">
        <p className="text-caption text-muted-foreground">
          <span className="hidden sm:inline">Dispensing velocity • </span>
          <span className="sm:hidden">Velocity • </span>
          <span className="font-medium text-foreground">{activeMonth}</span>
          {activeMonth === monthKey() ? null : (
            <span className="ml-1 text-muted-foreground">(filtered)</span>
          )}
        </p>
        <DashboardMonthFilter
          onChange={handleMonthChange}
          value={activeMonth}
        />
      </div>
      <div className="mt-3 space-y-4 sm:mt-4">
        <section aria-label="System health and activity">
          <AdminHealthRow
            dispensingVelocity={dispensingVelocity}
            hourly={hourlyActivity}
            links={links}
            stockAdjustments={stockAdjustments}
          />
        </section>
      </div>
    </div>
  );
}
