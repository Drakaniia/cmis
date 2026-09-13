import { Button } from "@cmis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { cn } from "@cmis/ui/lib/utils";
import { ChevronDown, Search, Trash2, X } from "lucide-react";
import { motion } from "motion/react";

import { densitySpring } from "@/lib/motion";

import type {
  ExpiryDatePreset,
  ExpiryFilters as ExpiryFiltersType,
  MinimapBucket,
} from "../types";

const DATE_PRESETS: { label: string; value: ExpiryDatePreset }[] = [
  { label: "All", value: "all" },
  { label: "Next 30d", value: "next-30d" },
  { label: "30–90d", value: "30-90d" },
  { label: "Expired", value: "expired" },
];

const STATUS_OPTIONS: { label: string; value: ExpiryFiltersType["status"] }[] =
  [
    { label: "All", value: "all" },
    { label: "Expired", value: "expired" },
    { label: "Soon", value: "expiring-soon" },
    { label: "Later", value: "expiring-later" },
  ];

/**
 * CMIS-UI-03 §3.1 — Expiry Filters Bar
 * Sticky translucent bar with date range presets,
 * status segmented control, search, and active filter chips.
 */
export function ExpiryFiltersBar({
  filters,
  onSearchChange,
  onStatusChange,
  onDatePresetChange,
  onClearFilters,
  activeChips,
  onRemoveChip,
  density,
  selectedCount = 0,
  onBulkDispose,
  monthBuckets = [],
  activeMonth,
  onSelectMonth,
}: {
  activeChips: { key: string; label: string; value: string }[];
  activeMonth?: string | null;
  density: "compact" | "comfortable";
  filters: ExpiryFiltersType;
  monthBuckets?: MinimapBucket[];
  onBulkDispose?: () => void;
  onClearFilters: () => void;
  onDatePresetChange: (v: ExpiryDatePreset) => void;
  onRemoveChip: (key: string) => void;
  onSearchChange: (v: string) => void;
  onSelectMonth?: (monthKey: string | null) => void;
  onStatusChange: (v: ExpiryFiltersType["status"]) => void;
  selectedCount?: number;
}) {
  return (
    <div className="sticky top-0 z-10 border-border/50 border-b bg-card/95 backdrop-blur-[6px]">
      {/* Search row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative flex flex-1 items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
          />
          <input
            aria-label="Search medicine, SKU, batch"
            className={cn(
              "w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
              density === "compact" ? "h-8" : "h-9"
            )}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filters.search) {
                onSearchChange("");
              }
            }}
            placeholder="Search medicine, SKU, batch…"
            value={filters.search}
          />
          {filters.search ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={() => onSearchChange("")}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter controls + active chips — single inline row, CMIS-UI-03 §3.1 */}
      <div className="scrollbar-thin flex flex-wrap items-center gap-2 overflow-x-auto px-3 pb-2">
        {/* Date range presets */}
        <div
          aria-label="Date range filter"
          className="inline-flex shrink-0 items-center rounded-full border border-input bg-muted p-0.5"
          role="group"
        >
          {DATE_PRESETS.map((opt) => {
            const active = filters.datePreset === opt.value;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "relative z-10 rounded-full px-2.5 py-1 font-medium text-xs transition-colors",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={opt.value}
                onClick={() => onDatePresetChange(opt.value)}
                type="button"
              >
                {active ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-primary shadow-sm"
                    layoutId="expiry-date-pill"
                    transition={densitySpring}
                  />
                ) : null}
                <span className="relative">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Status segmented */}
        <div
          aria-label="Expiry status filter"
          className="inline-flex shrink-0 items-center rounded-full border border-input bg-muted p-0.5"
          role="group"
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = filters.status === opt.value;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "relative z-10 rounded-full px-2.5 py-1 font-medium text-xs transition-colors",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={opt.value}
                onClick={() => onStatusChange(opt.value)}
                type="button"
              >
                {active ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-primary shadow-sm"
                    layoutId="expiry-status-pill"
                    transition={densitySpring}
                  />
                ) : null}
                <span className="relative">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Month dropdown — replaces minimap, CMIS-UI-03 §3.1 */}
        {monthBuckets.length > 0 && onSelectMonth ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="press-feedback inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground">
              {activeMonth ? (
                <span className="flex items-center gap-1">
                  {(() => {
                    const bucket = monthBuckets.find(
                      (b) => b.monthKey === activeMonth
                    );
                    return bucket ? bucket.label : activeMonth;
                  })()}
                  <X
                    aria-label="Clear month filter"
                    className="size-3 cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMonth(null);
                    }}
                  />
                </span>
              ) : (
                "Month"
              )}
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
              <DropdownMenuItem onClick={() => onSelectMonth(null)}>
                All months
              </DropdownMenuItem>
              {monthBuckets
                .filter((b) => b.count > 0)
                .map((b) => (
                  <DropdownMenuItem
                    key={b.monthKey}
                    onClick={() => onSelectMonth(b.monthKey)}
                  >
                    <span className="flex flex-1 items-center justify-between">
                      {b.label}
                      <span className="ml-3 text-muted-foreground text-xs">
                        {b.count}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {/* Active filter chips — inline, not a separate row */}
        {activeChips.map((chip) => (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs"
            key={`${chip.key}-${chip.value}`}
          >
            {chip.label}
            <button
              aria-label={`Remove ${chip.label}`}
              className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
              onClick={() => onRemoveChip(chip.key)}
              type="button"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {activeChips.length > 0 ? (
          <button
            className="shrink-0 whitespace-nowrap text-caption text-primary hover:underline"
            onClick={onClearFilters}
            type="button"
          >
            Clear all
          </button>
        ) : null}

        {/* Bulk dispose — right-aligned inline, CMIS-UI-03 §3 */}
        {selectedCount > 0 ? (
          <Button
            className="press-feedback ml-auto shrink-0 bg-[#800000] text-white hover:bg-[#6b0000]"
            onClick={onBulkDispose}
            size="sm"
            variant="destructive"
          >
            <Trash2 aria-hidden className="size-3.5" />
            Dispose selected ({selectedCount})
          </Button>
        ) : null}
      </div>
    </div>
  );
}
