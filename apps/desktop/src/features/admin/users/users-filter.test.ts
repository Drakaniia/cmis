import { describe, expect, it } from "vitest";

import type { AdminUser, UserFilters } from "./types";
import { DEFAULT_USER_FILTERS, filterUsers } from "./types";

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    actions7d: [0, 0, 0, 0, 0, 0, 0],
    email: "user@buksu.edu.ph",
    id: "usr-1",
    lastLogin: "2026-09-12T09:00:00",
    name: "M. Reyes",
    role: "Staff",
    roleHistory: [],
    status: "active",
    ...overrides,
  };
}

function filters(overrides: Partial<UserFilters> = {}): UserFilters {
  return { ...DEFAULT_USER_FILTERS, ...overrides };
}

describe("filterUsers", () => {
  const rows = [
    user(),
    user({
      email: "r.santos@buksu.edu.ph",
      id: "usr-2",
      name: "R. Santos",
      role: "Admin",
      status: "inactive",
    }),
  ];

  it("returns everyone when no filters are active", () => {
    expect(filterUsers(rows, filters())).toHaveLength(2);
  });

  it("matches name and email case-insensitively", () => {
    expect(filterUsers(rows, filters({ search: "santos" }))).toHaveLength(1);
    expect(filterUsers(rows, filters({ search: "SANTOS@" }))).toHaveLength(1);
  });

  it("combines role and status narrowings", () => {
    expect(
      filterUsers(rows, filters({ role: "Admin", status: "inactive" }))
    ).toHaveLength(1);
    expect(
      filterUsers(rows, filters({ role: "Admin", status: "active" }))
    ).toHaveLength(0);
  });
});
