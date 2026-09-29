import { Button } from "@cmis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { ChevronDown, Trash2, X } from "lucide-react";
import { type MouseEvent, useCallback } from "react";

import type {
  ExpiryDatePreset,
  ExpiryFilters as ExpiryFiltersType,
  MinimapBucket,
} from "../types";
import {
  ActiveFilterChips,
  FilterBar,
  FilterBulkAction,
  FilterControlsRow,
  FilterSearchField,
  SegmentedControl,
} from "./filter-bar";

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

/**
 * CMIS-UI-03 §3.1 — Expiry Filters Bar
 * Toolbar material with date range presets, status segmented control, search,
 * and active filter chips — all from the shared filter chrome, so this bar and
 * the low-stock one cannot drift apart.
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
    <FilterBar>
      <FilterSearchField
        density={density}
        label="Search medicine, SKU, batch"
        onChange={onSearchChange}
        placeholder="Search medicine, SKU, batch…"
        value={filters.search}
      />

      <FilterControlsRow>
        <SegmentedControl
          layoutId="expiry-date-pill"
          legend="Date range filter"
          onChange={onDatePresetChange}
          options={DATE_PRESETS}
          value={filters.datePreset}
        />

        <SegmentedControl
          layoutId="expiry-status-pill"
          legend="Expiry status filter"
          onChange={onStatusChange}
          options={STATUS_OPTIONS}
          value={filters.status}
        />

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

        <ActiveFilterChips
          chips={activeChips}
          onClearAll={onClearFilters}
          onRemove={onRemoveChip}
        />

        {/* Bulk dispose — right-aligned inline, CMIS-UI-03 §3 */}
        <FilterBulkAction open={selectedCount > 0}>
          <Button
            className="press-feedback"
            onClick={onBulkDispose}
            size="sm"
            variant="destructive"
          >
            <Trash2 aria-hidden className="size-3.5" />
            Dispose selected ({selectedCount})
          </Button>
        </FilterBulkAction>
      </FilterControlsRow>
    </FilterBar>
  );
}
