import type * as React from "react";

/**
 * CMIS-UI-09 — branded page header shared by the five Admin screens.
 * Mirrors CMIS-UI-00 §1.4: maroon accent bar under a foreground heading.
 */
export function AdminPageHeader({
  title,
  actions,
}: {
  actions?: React.ReactNode;
  title: string;
}) {
  return (
    <header className="shrink-0 border-border/50 border-b bg-card px-3 py-2 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-bold text-foreground text-heading tracking-tight">
            {title}
          </h1>
          <div aria-hidden className="mt-1 h-1 w-12 rounded-full bg-primary" />
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
