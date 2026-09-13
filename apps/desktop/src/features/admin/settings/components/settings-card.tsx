import type * as React from "react";

/** CMIS-UI-09 §2.3 — one opaque field card per settings section. */
export function SettingsCard({
  title,
  description,
  actions,
  children,
  footer,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  description?: string;
  footer?: React.ReactNode;
  title: string;
}) {
  return (
    <section className="field-opaque overflow-hidden rounded-md">
      <div className="flex flex-wrap items-start justify-between gap-2 border-border/50 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground text-sm tracking-tight">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-caption text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-border/50 border-t px-4 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
