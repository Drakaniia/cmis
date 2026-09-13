/**
 * CMIS-UI-01 — Dashboard domain types.
 *
 * StatTone pairs a visual tone with a text label so colour is never the
 * only signal (§5.3). DashboardRole determines which link set and
 * capability surface the Home screen renders. DashboardLinkKey is the
 * union of every destination the stat cards, alerts band, and health row
 * can deep-link into.
 */

export type StatTone = "danger" | "neutral" | "ok" | "warn";

export type DashboardRole = "admin" | "staff";

export type DashboardLinkKey =
  | "audit"
  | "expiry"
  | "health"
  | "inventory"
  | "lowStock"
  | "requests"
  | "users";
