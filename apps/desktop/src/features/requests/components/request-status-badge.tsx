import { cn } from "@cmis/ui/lib/utils";

import type { RequestStatus } from "../types";
import { statusMetaOf } from "../types";

/**
 * CMIS-UI-05 §3 — status micro-badge: color dot **plus** text, never color alone.
 * `sm` is the card caption (10px), `md` the detail-modal badge.
 */
export function RequestStatusBadge({
  size = "sm",
  status,
}: {
  size?: "md" | "sm";
  status: RequestStatus;
}) {
  const meta = statusMetaOf(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium leading-none",
        meta.badgeClass,
        size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-caption"
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.accent)} />
      {meta.label}
    </span>
  );
}
