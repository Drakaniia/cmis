/**
 * CMIS-UI-09 — User Management domain types (single-user app).
 * Roles were removed 2026-09-15: the app has one admin user, so the
 * Admin/Staff/Viewer role data, badges, and filters are gone.
 */

export type UserStatus = "active" | "inactive";

export interface AdminUser {
  /** "X actions last 7 days" spark (§1.5) */
  actions7d: number[];
  email: string;
  id: string;
  /** ISO timestamp */
  lastLogin: string;
  name: string;
  status: UserStatus;
}

export interface UserDraft {
  email: string;
  name: string;
  password: string;
}

export interface UserFilters {
  search: string;
  /** "All" | "active" | "inactive" */
  status: string;
}

export const DEFAULT_USER_FILTERS: UserFilters = {
  search: "",
  status: "All",
};

/**
 * The roster the app ships with — an administrator and a staff account, so User
 * Management opens functional instead of empty.
 */
export const DEFAULT_USERS: AdminUser[] = [
  {
    actions7d: [4, 9, 6, 12, 8, 14, 11],
    email: "admin@cmis.app",
    id: "usr-001",
    lastLogin: "2026-09-14T09:42:00",
    name: "A. Lim",
    status: "active",
  },
  {
    actions7d: [3, 5, 4, 7, 6, 8, 5],
    email: "staff@cmis.app",
    id: "usr-002",
    lastLogin: "2026-09-13T14:20:00",
    name: "R. Dizon",
    status: "active",
  },
];

/** Pure filter + search used by the page and its tests. */
export function filterUsers(
  users: AdminUser[],
  filters: UserFilters
): AdminUser[] {
  const query = filters.search.trim().toLowerCase();
  return users.filter((user) => {
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
};
