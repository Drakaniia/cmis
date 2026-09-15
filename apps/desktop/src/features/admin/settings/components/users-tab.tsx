import { Button } from "@cmis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import {
  KeyRound,
  MoreHorizontal,
  Pencil,
  ScrollText,
  UserPlus,
  UserX,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmModal } from "../../components/confirm-modal";
import { UserFormModal } from "../../users/components/user-form-modal";
import { useUsers } from "../../users/hooks/use-users";
import type { AdminUser, UserDraft } from "../../users/types";
import { DEFAULT_USER_FILTERS, filterUsers } from "../../users/types";
import { SettingsCard } from "./settings-card";

type ConfirmState = { kind: "deactivate"; user: AdminUser } | null;

function confirmationDescription(confirm: ConfirmState): string {
  if (confirm?.kind === "deactivate") {
    return `Deactivate ${confirm.user.name}? They will be unable to log in.`;
  }
  return "";
}

function UserRow({
  onEdit,
  onToggleStatus,
  user,
}: {
  onEdit: (user: AdminUser) => void;
  onToggleStatus: (user: AdminUser) => void;
  user: AdminUser;
}) {
  const handleEdit = useCallback(() => {
    onEdit(user);
  }, [onEdit, user]);
  const handleToggleStatus = useCallback(() => {
    onToggleStatus(user);
  }, [onToggleStatus, user]);

  return (
    <div className="grid grid-cols-[1.2fr_0.7fr_auto] items-center gap-2 border-border/50 border-b px-3 py-2 last:border-b-0">
      <span className="min-w-0 truncate">
        <span className="block truncate font-medium text-foreground text-sm">
          {user.name}
        </span>
        <span className="block truncate text-caption text-muted-foreground">
          {user.email}
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
          <DropdownMenuItem onClick={handleEdit}>
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
          <DropdownMenuItem onClick={handleToggleStatus} variant="destructive">
            <UserX aria-hidden className="size-3.5" />
            {user.status === "active" ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Settings tab — User Management.
 * Simplified version of the standalone UsersPage that fits within a tab panel.
 */
export function UsersTab() {
  const { users, createUser, isEmailTaken, setStatus, updateUser } = useUsers();

  const [filters] = useState(DEFAULT_USER_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [formUser, setFormUser] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const filtered = useMemo(() => filterUsers(users, filters), [users, filters]);

  const openCreate = useCallback(() => {
    setFormUser(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((user: AdminUser) => {
    setFormUser(user);
    setFormOpen(true);
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

  const handleConfirm = useCallback(() => {
    if (!confirm) {
      return;
    }
    if (confirm.kind === "deactivate") {
      setStatus(confirm.user.id, "inactive");
      toast.success(`${confirm.user.name} deactivated`);
    }
    setConfirm(null);
  }, [confirm, setStatus]);

  const handleConfirmDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setConfirm(null);
    }
  }, []);

  const handleFormConfirm = useCallback(
    (draft: UserDraft) => {
      if (formUser) {
        updateUser(formUser.id, draft);
        toast.success(`${draft.name} updated`);
      } else {
        createUser(draft);
        toast.success(`${draft.name} created`);
      }
    },
    [formUser, updateUser, createUser]
  );

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
          <div className="grid grid-cols-[1.2fr_0.7fr_auto] items-center gap-2 border-border/50 border-b bg-muted/60 px-3 py-1.5 font-medium text-caption text-muted-foreground">
            <span>Name</span>
            <span>Status</span>
            <span className="w-8" />
          </div>
          {filtered.map((user) => (
            <UserRow
              key={user.id}
              onEdit={openEdit}
              onToggleStatus={handleToggleStatus}
              user={user}
            />
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
        confirmLabel="Deactivate"
        description={confirmationDescription(confirm)}
        destructive
        onConfirm={handleConfirm}
        onOpenChange={handleConfirmDialogChange}
        open={confirm !== null}
        title="Deactivate user?"
      />
    </div>
  );
}
