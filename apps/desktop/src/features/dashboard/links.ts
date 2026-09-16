import type { DashboardLinkKey } from "./types";

/**
 * CMIS-UI-01 §3 — every Home surface is a button into the list behind it
 * (§16: place the control next to what it affects).
 */
export function dashboardLinks(): Record<DashboardLinkKey, string> {
  return {
    audit: "/admin/audit",
    expiry: "/admin/inventory/expiry",
    health: "/admin/health",
    inventory: "/admin/inventory",
    lowStock: "/admin/inventory/low-stock",
    requests: "/admin/requests",
  };
}
