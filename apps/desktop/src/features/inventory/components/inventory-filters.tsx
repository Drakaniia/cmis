import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { cn } from "@cmis/ui/lib/utils";
import { ChevronDown, Search, X } from "lucide-react";
import { motion } from "motion/react";

import { densitySpring } from "@/lib/motion";

import type { InventoryFilters } from "../types";
import { INVENTORY_CATEGORIES } from "../types";
import { BarcodeInput } from "./barcode-input";

export function InventoryFiltersBar({
  filters,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onClearFilters,
  barcodeValue,
  onBarcodeChange,
  onBarcodeScan,
  activeChips,
  onRemoveChip,
  density,
}: {
  activeChips: { key: keyof InventoryFilters; label: string; value: string }[];
  barcodeValue: string;
  density: "compact" | "comfortable";
  filters: InventoryFilters;
  onBarcodeChange: (v: string) => void;
  onBarcodeScan: (code: string) => void;
  onCategoryChange: (v: string) => void;
  onClearFilters: () => void;
  onRemoveChip: (key: keyof InventoryFilters) => void;
  onSearchChange: (v: string) => void;
  onStatusChange: (v: string) => void;
}) {
  return (
    <div className="sticky top-0 z-10 border-border/50 border-b bg-card/95 backdrop-blur-[6px]">
      {/* Search + scan row */}
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
        <BarcodeInput
          onChange={onBarcodeChange}
          onScan={onBarcodeScan}
          value={barcodeValue}
        />
      </div>

      {/* Filter dropdowns row */}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="press-feedback inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground">
            {filters.category === "All" ? "Category" : filters.category}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => onCategoryChange("All")}>
              All categories
            </DropdownMenuItem>
            {INVENTORY_CATEGORIES.map((c) => (
              <DropdownMenuItem key={c} onClick={() => onCategoryChange(c)}>
                {c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status segmented toggle per spec — using buttons not dropdown */}
        <div
          aria-label="Status filter"
          className="inline-flex items-center rounded-full border border-input bg-muted p-0.5"
          role="group"
        >
          {[
            { label: "All", value: "All" },
            { label: "In", value: "in" },
            { label: "Low", value: "low" },
            { label: "Out", value: "out" },
            { label: "Expiring", value: "expiring" },
          ].map((opt) => {
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
                    layoutId="inventory-status-pill"
                    transition={densitySpring}
                  />
                ) : null}
                <span className="relative">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sort indicator hint — actual sort via column headers */}
        <span className="ml-auto text-caption text-muted-foreground">
          Sort by column header
        </span>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 ? (
        <div className="scrollbar-thin flex items-center gap-1.5 overflow-x-auto px-3 pb-2">
          {activeChips.map((chip) => (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs"
              key={`${String(chip.key)}-${chip.value}`}
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
          <button
            className="whitespace-nowrap text-caption text-primary hover:underline"
            onClick={onClearFilters}
            type="button"
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}
