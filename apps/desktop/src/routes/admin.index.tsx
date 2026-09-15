import { createFileRoute } from "@tanstack/react-router";

import { AdminHealthRow } from "@/features/dashboard/components/admin-health-row";
import { AlertsBand } from "@/features/dashboard/components/alerts-band";
import { StatGrid } from "@/features/dashboard/components/stat-grid";
import {
  useDashboardStats,
  useDispensingVelocity,
  useHourlyActivity,
} from "@/features/dashboard/hooks/use-dashboard-stats";
import { dashboardLinks } from "@/features/dashboard/links";
import { NoInventoryEmptyState } from "@/features/inventory/components/no-inventory-empty-state";
import { buildExpiryRows } from "@/features/inventory/domain/expiry";
import { buildLowStockRows } from "@/features/inventory/domain/low-stock";
import { useInventoryItems } from "@/features/inventory/hooks/use-inventory-items";

export const Route = createFileRoute("/admin/")({
  component: AdminIndex,
});

const links = dashboardLinks("admin");

function AdminIndex() {
  const { data: stats } = useDashboardStats();
  const { data: inventory } = useInventoryItems();
  const { data: velocity } = useDispensingVelocity("2026-08");
  const { data: hourly } = useHourlyActivity();

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
  const stockAdjustments = {
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
            lowStock={lowStockAlerts}
          />
        </section>
        <section aria-label="Key numbers">
          <StatGrid links={links} stats={homeStats} />
        </section>
      </div>
      <div className="mt-4 space-y-4 sm:mt-5">
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
