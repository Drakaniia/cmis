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
import type * as React from "react";
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
        onClick={() => onToggle(user)}
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

  /** Row selection ignores clicks that land on a control inside the row. */
  function handleRowClick(event: React.MouseEvent<HTMLDivElement>, id: string) {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, a, select, [role='switch']")) {
      return;
    }
    onSelect(id, event.currentTarget.getBoundingClientRect());
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={cn(
          "grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1 font-medium text-caption text-muted-foreground",
          ROW_GRID
        )}
        role="row"
      >
        <Checkbox
          aria-label="Select all users"
          checked={allSelected}
          onCheckedChange={(checked) => onToggleSelectAll(checked === true)}
        />
        <span role="columnheader">Name</span>
        <span className="hidden lg:block" role="columnheader">
          Email
        </span>
        <span role="columnheader">Role</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Last login</span>
        <span aria-hidden className="w-6" />
      </div>

      <div aria-label="Users" className="flex-1 overflow-auto" role="table">
        {users.map((user) => {
          const selected = user.id === selectedId;
          return (
            <div
              aria-selected={selected}
              className={cn(
                "grid w-full cursor-pointer items-center gap-2 border-border/50 border-b px-2 text-left text-sm transition-colors hover:bg-muted/60",
                ROW_GRID,
                selected &&
                  "bg-accent text-accent-foreground ring-1 ring-primary/20 ring-inset"
              )}
              key={user.id}
              onClick={(event) => handleRowClick(event, user.id)}
              role="row"
              style={{ minHeight: "var(--row-height, 56px)" }}
            >
              <Checkbox
                aria-label={`Select ${user.name}`}
                checked={selectedIds.has(user.id)}
                onCheckedChange={() => onToggleSelect(user.id)}
              />
              <span className="min-w-0 truncate" role="cell">
                <span className="block truncate font-semibold text-foreground">
                  {user.name}
                </span>
                <span className="block truncate text-caption text-muted-foreground lg:hidden">
                  {user.email}
                </span>
              </span>
              <span
                className="hidden min-w-0 truncate text-caption text-muted-foreground lg:block"
                role="cell"
              >
                {user.email}
              </span>
              <span className="min-w-0" role="cell">
                <RoleBadgeMenu
                  onRequestRole={(role) => onRequestRole(user, role)}
                  user={user}
                />
              </span>
              <span className="min-w-0" role="cell">
                <StatusToggle onToggle={onToggleStatus} user={user} />
              </span>
              <span
                className="truncate text-caption text-muted-foreground"
                role="cell"
                title={absoluteDateTime(user.lastLogin)}
              >
                {relativeTime(user.lastLogin)}
              </span>
              <span className="flex justify-end" role="cell">
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
                    <DropdownMenuItem onClick={() => onAction(user, "edit")}>
                      <Pencil aria-hidden className="size-3.5" />
                      Edit user
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onAction(user, "reset-password")}
                    >
                      <KeyRound aria-hidden className="size-3.5" />
                      Reset password
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onAction(user, "view-audit")}
                    >
                      <ScrollText aria-hidden className="size-3.5" />
                      View audit for this user
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onAction(user, "toggle-status")}
                      variant="destructive"
                    >
                      <UserX aria-hidden className="size-3.5" />
                      {user.status === "active" ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
          );
        })}
        {users.length === 0 ? (
          <p className="p-6 text-center text-caption text-muted-foreground">
            No users match these filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
