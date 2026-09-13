import { Button } from "@cmis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { cn } from "@cmis/ui/lib/utils";
import {
  KeyRound,
  MoreHorizontal,
  Pencil,
  ScrollText,
  UserPlus,
  UserX,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ConfirmModal } from "../../components/confirm-modal";
import { UserFormModal } from "../../users/components/user-form-modal";
import { useUsers } from "../../users/hooks/use-users";
import type { AdminUser, UserDraft, UserRole } from "../../users/types";
import { DEFAULT_USER_FILTERS, filterUsers } from "../../users/types";
import { SettingsCard } from "./settings-card";

type ConfirmState =
  | { kind: "deactivate"; user: AdminUser }
  | { kind: "role"; role: UserRole; user: AdminUser }
  | null;

/**
 * Settings tab — User Management.
 * Simplified version of the standalone UsersPage that fits within a tab panel.
 */
export function UsersTab() {
  const { users, changeRole, createUser, isEmailTaken, setStatus, updateUser } =
    useUsers();

  const [filters, _setFilters] = React.useState(DEFAULT_USER_FILTERS);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formUser, setFormUser] = React.useState<AdminUser | null>(null);
  const [confirm, setConfirm] = React.useState<ConfirmState>(null);

  const filtered = React.useMemo(
    () => filterUsers(users, filters),
    [users, filters]
  );

  function openCreate() {
    setFormUser(null);
    setFormOpen(true);
  }

  function openEdit(user: AdminUser) {
    setFormUser(user);
    setFormOpen(true);
  }

  function handleToggleStatus(user: AdminUser) {
    if (user.status === "active") {
      setConfirm({ kind: "deactivate", user });
      return;
    }
    setStatus(user.id, "active");
    toast.success(`${user.name} activated`);
  }

  function handleConfirm() {
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
    }
    setConfirm(null);
  }

  function handleFormConfirm(draft: UserDraft) {
    if (formUser) {
      updateUser(formUser.id, draft);
      toast.success(`${draft.name} updated`);
    } else {
      createUser(draft);
      toast.success(`${draft.name} created`, {
        description: `${draft.role}`,
      });
    }
  }

  const ROLE_BADGE: Record<UserRole, string> = {
    Admin: "border-primary/40 bg-primary/12 text-primary",
    Staff: "border-border bg-muted text-foreground",
    Viewer:
      "border-[var(--chart-2)]/40 bg-[var(--chart-2)]/12 text-[var(--chart-2)]",
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        actions={
          <Button className="press-feedback" onClick={openCreate} size="sm">
            <UserPlus aria-hidden className="size-3.5" />
            Create User
          </Button>
        }
        description={`${users.length} accounts · ${users.filter((u) => u.status === "active").length} active`}
        title="Users"
      >
        <div className="overflow-hidden rounded-md border border-border/60">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_auto] items-center gap-2 border-border/50 border-b bg-muted/60 px-3 py-1.5 font-medium text-caption text-muted-foreground">
            <span>Name</span>
            <span>Role</span>
            <span>Status</span>
            <span className="w-8" />
          </div>
          {filtered.map((user) => (
            <div
              className="grid grid-cols-[1.2fr_0.8fr_0.7fr_auto] items-center gap-2 border-border/50 border-b px-3 py-2 last:border-b-0"
              key={user.id}
            >
              <span className="min-w-0 truncate">
                <span className="block truncate font-medium text-foreground text-sm">
                  {user.name}
                </span>
                <span className="block truncate text-caption text-muted-foreground">
                  {user.email}
                </span>
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-caption",
                    ROLE_BADGE[user.role]
                  )}
                >
                  {user.role}
                </span>
              </span>
              <span className="text-caption text-muted-foreground">
                {user.status === "active" ? "Active" : "Inactive"}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label={`Actions for ${user.name}`}
                      className="press-feedback rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      type="button"
                    />
                  }
                >
                  <MoreHorizontal aria-hidden className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  <DropdownMenuItem onClick={() => openEdit(user)}>
                    <Pencil aria-hidden className="size-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <KeyRound aria-hidden className="size-3.5" />
                    Reset password
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <ScrollText aria-hidden className="size-3.5" />
                    View audit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleToggleStatus(user)}
                    variant="destructive"
                  >
                    <UserX aria-hidden className="size-3.5" />
                    {user.status === "active" ? "Deactivate" : "Activate"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-caption text-muted-foreground">
              No users match these filters.
            </p>
          ) : null}
        </div>
      </SettingsCard>

      <UserFormModal
        isEmailTaken={isEmailTaken}
        onConfirm={handleFormConfirm}
        onOpenChange={setFormOpen}
        open={formOpen}
        user={formUser}
      />

      <ConfirmModal
        confirmLabel={confirm?.kind === "role" ? "Change role" : "Deactivate"}
        description={
          confirm?.kind === "role"
            ? `Change ${confirm.user.name} from ${confirm.user.role} to ${confirm.role}?`
            : confirm?.kind === "deactivate"
              ? `Deactivate ${confirm.user.name}? They will be unable to log in.`
              : ""
        }
        destructive
        onConfirm={handleConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
          }
        }}
        open={confirm !== null}
        title={confirm?.kind === "role" ? "Change role?" : "Deactivate user?"}
      />
    </div>
  );
}
