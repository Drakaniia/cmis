import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { CalendarRange, Check, ChevronDown, Search, X } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useCallback } from "react";
import type { RequestDatePreset, RequestFilters } from "../types";
import { REQUEST_DATE_PRESETS } from "../types";

type ChipKey = "category" | "datePreset" | "requestor" | "search";

/** A dropdown item that reports the value it represents. */
function ValueOption<T extends string>({
  label,
  value,
  trailing,
  onSelect,
}: {
  label: string;
  value: T;
  trailing?: boolean;
  onSelect: (value: T) => void;
}) {
  const handleSelect = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <DropdownMenuItem onClick={handleSelect}>
      {trailing ? <Check aria-hidden className="size-3.5" /> : null}
      {label}
    </DropdownMenuItem>
  );
}

function ChipItem({
  chipKey,
  label,
  onRemoveChip,
}: {
  chipKey: ChipKey;
  label: string;
  onRemoveChip: (key: ChipKey) => void;
}) {
  const handleRemove = useCallback(
    () => onRemoveChip(chipKey),
    [chipKey, onRemoveChip]
  );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs">
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
 * CMIS-UI-05 §5 — persistent filter bar above the columns. Sticky translucent
 * so triage filters stay visible while the board scrolls horizontally.
 */
export function RequestsFilterBar({
  activeChips,
  categories,
  filters,
  onCategoryChange,
  onClearFilters,
  onRemoveChip,
  onRequestorChange,
  onSearchChange,
  onSetCustomRange,
  onSetDatePreset,
}: {
  activeChips: { key: ChipKey; label: string }[];
  categories: string[];
  filters: RequestFilters;
  onCategoryChange: (value: string) => void;
  onClearFilters: () => void;
  onRemoveChip: (key: ChipKey) => void;
  onRequestorChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSetCustomRange: (from: string, to: string) => void;
  onSetDatePreset: (preset: RequestDatePreset) => void;
}) {
  const dateLabel =
    REQUEST_DATE_PRESETS.find((preset) => preset.value === filters.datePreset)
      ?.label ?? "All time";

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

  const handleRequestorInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onRequestorChange(event.target.value),
    [onRequestorChange]
  );

  const handleFromChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSetCustomRange(event.target.value, filters.to),
    [filters.to, onSetCustomRange]
  );

  const handleToChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSetCustomRange(filters.from, event.target.value),
    [filters.from, onSetCustomRange]
  );

  return (
    <div className="sticky top-0 z-10 shrink-0 border-border/50 border-b bg-card/95 backdrop-blur-[6px]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
          />
          <input
            aria-label="Search requestor, ID or medicine"
            className="h-8 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search name, ID, medicine…"
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

        <input
          aria-label="Filter by requestor"
          className="h-8 w-[180px] rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          onChange={handleRequestorInput}
          placeholder="Requestor name or ID"
          value={filters.requestor}
        />

        <DropdownMenu>
          <DropdownMenuTrigger className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground">
            <CalendarRange aria-hidden className="size-3" />
            {dateLabel}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Submitted</DropdownMenuLabel>
              {REQUEST_DATE_PRESETS.map((preset) => (
                <ValueOption
                  key={preset.value}
                  label={preset.label}
                  onSelect={onSetDatePreset}
                  trailing={filters.datePreset === preset.value}
                  value={preset.value}
                />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground">
            {filters.category === "All" ? "Category" : filters.category}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                Only categories with active requests
              </DropdownMenuLabel>
              <ValueOption
                label="All categories"
                onSelect={onCategoryChange}
                value="All"
              />
              {categories.map((category) => (
                <ValueOption
                  key={category}
                  label={category}
                  onSelect={onCategoryChange}
                  value={category}
                />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filters.datePreset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
          <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
            From
            <input
              className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              onChange={handleFromChange}
              type="date"
              value={filters.from}
            />
          </label>
          <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
            To
            <input
              className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              onChange={handleToChange}
              type="date"
              value={filters.to}
            />
          </label>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="scrollbar-thin flex items-center gap-1.5 overflow-x-auto px-3 pb-2">
          {activeChips.map((chip) => (
            <ChipItem
              chipKey={chip.key}
              key={chip.key}
              label={chip.label}
              onRemoveChip={onRemoveChip}
            />
          ))}
          <button
            className="whitespace-nowrap text-caption text-primary hover:underline"
            onClick={onClearFilters}
            type="button"
          >
            Clear all
          </button>
          <span className="ml-auto shrink-0 text-caption text-muted-foreground">
            Ctrl/⌘+A selects the visible cards
          </span>
        </div>
      ) : null}
    </div>
  );
}
