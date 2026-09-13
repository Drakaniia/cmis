import type { LucideIcon } from "lucide-react";
import type * as React from "react";

/**
 * CMIS-UI-01 §1 — answer "where am I / what changed" before the data. The
 * eyebrow carries role + branch, the display line carries the promise, the
 * caption states the actual situation in words (Apple §4: hierarchy means the
 * most important thing is the most obvious). No decorative divider bar — the
 * size and weight step already separates the title from everything else.
 */
export function DashboardHeader({
  action,
  eyebrow,
  icon: Icon,
  meta,
  title,
}: {
  action?: React.ReactNode;
  eyebrow: string;
  icon: LucideIcon;
  meta?: string;
  title: string;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
          <span
            aria-hidden
            className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary"
          >
            <Icon className="size-3" />
          </span>
          {eyebrow}
        </p>
        <h1 className="mt-1 font-bold text-foreground text-title tracking-tight">
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {meta ? (
          <span className="font-medium text-caption text-muted-foreground tabular-nums">
            {meta}
          </span>
        ) : null}
        {action}
      </div>
    </header>
  );
}
