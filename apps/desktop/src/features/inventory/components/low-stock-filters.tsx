import { Button } from "@cmis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { ChevronDown, ShoppingCart } from "lucide-react";
import { useCallback } from "react";

import type { LowStockFilters as LowStockFiltersType } from "../types";
import { CategoryPicker } from "./category-picker";
import {
  ActiveFilterChips,
  FilterBar,
  FilterBulkAction,
  FilterControlsRow,
  FilterSearchField,
  SegmentedControl,
} from "./filter-bar";

const STATUS_OPTIONS: {
  label: string;
  value: LowStockFiltersType["status"];
}[] = [
  { label: "All", value: "all" },
  { label: "Out", value: "out-of-stock" },
  { label: "Low", value: "low-stock" },
  { label: "In Stock", value: "in-stock" },
];

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

/**
 * CMIS-UI-04 §3.3 — Low-Stock Filters Bar
 * Mirrors the expiry bar (Familiarity §16: same pattern, same place) because
 * both are the shared filter chrome.
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
  selectedCount = 0,
  onBulkReorder,
}: {
  activeChips: { key: string; label: string; value: string }[];
  density: "compact" | "comfortable";
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
  return (
    <FilterBar>
      <FilterSearchField
        density={density}
        label="Search medicine, SKU, supplier"
        onChange={onSearchChange}
        placeholder="Search medicine, SKU, supplier…"
        value={filters.search}
      />

      <FilterControlsRow>
        <SegmentedControl
          layoutId="lowstock-status-pill"
          legend="Stock status filter"
          onChange={onStatusChange}
          options={STATUS_OPTIONS}
          value={filters.status}
        />

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

        {/* Category dropdown — the shared picker, so it can create and edit the
            list it filters by, exactly like the forms do. */}
        <CategoryPicker
          allLabel="All categories"
          aria-label="Category filter"
          onChange={onCategoryChange}
          placeholder="Category"
          value={filters.category}
          variant="filter"
        />

        <ActiveFilterChips
          chips={activeChips}
          onClearAll={onClearFilters}
          onRemove={onRemoveChip}
        />

        {/* Bulk reorder — right-aligned inline, CMIS-UI-04 §3.1 */}
        <FilterBulkAction open={selectedCount > 0}>
          <Button
            className="press-feedback"
            onClick={onBulkReorder}
            size="sm"
            variant="confirm"
          >
            <ShoppingCart aria-hidden className="size-3.5" />
            Reorder selected ({selectedCount})
          </Button>
        </FilterBulkAction>
      </FilterControlsRow>
    </FilterBar>
  );
}
