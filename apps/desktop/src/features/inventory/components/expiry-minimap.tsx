import { cn } from "@cmis/ui/lib/utils";
import { motion } from "motion/react";

import type { MinimapBucket } from "../types";

/**
 * CMIS-UI-03 §3.2 — Timeline Minimap
 * 24px height strip with 12 monthly buckets.
 * Bar height = count of items expiring that month (relative).
 * Clicking a bucket filters table to that month.
 */
export function ExpiryMinimap({
  buckets,
  activeMonth,
  onSelectBucket,
}: {
  buckets: MinimapBucket[];
  activeMonth: string | null;
  onSelectBucket: (monthKey: string | null) => void;
}) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div
      aria-label="Expiry timeline — click a month to filter"
      className="flex shrink-0 items-end gap-px border-border/30 border-b bg-muted/30 px-3 py-1"
      role="toolbar"
    >
      {buckets.map((bucket, index) => {
        const isActive = activeMonth === bucket.monthKey;
        const heightPct = maxCount > 0 ? (bucket.count / maxCount) * 18 : 0;
        return (
          <button
            aria-label={`${bucket.label}: ${bucket.count} items expiring${isActive ? " (active filter)" : ""}`}
            aria-pressed={isActive}
            className={cn(
              "group relative flex flex-1 items-end justify-center transition-colors",
              bucket.count > 0 ? "hover:bg-muted/50" : "cursor-default"
            )}
            key={bucket.monthKey}
            onClick={() => onSelectBucket(isActive ? null : bucket.monthKey)}
            style={{ height: 24 }}
            type="button"
          >
            <motion.div
              animate={{ height: Math.max(2, heightPct) }}
              className={cn(
                "w-full max-w-[20px] rounded-t-sm",
                isActive
                  ? "bg-primary"
                  : "bg-muted-foreground/40 group-hover:bg-muted-foreground/60"
              )}
              initial={false}
              transition={{ bounce: 0, duration: 0.3, type: "spring" }}
            />
            {/* Month label — show every other month for legibility */}
            {index % 2 === 0 ? (
              <span className="absolute bottom-0 translate-y-full select-none text-[8px] text-muted-foreground">
                {bucket.label}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
