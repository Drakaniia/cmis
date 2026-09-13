import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { ChevronDown, Search, X } from "lucide-react";

import type { UserFilters } from "../types";
import { USER_ROLES } from "../types";

function FilterMenu({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground"
            type="button"
          />
        }
      >
        {value === "All" ? label : value}
        <ChevronDown aria-hidden className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        <DropdownMenuItem onClick={() => onChange("All")}>
          All {label.toLowerCase()}
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem key={option} onClick={() => onChange(option)}>
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * CMIS-UI-09 §1.2 — filter bar for the users table. Sticky so the roster stays
 * filterable while scanning; 00 §5.2 chips mirror the other routes.
 */
export function UserFiltersBar({
  filters,
  onChange,
  resultCount,
  totalCount,
  activeChips,
  onClearFilters,
  onRemoveChip,
}: {
  activeChips: { key: keyof UserFilters; label: string }[];
  filters: UserFilters;
  onChange: (patch: Partial<UserFilters>) => void;
  onClearFilters: () => void;
  onRemoveChip: (key: keyof UserFilters) => void;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="shrink-0 border-border/50 border-b bg-card/95 backdrop-blur-[6px]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
          />
          <input
            aria-label="Search users by name or email"
            className="h-8 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Search name or email…"
            value={filters.search}
          />
          {filters.search ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={() => onChange({ search: "" })}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <FilterMenu
          label="Role"
          onChange={(value) => onChange({ role: value })}
          options={USER_ROLES}
          value={filters.role}
        />
        <FilterMenu
          label="Status"
          onChange={(value) => onChange({ status: value })}
          options={["active", "inactive"]}
          value={filters.status}
        />

        <span className="text-caption text-muted-foreground">
          {resultCount} of {totalCount}
        </span>
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          {activeChips.map((chip) => (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs"
              key={chip.key}
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
        </div>
      ) : null}
    </div>
  );
}
