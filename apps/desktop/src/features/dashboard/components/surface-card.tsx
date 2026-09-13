import { cn } from "@cmis/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type * as React from "react";

export type SurfaceTone = "neutral" | "primary" | "success" | "warn" | "danger";

/**
 * Tinted shells raise the material weight of the surfaces that need attention
 * (Apple §12 — material weight encodes hierarchy). The neutral card is opaque
 * field material so tables and lists stay legible on top of it.
 */
const TONE_SHELL: Record<SurfaceTone, string> = {
  danger:
    "border border-destructive/25 bg-destructive/[0.05] shadow-[var(--shadow-card)]",
  neutral: "canvas-card",
  primary:
    "border border-primary/20 bg-primary/[0.04] shadow-[var(--shadow-card)]",
  success:
    "border border-[var(--success)]/25 bg-[var(--success)]/[0.06] shadow-[var(--shadow-card)]",
  warn: "border border-[var(--warning)]/30 bg-[var(--warning)]/[0.07] shadow-[var(--shadow-card)]",
};

const TONE_ICON: Record<SurfaceTone, string> = {
  danger: "bg-destructive/12 text-destructive",
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-[var(--success)]/15 text-success-foreground",
  warn: "bg-[var(--warning)]/18 text-warning-foreground",
};

export function SurfaceCard({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"div"> & { tone?: SurfaceTone }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl",
        TONE_SHELL[tone],
        className
      )}
      {...props}
    />
  );
}

export function SurfaceCardHeader({
  action,
  caption,
  icon: Icon,
  title,
  tone = "neutral",
}: {
  action?: React.ReactNode;
  caption?: string;
  icon?: LucideIcon;
  title: string;
  tone?: SurfaceTone;
}) {
  return (
    <div className="flex items-start gap-3 px-4 pt-4 pb-3 sm:px-5">
      {Icon ? (
        <span
          aria-hidden
          className={cn(
            "mt-px flex size-8 shrink-0 items-center justify-center rounded-lg",
            TONE_ICON[tone]
          )}
        >
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-foreground text-ui">
          {title}
        </h2>
        {caption ? (
          <p className="mt-0.5 truncate text-caption text-muted-foreground">
            {caption}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
