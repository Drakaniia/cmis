import { useCallback, useState } from "react";

import type { AdminUser, UserDraft, UserStatus } from "../types";
import { DEFAULT_USERS } from "../types";

/**
 * CMIS-UI-09 — mutable roster (single-user app). Role history was removed
 * 2026-09-15 along with the role concept itself.
 *
 * Defaults to the shipped roster so User Management opens with accounts; pass
 * an explicit list (including `[]`) to render a different one.
 */
export function useUsers(initial: AdminUser[] = DEFAULT_USERS) {
  const [users, setUsers] = useState<AdminUser[]>(initial);

  const isEmailTaken = useCallback(
    (email: string, excludeId?: string) => {
      const target = email.trim().toLowerCase();
      return users.some(
        (user) => user.id !== excludeId && user.email.toLowerCase() === target
      );
    },
    [users]
  );

  const createUser = useCallback((draft: UserDraft) => {
    const user: AdminUser = {
      actions7d: [0, 0, 0, 0, 0, 0, 0],
      email: draft.email.trim(),
      id: `usr-${Date.now()}`,
      lastLogin: new Date().toISOString(),
      name: draft.name.trim(),
      status: "active",
    };
    setUsers((prev) => [user, ...prev]);
    return user;
  }, []);

  const updateUser = useCallback((id: string, draft: UserDraft) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === id
          ? {
              ...user,
              email: draft.email.trim(),
              name: draft.name.trim(),
            }
          : user
      )
    );
  }, []);

  const setStatus = useCallback((id: string, status: UserStatus) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === id ? { ...user, status } : user))
    );
  }, []);

  const setStatusMany = useCallback((ids: string[], status: UserStatus) => {
    const target = new Set(ids);
    setUsers((prev) =>
      prev.map((user) => (target.has(user.id) ? { ...user, status } : user))
    );
  }, []);

  return {
    createUser,
    isEmailTaken,
    setStatus,
    setStatusMany,
    updateUser,
    users,
  } as const;
}
