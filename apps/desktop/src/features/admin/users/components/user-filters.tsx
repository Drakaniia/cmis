import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { ChevronDown, Search, X } from "lucide-react";
import { type ChangeEvent, useCallback } from "react";

import type { UserFilters } from "../types";
import { USER_ROLES } from "../types";

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
  chipKey: keyof UserFilters;
  label: string;
  onRemoveChip: (key: keyof UserFilters) => void;
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
  const triggerLabel = value === "All" ? label : value;

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
        {triggerLabel}
        <ChevronDown aria-hidden className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        <ValueOption
          label={`All ${label.toLowerCase()}`}
          onSelect={onChange}
          value="All"
        />
        {options.map((option) => (
          <ValueOption
            key={option}
            label={option}
            onSelect={onChange}
            value={option}
          />
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
  const handleSearchInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange({ search: event.target.value }),
    [onChange]
  );

  const handleClearSearch = useCallback(
    () => onChange({ search: "" }),
    [onChange]
  );

  const handleRoleChange = useCallback(
    (value: string) => onChange({ role: value }),
    [onChange]
  );

  const handleStatusChange = useCallback(
    (value: string) => onChange({ status: value }),
    [onChange]
  );

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
            onChange={handleSearchInput}
            placeholder="Search name or email…"
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

        <FilterMenu
          label="Role"
          onChange={handleRoleChange}
          options={USER_ROLES}
          value={filters.role}
        />
        <FilterMenu
          label="Status"
          onChange={handleStatusChange}
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
        </div>
      ) : null}
    </div>
  );
}
