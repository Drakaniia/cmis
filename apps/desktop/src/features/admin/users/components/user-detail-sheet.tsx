import { AdminSheet } from "../../components/sheet";
import type { AdminUser } from "../types";
import { UserDetailContent } from "./user-detail";

export function UserDetailSheet({
  open,
  onOpenChange,
  user,
  originRect,
  onViewAudit,
}: {
  onOpenChange: (open: boolean) => void;
  onViewAudit: (user: AdminUser) => void;
  open: boolean;
  originRect: DOMRect | null;
  user: AdminUser | null;
}) {
  return (
    <AdminSheet
      label={user ? user.name : "User detail"}
      onOpenChange={onOpenChange}
      open={open}
      originRect={originRect}
    >
      <UserDetailContent onViewAudit={onViewAudit} user={user} />
    </AdminSheet>
  );
}
