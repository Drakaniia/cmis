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
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
} from "react";

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

/** Segmented pill inside a filter fieldset. */
function SegmentedOption<T extends string>({
  active,
  label,
  layoutId,
  value,
  onSelect,
}: {
  active: boolean;
  label: string;
  layoutId: string;
  value: T;
  onSelect: (value: T) => void;
}) {
  const handleSelect = useCallback(() => onSelect(value), [onSelect, value]);

  return (
    <button
      aria-pressed={active}
      className={cn(
        "relative z-10 rounded-full px-2.5 py-1 font-medium text-xs transition-colors",
        active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={handleSelect}
      type="button"
    >
      {active ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-primary shadow-sm"
          layoutId={layoutId}
          transition={densitySpring}
        />
      ) : null}
      <span className="relative">{label}</span>
    </button>
  );
}

function MonthOption({
  bucket,
  onSelectMonth,
}: {
  bucket: MinimapBucket;
  onSelectMonth: (monthKey: string | null) => void;
}) {
  const handleSelect = useCallback(
    () => onSelectMonth(bucket.monthKey),
    [bucket.monthKey, onSelectMonth]
  );
  return (
    <DropdownMenuItem onClick={handleSelect}>
      <span className="flex flex-1 items-center justify-between">
        {bucket.label}
        <span className="ml-3 text-muted-foreground text-xs">
          {bucket.count}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

function ChipItem({
  chipKey,
  label,
  onRemoveChip,
}: {
  chipKey: string;
  label: string;
  onRemoveChip: (key: string) => void;
}) {
  const handleRemove = useCallback(
    () => onRemoveChip(chipKey),
    [chipKey, onRemoveChip]
  );
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs">
      {label}
      <button
        aria-label={`Remove ${label}`}
        className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        onClick={handleRemove}
        type="button"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

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
  const handleSearchInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSearchChange(event.target.value),
    [onSearchChange]
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && filters.search) {
        onSearchChange("");
      }
    },
    [filters.search, onSearchChange]
  );

  const handleClearSearch = useCallback(
    () => onSearchChange(""),
    [onSearchChange]
  );

  const handleSelectAllMonths = useCallback(
    () => onSelectMonth?.(null),
    [onSelectMonth]
  );

  const handleClearMonth = useCallback(
    (event: MouseEvent<SVGSVGElement>) => {
      event.stopPropagation();
      onSelectMonth?.(null);
    },
    [onSelectMonth]
  );

  const activeBucketLabel =
    monthBuckets.find((b) => b.monthKey === activeMonth)?.label ?? activeMonth;

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
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search medicine, SKU, batch…"
            value={filters.search}
          />
          {filters.search ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={handleClearSearch}
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
        <fieldset className="m-0 inline-flex min-w-0 shrink-0 items-center rounded-full border border-input bg-muted p-0.5">
          <legend className="sr-only">Date range filter</legend>
          {DATE_PRESETS.map((opt) => (
            <SegmentedOption
              active={filters.datePreset === opt.value}
              key={opt.value}
              label={opt.label}
              layoutId="expiry-date-pill"
              onSelect={onDatePresetChange}
              value={opt.value}
            />
          ))}
        </fieldset>

        {/* Status segmented */}
        <fieldset className="m-0 inline-flex min-w-0 shrink-0 items-center rounded-full border border-input bg-muted p-0.5">
          <legend className="sr-only">Expiry status filter</legend>
          {STATUS_OPTIONS.map((opt) => (
            <SegmentedOption
              active={filters.status === opt.value}
              key={opt.value}
              label={opt.label}
              layoutId="expiry-status-pill"
              onSelect={onStatusChange}
              value={opt.value}
            />
          ))}
        </fieldset>

        {/* Month dropdown — replaces minimap, CMIS-UI-03 §3.1 */}
        {monthBuckets.length > 0 && onSelectMonth ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="press-feedback inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground">
              {activeMonth ? (
                <span className="flex items-center gap-1">
                  {activeBucketLabel}
                  <X
                    aria-label="Clear month filter"
                    className="size-3 cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={handleClearMonth}
                  />
                </span>
              ) : (
                "Month"
              )}
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
              <DropdownMenuItem onClick={handleSelectAllMonths}>
                All months
              </DropdownMenuItem>
              {monthBuckets
                .filter((b) => b.count > 0)
                .map((b) => (
                  <MonthOption
                    bucket={b}
                    key={b.monthKey}
                    onSelectMonth={onSelectMonth}
                  />
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {/* Active filter chips — inline, not a separate row */}
        {activeChips.map((chip) => (
          <ChipItem
            chipKey={chip.key}
            key={`${chip.key}-${chip.value}`}
            label={chip.label}
            onRemoveChip={onRemoveChip}
          />
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
