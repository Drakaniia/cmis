import { createFileRoute } from "@tanstack/react-router";

import { AdminHealthRow } from "@/features/dashboard/components/admin-health-row";
import { AlertsBand } from "@/features/dashboard/components/alerts-band";
import { StatGrid } from "@/features/dashboard/components/stat-grid";
import { dashboardLinks } from "@/features/dashboard/links";
import {
  mockDispensingVelocity,
  mockExpiryAlerts,
  mockHomeStats,
  mockHourlyActivity,
  mockLowStockAlerts,
  mockStockAdjustments,
} from "@/features/dashboard/mock";

export const Route = createFileRoute("/admin/")({
  component: AdminIndex,
});

const links = dashboardLinks("admin");

function AdminIndex() {
  return (
    <div className="page-canvas min-h-[calc(100svh-48px)]">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8">
        {/* ── Triage zone ────────────────────────────────────── */}
        <div className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
          {/* Alerts — most urgent items first */}
          <section aria-label="Alerts">
            <AlertsBand
              expiry={mockExpiryAlerts}
              links={links}
              lowStock={mockLowStockAlerts}
            />
          </section>

          {/* Key numbers — 4 horizontal stat cards */}
          <section aria-label="Key numbers">
            <StatGrid links={links} stats={mockHomeStats} />
          </section>
        </div>

        {/* ── Bottom row ─────────────────────────────────────── */}
        <div className="mt-4 space-y-4 sm:mt-5">
          <section aria-label="System health and activity">
            <AdminHealthRow
              dispensingVelocity={mockDispensingVelocity}
              hourly={mockHourlyActivity}
              links={links}
              stockAdjustments={mockStockAdjustments}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
