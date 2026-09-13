import { Checkbox } from "@cmis/ui/components/checkbox";
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
  UserX,
} from "lucide-react";
import { motion } from "motion/react";
import { type KeyboardEvent, type MouseEvent, useCallback } from "react";
import { densitySpring } from "@/lib/motion";
import { absoluteDateTime, relativeTime } from "../../format";
import type { AdminUser, UserRole } from "../types";
import { RoleBadgeMenu } from "./role-badge-menu";

export type UserRowAction =
  | "edit"
  | "toggle-status"
  | "reset-password"
  | "view-audit";

const ROW_GRID =
  "grid-cols-[auto_1.3fr_0.9fr_0.9fr_0.7fr_auto] lg:grid-cols-[auto_1.2fr_1fr_0.9fr_0.8fr_auto]";

/** Switch-style status toggle (role="switch", color paired with a label). */
function StatusToggle({
  user,
  onToggle,
}: {
  onToggle: (user: AdminUser) => void;
  user: AdminUser;
}) {
  const active = user.status === "active";
  const handleToggle = useCallback(() => onToggle(user), [onToggle, user]);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        aria-checked={active}
        aria-label={`${active ? "Deactivate" : "Activate"} ${user.name}`}
        className={cn(
          "press-feedback relative h-4 w-7 shrink-0 rounded-full border",
          active
            ? "border-[var(--success)]/40 bg-[var(--success)]/30"
            : "border-border bg-muted"
        )}
        onClick={handleToggle}
        role="switch"
        type="button"
      >
        <motion.span
          animate={{ left: active ? 14 : 2 }}
          aria-hidden
          className="absolute top-0.5 size-3 rounded-full bg-card shadow"
          transition={densitySpring}
        />
      </button>
      <span className="text-caption text-muted-foreground">
        {active ? "Active" : "Inactive"}
      </span>
    </span>
  );
}

function SelectAllCell({
  allSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
}) {
  const handleChange = useCallback(
    (checked: boolean | "indeterminate") => onToggleAll(checked === true),
    [onToggleAll]
  );
  return (
    <Checkbox
      aria-label="Select all users"
      checked={allSelected}
      onCheckedChange={handleChange}
    />
  );
}

function UserTableRow({
  selected,
  user,
  isRowSelected,
  onAction,
  onRequestRole,
  onSelect,
  onToggleSelect,
  onToggleStatus,
}: {
  selected: boolean;
  user: AdminUser;
  isRowSelected: boolean;
  onAction: (user: AdminUser, action: UserRowAction) => void;
  onRequestRole: (user: AdminUser, role: UserRole) => void;
  onSelect: (id: string, rect: DOMRect | null) => void;
  onToggleSelect: (id: string) => void;
  onToggleStatus: (user: AdminUser) => void;
}) {
  /** Row selection ignores clicks that land on a control inside the row. */
  const handleRowClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, input, a, select, [role='switch']")) {
        return;
      }
      onSelect(user.id, event.currentTarget.getBoundingClientRect());
    },
    [onSelect, user.id]
  );

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(user.id, null);
      }
    },
    [onSelect, user.id]
  );

  const handleToggleSelect = useCallback(
    () => onToggleSelect(user.id),
    [onToggleSelect, user.id]
  );
  const handleRequestRole = useCallback(
    (role: UserRole) => onRequestRole(user, role),
    [onRequestRole, user]
  );
  const handleEdit = useCallback(
    () => onAction(user, "edit"),
    [onAction, user]
  );
  const handleResetPassword = useCallback(
    () => onAction(user, "reset-password"),
    [onAction, user]
  );
  const handleViewAudit = useCallback(
    () => onAction(user, "view-audit"),
    [onAction, user]
  );
  const handleToggleStatusAction = useCallback(
    () => onAction(user, "toggle-status"),
    [onAction, user]
  );

  return (
    <tr
      aria-selected={selected}
      className={cn(
        "grid w-full cursor-pointer items-center gap-2 border-border/50 border-b px-2 text-left text-sm transition-colors hover:bg-muted/60",
        ROW_GRID,
        selected &&
          "bg-accent text-accent-foreground ring-1 ring-primary/20 ring-inset"
      )}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      style={{ minHeight: "var(--row-height, 56px)" }}
      tabIndex={0}
    >
      <td>
        <Checkbox
          aria-label={`Select ${user.name}`}
          checked={isRowSelected}
          onCheckedChange={handleToggleSelect}
        />
      </td>
      <td className="min-w-0 truncate">
        <span className="block truncate font-semibold text-foreground">
          {user.name}
        </span>
        <span className="block truncate text-caption text-muted-foreground lg:hidden">
          {user.email}
        </span>
      </td>
      <td className="hidden min-w-0 truncate text-caption text-muted-foreground lg:block">
        {user.email}
      </td>
      <td className="min-w-0">
        <RoleBadgeMenu onRequestRole={handleRequestRole} user={user} />
      </td>
      <td className="min-w-0">
        <StatusToggle onToggle={onToggleStatus} user={user} />
      </td>
      <td
        className="truncate text-caption text-muted-foreground"
        title={absoluteDateTime(user.lastLogin)}
      >
        {relativeTime(user.lastLogin)}
      </td>
      <td className="flex justify-end">
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
          <DropdownMenuContent align="end" className="min-w-[190px]">
            <DropdownMenuItem onClick={handleEdit}>
              <Pencil aria-hidden className="size-3.5" />
              Edit user
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleResetPassword}>
              <KeyRound aria-hidden className="size-3.5" />
              Reset password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleViewAudit}>
              <ScrollText aria-hidden className="size-3.5" />
              View audit for this user
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleToggleStatusAction}
              variant="destructive"
            >
              <UserX aria-hidden className="size-3.5" />
              {user.status === "active" ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

export function UserTable({
  users,
  selectedId,
  selectedIds,
  onSelect,
  onToggleSelect,
  onToggleSelectAll,
  onRequestRole,
  onToggleStatus,
  onAction,
}: {
  onAction: (user: AdminUser, action: UserRowAction) => void;
  onRequestRole: (user: AdminUser, role: UserRole) => void;
  onSelect: (id: string, rect: DOMRect | null) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onToggleStatus: (user: AdminUser) => void;
  selectedId: string | null;
  selectedIds: Set<string>;
  users: AdminUser[];
}) {
  const allSelected = users.length > 0 && selectedIds.size === users.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table aria-label="Users" className="block w-full border-collapse">
          <thead className="block">
            <tr
              className={cn(
                "sticky top-0 z-[1] grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1 font-medium text-caption text-muted-foreground",
                ROW_GRID
              )}
            >
              <th className="font-medium" scope="col">
                <SelectAllCell
                  allSelected={allSelected}
                  onToggleAll={onToggleSelectAll}
                />
              </th>
              <th className="text-left font-medium" scope="col">
                Name
              </th>
              <th className="hidden text-left font-medium lg:block" scope="col">
                Email
              </th>
              <th className="text-left font-medium" scope="col">
                Role
              </th>
              <th className="text-left font-medium" scope="col">
                Status
              </th>
              <th className="text-left font-medium" scope="col">
                Last login
              </th>
              <th className="w-6 font-medium" scope="col">
                <span className="sr-only">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="block">
            {users.map((user) => (
              <UserTableRow
                isRowSelected={selectedIds.has(user.id)}
                key={user.id}
                onAction={onAction}
                onRequestRole={onRequestRole}
                onSelect={onSelect}
                onToggleSelect={onToggleSelect}
                onToggleStatus={onToggleStatus}
                selected={user.id === selectedId}
                user={user}
              />
            ))}
          </tbody>
        </table>
        {users.length === 0 ? (
          <p className="p-6 text-center text-caption text-muted-foreground">
            No users match these filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
