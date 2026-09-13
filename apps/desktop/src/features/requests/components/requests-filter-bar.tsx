import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { CalendarRange, Check, ChevronDown, Search, X } from "lucide-react";
import type { RequestDatePreset, RequestFilters } from "../types";
import { REQUEST_DATE_PRESETS } from "../types";

type ChipKey = "category" | "datePreset" | "requestor" | "search";

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
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && filters.search) {
                onSearchChange("");
              }
            }}
            placeholder="Search name, ID, medicine…"
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

        <input
          aria-label="Filter by requestor"
          className="h-8 w-[180px] rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          onChange={(event) => onRequestorChange(event.target.value)}
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
                <DropdownMenuItem
                  key={preset.value}
                  onClick={() => onSetDatePreset(preset.value)}
                >
                  {filters.datePreset === preset.value ? (
                    <Check aria-hidden className="size-3.5" />
                  ) : null}
                  {preset.label}
                </DropdownMenuItem>
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
              <DropdownMenuItem onClick={() => onCategoryChange("All")}>
                All categories
              </DropdownMenuItem>
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category}
                  onClick={() => onCategoryChange(category)}
                >
                  {category}
                </DropdownMenuItem>
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
              onChange={(event) =>
                onSetCustomRange(event.target.value, filters.to)
              }
              type="date"
              value={filters.from}
            />
          </label>
          <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
            To
            <input
              className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              onChange={(event) =>
                onSetCustomRange(filters.from, event.target.value)
              }
              type="date"
              value={filters.to}
            />
          </label>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="scrollbar-thin flex items-center gap-1.5 overflow-x-auto px-3 pb-2">
          {activeChips.map((chip) => (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs"
              key={`${chip.key}`}
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
