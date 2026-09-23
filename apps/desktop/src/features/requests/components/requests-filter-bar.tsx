import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { Button } from "@cmis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import {
  CalendarRange,
  Check,
  ChevronDown,
  Plus,
  Search,
  X,
} from "lucide-react";
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
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-card px-2.5 py-1 font-medium text-[11px] tracking-[0.01em] text-foreground shadow-sm">
      {label}
      <button
        aria-label={`Remove ${label}`}
        className="rounded-full bg-muted p-0.5 hover:bg-foreground hover:text-background"
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
  onNewRequest,
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
  /**
   * Opens the New Request form. The same dialog `Ctrl+N` opens — a button here
   * because a shortcut is not a discoverable interface (F1).
   */
  onNewRequest?: () => void;
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
    (iso: string) => onSetCustomRange(iso, filters.to),
    [filters.to, onSetCustomRange]
  );

  const handleToChange = useCallback(
    (iso: string) => onSetCustomRange(filters.from, iso),
    [filters.from, onSetCustomRange]
  );

  const invalidRange =
    Boolean(filters.from) && Boolean(filters.to) && filters.from > filters.to;

  return (
    <div className="sticky top-0 z-10 shrink-0 border-border/40 border-b bg-card/80 backdrop-blur-[16px] backdrop-saturate-[180%]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10"
      />
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 size-[15px] text-muted-foreground/70"
          />
          <input
            aria-label="Search requestor, ID or medicine"
            className="h-9 w-full rounded-full border border-border/60 bg-muted/50 pr-9 pl-9 text-[13px] tracking-[0.01em] shadow-[inset_0_1px_2px_oklch(0_0_0/0.04)] outline-none placeholder:text-muted-foreground/60 focus:border-ring/60 focus:bg-card focus:ring-2 focus:ring-ring/20"
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search name, ID, medicine…"
            value={filters.search}
          />
          {filters.search ? (
            <button
              aria-label="Clear search"
              className="absolute right-1.5 rounded-full bg-muted p-1.5 text-muted-foreground hover:bg-foreground hover:text-background"
              onClick={handleClearSearch}
              type="button"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="relative flex items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground/60"
          />
          <input
            aria-label="Filter by requestor"
            className="h-9 w-[180px] rounded-full border border-border/60 bg-muted/50 pr-3 pl-8 text-[13px] tracking-[0.01em] shadow-[inset_0_1px_2px_oklch(0_0_0/0.04)] outline-none placeholder:text-muted-foreground/60 focus:border-ring/60 focus:bg-card focus:ring-2 focus:ring-ring/20"
            onChange={handleRequestorInput}
            placeholder="Requestor…"
            value={filters.requestor}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 font-medium text-[12px] tracking-[0.01em] shadow-sm hover:bg-accent hover:text-accent-foreground">
            <CalendarRange aria-hidden className="size-3.5 text-muted-foreground" />
            {dateLabel}
            <ChevronDown className="size-3 text-muted-foreground" />
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
          <DropdownMenuTrigger className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 font-medium text-[12px] tracking-[0.01em] shadow-sm hover:bg-accent hover:text-accent-foreground">
            {filters.category === "All" ? "Category" : filters.category}
            <ChevronDown className="size-3 text-muted-foreground" />
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

        {onNewRequest ? (
          <Button
            className="press-feedback ml-auto rounded-full shadow-[0_1px_3px_oklch(0_0_0/0.08)] hover:shadow-[0_2px_8px_oklch(0_0_0/0.12)]"
            onClick={onNewRequest}
            size="sm"
          >
            <Plus className="size-3.5" />
            New request
          </Button>
        ) : null}
      </div>

      {filters.datePreset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 border-border/20 border-t bg-muted/20 px-3 py-2.5">
          <label className="flex items-center gap-2 text-[12px] tracking-[0.01em] text-muted-foreground">
            From
            <AppleDatePicker
              className="h-8 w-[132px] rounded-full"
              max={filters.to || undefined}
              onChange={handleFromChange}
              placeholder="YYYY-MM-DD"
              value={filters.from}
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] tracking-[0.01em] text-muted-foreground">
            To
            <AppleDatePicker
              className="h-8 w-[132px] rounded-full"
              min={filters.from || undefined}
              onChange={handleToChange}
              placeholder="YYYY-MM-DD"
              value={filters.to}
            />
          </label>
          {invalidRange ? (
            <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-[11px] text-destructive">
              From must be on or before To
            </span>
          ) : null}
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-border/20 border-t bg-muted/20 px-3 py-2">
          {activeChips.map((chip) => (
            <ChipItem
              chipKey={chip.key}
              key={chip.key}
              label={chip.label}
              onRemoveChip={onRemoveChip}
            />
          ))}
          <button
            className="rounded-full border border-border/60 bg-card px-2.5 py-1 font-medium text-[11px] tracking-[0.01em] text-primary shadow-sm hover:bg-accent"
            onClick={onClearFilters}
            type="button"
          >
            Clear all
          </button>
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 font-medium text-[11px] tracking-[0.01em] text-muted-foreground sm:inline-flex">
            <span className="rounded bg-card px-1 py-0.5 font-mono text-[10px] shadow-sm">⌘A</span>
            select visible
          </span>
        </div>
      ) : null}
    </div>
  );
}
