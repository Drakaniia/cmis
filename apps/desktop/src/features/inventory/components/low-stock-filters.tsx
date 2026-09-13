import { Button } from "@cmis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { cn } from "@cmis/ui/lib/utils";
import { ChevronDown, Search, ShoppingCart, X } from "lucide-react";
import { motion } from "motion/react";
import { type ChangeEvent, type KeyboardEvent, useCallback } from "react";

import { densitySpring } from "@/lib/motion";

import type { LowStockFilters as LowStockFiltersType } from "../types";

const STATUS_OPTIONS: {
  label: string;
  value: LowStockFiltersType["status"];
}[] = [
  { label: "All", value: "all" },
  { label: "Out", value: "out-of-stock" },
  { label: "Low", value: "low-stock" },
  { label: "In Stock", value: "in-stock" },
];

/** Segmented pill inside a filter fieldset. */
function SegmentedOption({
  active,
  label,
  value,
  onSelect,
}: {
  active: boolean;
  label: string;
  value: LowStockFiltersType["status"];
  onSelect: (value: LowStockFiltersType["status"]) => void;
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
          layoutId="lowstock-status-pill"
          transition={densitySpring}
        />
      ) : null}
      <span className="relative">{label}</span>
    </button>
  );
}

/** A dropdown item that reports the value it represents. */
function ValueOption({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: string;
  onSelect: (value: string) => void;
}) {
  const handleSelect = useCallback(() => onSelect(value), [onSelect, value]);
  return <DropdownMenuItem onClick={handleSelect}>{label}</DropdownMenuItem>;
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
 * CMIS-UI-04 §3.3 — Low-Stock Filters Bar
 * Mirrors expiry filters bar placement (Familiarity: same pattern as §03).
 * Segmented status default: "all" (Low+Out — actionable items).
 * Dropdowns: Supplier, Category.
 */
export function LowStockFiltersBar({
  filters,
  onSearchChange,
  onStatusChange,
  onSupplierChange,
  onCategoryChange,
  onClearFilters,
  activeChips,
  onRemoveChip,
  density,
  distinctSuppliers,
  distinctCategories,
  selectedCount = 0,
  onBulkReorder,
}: {
  activeChips: { key: string; label: string; value: string }[];
  density: "compact" | "comfortable";
  distinctCategories: string[];
  distinctSuppliers: string[];
  filters: LowStockFiltersType;
  onBulkReorder?: () => void;
  onCategoryChange: (v: string) => void;
  onClearFilters: () => void;
  onRemoveChip: (key: string) => void;
  onSearchChange: (v: string) => void;
  onStatusChange: (v: LowStockFiltersType["status"]) => void;
  onSupplierChange: (v: string) => void;
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
            aria-label="Search medicine, SKU, supplier"
            className={cn(
              "w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
              density === "compact" ? "h-8" : "h-9"
            )}
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search medicine, SKU, supplier…"
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

      {/* Filter controls + active chips — single inline row, CMIS-UI-04 §3.3 */}
      <div className="scrollbar-thin flex flex-wrap items-center gap-2 overflow-x-auto px-3 pb-2">
        {/* Status segmented */}
        <fieldset className="m-0 inline-flex min-w-0 shrink-0 items-center rounded-full border border-input bg-muted p-0.5">
          <legend className="sr-only">Stock status filter</legend>
          {STATUS_OPTIONS.map((opt) => (
            <SegmentedOption
              active={filters.status === opt.value}
              key={opt.value}
              label={opt.label}
              onSelect={onStatusChange}
              value={opt.value}
            />
          ))}
        </fieldset>

        {/* Supplier dropdown — CMIS-UI-04 §3.3 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="press-feedback inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground">
            {filters.supplier === "All" ? "Supplier" : filters.supplier}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            <ValueOption
              label="All suppliers"
              onSelect={onSupplierChange}
              value="All"
            />
            {distinctSuppliers.map((s) => (
              <ValueOption
                key={s}
                label={s}
                onSelect={onSupplierChange}
                value={s}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Category dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="press-feedback inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground">
            {filters.category === "All" ? "Category" : filters.category}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            <ValueOption
              label="All categories"
              onSelect={onCategoryChange}
              value="All"
            />
            {distinctCategories.map((c) => (
              <ValueOption
                key={c}
                label={c}
                onSelect={onCategoryChange}
                value={c}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

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

        {/* Bulk reorder — right-aligned inline, CMIS-UI-04 §3.1 */}
        {selectedCount > 0 ? (
          <Button
            className="press-feedback ml-auto shrink-0 bg-[#800000] text-white hover:bg-[#6b0000]"
            onClick={onBulkReorder}
            size="sm"
            variant="destructive"
          >
            <ShoppingCart aria-hidden className="size-3.5" />
            Reorder selected ({selectedCount})
          </Button>
        ) : null}
      </div>
    </div>
  );
}
