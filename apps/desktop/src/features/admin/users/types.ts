/**
 * CMIS-UI-09 §1 — User Management domain types.
 * Access control carries audit consequences, so role changes are recorded as
 * an append-only history rather than overwriting the previous value (§1.5).
 */

export type UserRole = "Admin" | "Staff" | "Viewer";
export type UserStatus = "active" | "inactive";

export const USER_ROLES: UserRole[] = ["Admin", "Staff", "Viewer"];

export interface RoleHistoryEntry {
  /** ISO timestamp */
  at: string;
  /** Actor display name */
  by: string;
  from: UserRole | null;
  to: UserRole;
}

export interface AdminUser {
  /** "X actions last 7 days" spark (§1.5) */
  actions7d: number[];
  email: string;
  id: string;
  /** ISO timestamp */
  lastLogin: string;
  name: string;
  role: UserRole;
  roleHistory: RoleHistoryEntry[];
  status: UserStatus;
}

/** Role badge chip classes — color paired with text, never color alone. */
export const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  Admin: "border-primary/40 bg-primary/12 text-primary",
  Staff: "border-border bg-muted text-foreground",
  Viewer:
    "border-[var(--chart-2)]/40 bg-[var(--chart-2)]/12 text-[var(--chart-2)]",
};

export interface UserDraft {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export interface UserFilters {
  /** "All" or a role */
  role: string;
  search: string;
  /** "All" | "active" | "inactive" */
  status: string;
}

export const DEFAULT_USER_FILTERS: UserFilters = {
  role: "All",
  search: "",
  status: "All",
};

/** Pure filter + search used by the page and its tests. */
export function filterUsers(
  users: AdminUser[],
  filters: UserFilters
): AdminUser[] {
  const query = filters.search.trim().toLowerCase();
  return users.filter((user) => {
    if (filters.role !== "All" && user.role !== filters.role) {
      return false;
    }
    if (filters.status !== "All" && user.status !== filters.status) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  });
}

export const EMPTY_USER_DRAFT: UserDraft = {
  email: "",
  name: "",
  password: "",
  role: "Staff",
};
