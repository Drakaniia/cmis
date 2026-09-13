import { Button } from "@cmis/ui/components/button";
import { useNavigate } from "@tanstack/react-router";
import { UserPlus, UserX } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMediaQuery1200 } from "@/features/inventory/hooks/use-media-query-1200";
import { ConfirmModal } from "../../components/confirm-modal";
import { isDestructiveRoleChange, useUsers } from "../hooks/use-users";
import type { AdminUser, UserDraft, UserFilters, UserRole } from "../types";
import { DEFAULT_USER_FILTERS, filterUsers } from "../types";
import { UserDetailContent } from "./user-detail";
import { UserDetailSheet } from "./user-detail-sheet";
import { UserFiltersBar } from "./user-filters";
import { UserFormModal } from "./user-form-modal";
import type { UserRowAction } from "./user-table";
import { UserTable } from "./user-table";

type ConfirmState =
  | { ids: string[]; kind: "bulk" }
  | { kind: "deactivate"; user: AdminUser }
  | { kind: "reset"; user: AdminUser }
  | { kind: "role"; role: UserRole; user: AdminUser }
  | null;

/**
 * CMIS-UI-09 §1 — User Management.
 *
 * Read = sheet/panel (parallel context), write = modal with a dim scrim
 * (focused task per Apple §12). The split is deliberate: reading the roster far
 * outpaces editing it, so the frequent path stays cheap.
 */
export function UsersPage() {
  const navigate = useNavigate();
  const isWide = useMediaQuery1200();
  const {
    users,
    changeRole,
    createUser,
    isEmailTaken,
    setStatus,
    setStatusMany,
    updateUser,
  } = useUsers();

  const [filters, setFilters] = useState<UserFilters>(DEFAULT_USER_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formUser, setFormUser] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const filtered = useMemo(() => filterUsers(users, filters), [users, filters]);
  const selectedUser = users.find((user) => user.id === selectedId) ?? null;

  const activeChips = useMemo(() => {
    const chips: { key: keyof UserFilters; label: string }[] = [];
    if (filters.role !== "All") {
      chips.push({ key: "role", label: `Role: ${filters.role}` });
    }
    if (filters.status !== "All") {
      chips.push({ key: "status", label: `Status: ${filters.status}` });
    }
    return chips;
  }, [filters]);

  const patchFilters = useCallback((patch: Partial<UserFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSelect = useCallback(
    (id: string, rect: DOMRect | null) => {
      setSelectedId(id);
      setOriginRect(rect);
      if (!isWide) {
        setSheetOpen(true);
      }
    },
    [isWide]
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(
        checked ? new Set(filtered.map((user) => user.id)) : new Set()
      );
    },
    [filtered]
  );

  const openCreate = useCallback(() => {
    setFormUser(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((user: AdminUser) => {
    setFormUser(user);
    setFormOpen(true);
    setSheetOpen(false);
  }, []);

  const handleRequestRole = useCallback((user: AdminUser, role: UserRole) => {
    if (user.role === role) {
      return;
    }
    setConfirm({ kind: "role", role, user });
  }, []);

  const handleToggleStatus = useCallback(
    (user: AdminUser) => {
      if (user.status === "active") {
        setConfirm({ kind: "deactivate", user });
        return;
      }
      setStatus(user.id, "active");
      toast.success(`${user.name} activated`);
    },
    [setStatus]
  );

  const handleViewAudit = useCallback(
    (user: AdminUser) => {
      navigate({ search: { user: user.name }, to: "/admin/audit" });
    },
    [navigate]
  );

  const handleAction = useCallback(
    (user: AdminUser, action: UserRowAction) => {
      if (action === "edit") {
        openEdit(user);
        return;
      }
      if (action === "reset-password") {
        setConfirm({ kind: "reset", user });
        return;
      }
      if (action === "view-audit") {
        handleViewAudit(user);
        return;
      }
      handleToggleStatus(user);
    },
    [handleToggleStatus, handleViewAudit, openEdit]
  );

  const handleConfirm = useCallback(() => {
    if (!confirm) {
      return;
    }
    if (confirm.kind === "role") {
      changeRole(confirm.user.id, confirm.role);
      toast.success(`${confirm.user.name} → ${confirm.role}`, {
        description: "Role change recorded in the audit log.",
      });
    } else if (confirm.kind === "deactivate") {
      setStatus(confirm.user.id, "inactive");
      toast.success(`${confirm.user.name} deactivated`);
    } else if (confirm.kind === "reset") {
      toast.success(`Temporary password sent to ${confirm.user.email}`);
    } else {
      setStatusMany(confirm.ids, "inactive");
      toast.success(`${confirm.ids.length} users deactivated`);
      setSelectedIds(new Set());
    }
    setConfirm(null);
    setSheetOpen(false);
  }, [changeRole, confirm, setStatus, setStatusMany]);

  const handleFormConfirm = useCallback(
    (draft: UserDraft) => {
      if (formUser) {
        updateUser(formUser.id, draft);
        toast.success(`${draft.name} updated`);
      } else {
        createUser(draft);
        toast.success(`${draft.name} created`, {
          description: `${draft.role}`,
        });
      }
    },
    [createUser, formUser, updateUser]
  );

  const handleBulkDeactivate = useCallback(() => {
    setConfirm({ ids: [...selectedIds], kind: "bulk" });
  }, [selectedIds]);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_USER_FILTERS);
  }, []);

  const handleRemoveChip = useCallback(
    (key: keyof UserFilters) => {
      patchFilters(
        key === "search"
          ? { search: "" }
          : ({ [key]: "All" } as Partial<UserFilters>)
      );
    },
    [patchFilters]
  );

  const handleConfirmOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setConfirm(null);
    }
  }, []);

  const bulkNames = users
    .filter((user) => selectedIds.has(user.id))
    .map((user) => user.name);

  const confirmProps = (() => {
    if (!confirm) {
      return null;
    }
    if (confirm.kind === "role") {
      return {
        confirmLabel: "Change role",
        description: `Change ${confirm.user.name} from ${confirm.user.role} to ${confirm.role}? Access is granted immediately and the change is audited.`,
        destructive: isDestructiveRoleChange(confirm.user.role, confirm.role),
        title: "Change role?",
        typeToConfirm: undefined,
      };
    }
    if (confirm.kind === "deactivate") {
      return {
        confirmLabel: "Deactivate",
        description: `Deactivate ${confirm.user.name}? They will be unable to log in.`,
        destructive: true,
        title: "Deactivate user?",
        typeToConfirm: undefined,
      };
    }
    if (confirm.kind === "reset") {
      return {
        confirmLabel: "Reset password",
        description: `Reset the password for ${confirm.user.name}? A one-time temporary password will be emailed to ${confirm.user.email}.`,
        destructive: false,
        title: "Reset password?",
        typeToConfirm: undefined,
      };
    }
    return {
      confirmLabel: "Deactivate selected",
      description: `Deactivate ${confirm.ids.length} users? They will be unable to log in: ${bulkNames.join(", ")}.`,
      destructive: true,
      title: "Deactivate selected users?",
      typeToConfirm: undefined,
    };
  })();

  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="flex shrink-0 justify-end gap-2 border-border/50 border-b bg-card px-3 py-2">
        {selectedIds.size > 0 ? (
          <Button
            className="press-feedback"
            onClick={handleBulkDeactivate}
            size="sm"
            variant="destructive"
          >
            <UserX aria-hidden className="size-3.5" />
            Deactivate selected ({selectedIds.size})
          </Button>
        ) : null}
        <Button className="press-feedback" onClick={openCreate} size="sm">
          <UserPlus aria-hidden className="size-3.5" />
          Create User
        </Button>
      </div>

      <UserFiltersBar
        activeChips={activeChips}
        filters={filters}
        onChange={patchFilters}
        onClearFilters={handleClearFilters}
        onRemoveChip={handleRemoveChip}
        resultCount={filtered.length}
        totalCount={users.length}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
          <UserTable
            onAction={handleAction}
            onRequestRole={handleRequestRole}
            onSelect={handleSelect}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleStatus={handleToggleStatus}
            selectedId={selectedId}
            selectedIds={selectedIds}
            users={filtered}
          />
        </div>

        {isWide ? (
          <div className="flex w-[360px] min-w-[320px] shrink-0 flex-col overflow-hidden border-border/50 border-l bg-card">
            <UserDetailContent
              onEdit={openEdit}
              onViewAudit={handleViewAudit}
              user={selectedUser}
            />
          </div>
        ) : null}
      </div>

      <UserDetailSheet
        onOpenChange={setSheetOpen}
        onViewAudit={handleViewAudit}
        open={sheetOpen && !isWide}
        originRect={originRect}
        user={selectedUser}
      />

      <UserFormModal
        isEmailTaken={isEmailTaken}
        onConfirm={handleFormConfirm}
        onOpenChange={setFormOpen}
        open={formOpen}
        originRect={originRect}
        user={formUser}
      />

      <ConfirmModal
        confirmLabel={confirmProps?.confirmLabel ?? "Confirm"}
        description={confirmProps?.description}
        destructive={confirmProps?.destructive ?? false}
        onConfirm={handleConfirm}
        onOpenChange={handleConfirmOpenChange}
        open={confirm !== null}
        title={confirmProps?.title ?? ""}
      />
    </div>
  );
}
