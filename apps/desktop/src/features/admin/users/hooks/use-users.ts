import * as React from "react";

import { mockUsers } from "../mock";
import type { AdminUser, UserDraft, UserRole, UserStatus } from "../types";

/** The signed-in Admin acting on the roster (§1.5 role history authorship). */
const ACTOR = "A. Lim";

/**
 * CMIS-UI-09 §1 — mutable roster with append-only role history. Every write
 * records who did it and when; nothing overwrites the previous role.
 */
export function useUsers(initial: AdminUser[] = mockUsers) {
  const [users, setUsers] = React.useState<AdminUser[]>(initial);

  const isEmailTaken = React.useCallback(
    (email: string, excludeId?: string) => {
      const target = email.trim().toLowerCase();
      return users.some(
        (user) => user.id !== excludeId && user.email.toLowerCase() === target
      );
    },
    [users]
  );

  const createUser = React.useCallback((draft: UserDraft) => {
    const at = new Date().toISOString();
    const user: AdminUser = {
      actions7d: [0, 0, 0, 0, 0, 0, 0],
      email: draft.email.trim(),
      id: `usr-${Date.now()}`,
      lastLogin: at,
      name: draft.name.trim(),
      role: draft.role,
      roleHistory: [{ at, by: ACTOR, from: null, to: draft.role }],
      status: "active",
    };
    setUsers((prev) => [user, ...prev]);
    return user;
  }, []);

  const updateUser = React.useCallback((id: string, draft: UserDraft) => {
    const at = new Date().toISOString();
    setUsers((prev) =>
      prev.map((user) => {
        if (user.id !== id) {
          return user;
        }
        const roleChanged = user.role !== draft.role;
        return {
          ...user,
          email: draft.email.trim(),
          name: draft.name.trim(),
          role: draft.role,
          roleHistory: roleChanged
            ? [
                ...user.roleHistory,
                { at, by: ACTOR, from: user.role, to: draft.role },
              ]
            : user.roleHistory,
        };
      })
    );
  }, []);

  const changeRole = React.useCallback((id: string, role: UserRole) => {
    const at = new Date().toISOString();
    setUsers((prev) =>
      prev.map((user) =>
        user.id === id
          ? {
              ...user,
              role,
              roleHistory: [
                ...user.roleHistory,
                { at, by: ACTOR, from: user.role, to: role },
              ],
            }
          : user
      )
    );
  }, []);

  const setStatus = React.useCallback((id: string, status: UserStatus) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === id ? { ...user, status } : user))
    );
  }, []);

  const setStatusMany = React.useCallback(
    (ids: string[], status: UserStatus) => {
      const target = new Set(ids);
      setUsers((prev) =>
        prev.map((user) => (target.has(user.id) ? { ...user, status } : user))
      );
    },
    []
  );

  return {
    changeRole,
    createUser,
    isEmailTaken,
    setStatus,
    setStatusMany,
    updateUser,
    users,
  } as const;
}

/** Demoting an Admin strips branch-spanning access — treat as destructive. */
export function isDestructiveRoleChange(from: UserRole, to: UserRole): boolean {
  return from === "Admin" && to !== "Admin";
}
