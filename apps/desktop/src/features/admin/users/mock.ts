import type { AdminUser } from "./types";

export const mockUsers: AdminUser[] = [
  {
    actions7d: [4, 9, 6, 12, 8, 14, 11],
    email: "a.lim@buksu.edu.ph",
    id: "usr-001",
    lastLogin: "2026-09-12T09:42:00",
    name: "A. Lim",
    role: "Admin",
    roleHistory: [
      {
        at: "2026-06-02T10:00:00",
        by: "System",
        from: null,
        to: "Admin",
      },
    ],
    status: "active",
  },
];
