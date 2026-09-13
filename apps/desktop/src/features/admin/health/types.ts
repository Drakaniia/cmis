import type { HealthStatus } from "../components/indicators";

/**
 * CMIS-UI-09 §5 — System Health types.
 * Each card is actionable: health without a next step is a report, not a tool.
 */

export type HealthCardId =
  | "database"
  | "storage"
  | "sync"
  | "backup"
  | "performance";

export interface HealthAction {
  id: string;
  label: string;
  /** Route to deep-link to (audit filters use `to`) */
  to?: "/admin/audit" | "/admin/data";
}

export interface HealthCardData {
  actions: HealthAction[];
  caption: string;
  id: HealthCardId;
  /** Primary metric shown at display size */
  metric: string;
  status: HealthStatus;
  statusLabel: string;
  title: string;
  trend: number[];
}

export interface PendingSync {
  attempts: number;
  branch: string;
  error?: string;
  id: string;
  queuedAt: string;
  record: string;
}
