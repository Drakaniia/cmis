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
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filters.search) {
                onSearchChange("");
              }
            }}
            placeholder="Search medicine, SKU, supplier…"
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

      {/* Filter controls + active chips — single inline row, CMIS-UI-04 §3.3 */}
      <div className="scrollbar-thin flex flex-wrap items-center gap-2 overflow-x-auto px-3 pb-2">
        {/* Status segmented */}
        <div
          aria-label="Stock status filter"
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
                    layoutId="lowstock-status-pill"
                    transition={densitySpring}
                  />
                ) : null}
                <span className="relative">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Supplier dropdown — CMIS-UI-04 §3.3 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="press-feedback inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground">
            {filters.supplier === "All" ? "Supplier" : filters.supplier}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => onSupplierChange("All")}>
              All suppliers
            </DropdownMenuItem>
            {distinctSuppliers.map((s) => (
              <DropdownMenuItem key={s} onClick={() => onSupplierChange(s)}>
                {s}
              </DropdownMenuItem>
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
            <DropdownMenuItem onClick={() => onCategoryChange("All")}>
              All categories
            </DropdownMenuItem>
            {distinctCategories.map((c) => (
              <DropdownMenuItem key={c} onClick={() => onCategoryChange(c)}>
                {c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

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
