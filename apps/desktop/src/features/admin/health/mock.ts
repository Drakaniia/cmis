import type { HealthCardData, PendingSync } from "./types";

export const mockHealthCards: HealthCardData[] = [
  {
    actions: [
      { id: "vacuum", label: "Vacuum" },
      { id: "integrity", label: "Integrity check" },
    ],
    caption: "Last query 42 ms",
    id: "database",
    metric: "Connected",
    status: "ok",
    statusLabel: "Database connected",
    title: "Database",
    trend: [38, 44, 41, 52, 47, 42, 42],
  },
  {
    actions: [{ id: "clear-cache", label: "Clear cache" }],
    caption: "Free space trending down",
    id: "storage",
    metric: "2.1 GB / 8 GB",
    status: "warn",
    statusLabel: "Storage at 74% capacity",
    title: "Storage",
    trend: [61, 63, 66, 68, 70, 72, 74],
  },
  {
    actions: [
      { id: "retry-sync", label: "Retry sync" },
      { id: "view-conflicts", label: "View conflicts", to: "/admin/audit" },
    ],
    caption: "3 records pending",
    id: "sync",
    metric: "Synced",
    status: "warn",
    statusLabel: "Sync pending",
    title: "Sync",
    trend: [0, 1, 0, 2, 1, 3, 3],
  },
  {
    actions: [{ id: "trigger-backup", label: "Trigger backup now" }],
    caption: "Next: daily 02:00",
    id: "backup",
    metric: "Sep 12",
    status: "ok",
    statusLabel: "Backup current",
    title: "Backup",
    trend: [1, 1, 1, 1, 1, 1, 1],
  },
  {
    actions: [
      { id: "slow-queries", label: "View slow queries", to: "/admin/audit" },
    ],
    caption: "Cache hit 94%",
    id: "performance",
    metric: "p50 42 ms · p95 180 ms",
    status: "ok",
    statusLabel: "Performance nominal",
    title: "Performance",
    trend: [120, 140, 132, 160, 175, 182, 180],
  },
];

export const mockPendingSyncs: PendingSync[] = [
  {
    attempts: 1,
    branch: "Main Clinic",
    id: "SYN-331",
    queuedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    record: "Dispense · Paracetamol 500mg −12",
  },
  {
    attempts: 2,
    branch: "North Clinic",
    error: "Conflict: qty changed on server",
    id: "SYN-330",
    queuedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    record: "Stock In · Cetirizine 10mg +200",
  },
  {
    attempts: 1,
    branch: "South Annex",
    id: "SYN-329",
    queuedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    record: "Dispose · ORS Sachet −40",
  },
];
