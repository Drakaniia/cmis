import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Pencil, ScrollText } from "lucide-react";
import { useCallback } from "react";

import { MiniHistogram, StatusDot } from "../../components/indicators";
import { absoluteDateTime, relativeTime } from "../../format";
import type { AdminUser } from "../types";
import { ROLE_BADGE_CLASS } from "../types";

/**
 * CMIS-UI-09 §1.5 — read-only detail. Write actions live behind the Edit
 * button (which opens the same modal as Create), keeping read and write
 * chrome separate (Apple §12: parallel sheet, focused modal).
 */
export function UserDetailContent({
  user,
  onViewAudit,
  onEdit,
}: {
  onEdit?: (user: AdminUser) => void;
  onViewAudit: (user: AdminUser) => void;
  user: AdminUser | null;
}) {
  const handleViewAudit = useCallback(() => {
    if (user) {
      onViewAudit(user);
    }
  }, [onViewAudit, user]);

  const handleEdit = useCallback(() => {
    if (user && onEdit) {
      onEdit(user);
    }
  }, [onEdit, user]);

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="max-w-[220px] text-caption text-muted-foreground">
          Select a user to inspect their role history and activity.
        </p>
      </div>
    );
  }

  const totalActions = user.actions7d.reduce((sum, value) => sum + value, 0);
  const initials = user.name
    .split(" ")
    .map((part) => part.replace(".", "").trim())
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-border/50 border-b p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 font-semibold text-primary text-sm"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground text-heading tracking-tight">
              {user.name}
            </h2>
            <p className="truncate text-caption text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-caption",
              ROLE_BADGE_CLASS[user.role]
            )}
          >
            {user.role}
          </span>
          <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
            <StatusDot
              label={user.status === "active" ? "Active" : "Inactive"}
              status={user.status === "active" ? "ok" : "neutral"}
            />
            {user.status === "active" ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <section>
          <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
            Last login
          </h3>
          <p className="text-caption text-muted-foreground">
            {relativeTime(user.lastLogin)} · {absoluteDateTime(user.lastLogin)}
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
            Activity — last 7 days
          </h3>
          <p className="mt-1 font-bold text-display text-foreground leading-none">
            {totalActions}
          </p>
          <MiniHistogram
            data={user.actions7d}
            label={`${totalActions} actions over the last 7 days`}
          />
        </section>

        <section>
          <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
            Role history
          </h3>
          <ol className="mt-2 space-y-2 border-border/60 border-l pl-3">
            {[...user.roleHistory].reverse().map((entry) => (
              <li className="relative" key={`${entry.at}-${entry.to}`}>
                <span
                  aria-hidden
                  className="absolute top-1.5 -left-[17px] size-2 rounded-full bg-primary"
                />
                <p className="text-foreground text-sm">
                  {entry.from
                    ? `${entry.from} → ${entry.to}`
                    : `Added as ${entry.to}`}
                </p>
                <p className="text-caption text-muted-foreground">
                  {entry.by} · {absoluteDateTime(entry.at)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-border/50 border-t p-3">
        <Button
          className="press-feedback"
          onClick={handleViewAudit}
          size="sm"
          variant="outline"
        >
          <ScrollText aria-hidden className="size-3.5" />
          Audit
        </Button>
        {onEdit ? (
          <Button
            className="press-feedback ml-auto"
            onClick={handleEdit}
            size="sm"
          >
            <Pencil aria-hidden className="size-3.5" />
            Edit user
          </Button>
        ) : null}
      </div>
    </div>
  );
}
