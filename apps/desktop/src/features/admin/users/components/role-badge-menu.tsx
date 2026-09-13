import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { cn } from "@cmis/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";

import type { AdminUser, UserRole } from "../types";
import { ROLE_BADGE_CLASS, USER_ROLES } from "../types";

/**
 * CMIS-UI-09 §1.3 — Role is an editable badge. The dropdown is anchored to the
 * badge origin (Apple §7) and the parent confirms the change before applying.
 */
export function RoleBadgeMenu({
  user,
  onRequestRole,
}: {
  onRequestRole: (role: UserRole) => void;
  user: AdminUser;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label={`Role: ${user.role}. Change role`}
            className={cn(
              "press-feedback inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-caption",
              ROLE_BADGE_CLASS[user.role]
            )}
            type="button"
          />
        }
      >
        {user.role}
        <ChevronDown aria-hidden className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[150px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Change role</DropdownMenuLabel>
          {USER_ROLES.map((role) => (
            <DropdownMenuItem key={role} onClick={() => onRequestRole(role)}>
              {role}
              {user.role === role ? (
                <Check aria-hidden className="ml-auto size-3.5" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
