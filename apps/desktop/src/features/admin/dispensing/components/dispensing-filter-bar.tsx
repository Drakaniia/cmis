import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { ChevronDown, Filter, Search, X } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useCallback } from "react";

import type { DispensingChipKey } from "../hooks/use-dispensing-filters";
import type {
  DispensingDatePreset,
  DispensingFilters,
  DispensingStatus,
} from "../types";
import { DISPENSING_DATE_PRESETS, DISPENSING_STATUSES } from "../types";

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs">
      {label}
      <button
        aria-label={`Remove ${label}`}
        className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** A dropdown item that reports the value it represents. */
function ValueOption<T extends string>({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: T;
  onSelect: (value: T) => void;
}) {
  const handleSelect = useCallback(() => onSelect(value), [onSelect, value]);
  return <DropdownMenuItem onClick={handleSelect}>{label}</DropdownMenuItem>;
}

function StatusOption({
  active,
  label,
  value,
  onStatusChange,
}: {
  active: boolean;
  label: string;
  value: "all" | DispensingStatus;
  onStatusChange: (value: "all" | DispensingStatus) => void;
}) {
  const handleSelect = useCallback(
    () => onStatusChange(value),
    [onStatusChange, value]
  );
  return (
    <DropdownMenuCheckboxItem
      checked={active}
      closeOnClick={false}
      onClick={handleSelect}
    >
      {label}
    </DropdownMenuCheckboxItem>
  );
}

function ChipItem({
  chipKey,
  label,
  onRemoveChip,
}: {
  chipKey: DispensingChipKey;
  label: string;
  onRemoveChip: (key: DispensingChipKey) => void;
}) {
  const handleRemove = useCallback(
    () => onRemoveChip(chipKey),
    [chipKey, onRemoveChip]
  );
  return <Chip label={label} onRemove={handleRemove} />;
}

/**
 * CMIS-UI-06 §3 — sticky translucent filter bar with active chips.
 * Filters persist to the URL so an audit sweep survives a refresh or palette
 * jump.
 */
export function DispensingFilterBar({
  activeChips,
  branches,
  filters,
  medicines,
  onBranchChange,
  onClearFilters,
  onMedicineChange,
  onPresetChange,
  onRemoveChip,
  onSearchChange,
  onStaffChange,
  onStatusChange,
  resultCount,
  staffList,
}: {
  activeChips: { key: DispensingChipKey; label: string }[];
  branches: string[];
  filters: DispensingFilters;
  medicines: string[];
  onBranchChange: (value: string) => void;
  onClearFilters: () => void;
  onMedicineChange: (value: string) => void;
  onPresetChange: (value: DispensingDatePreset) => void;
  onRemoveChip: (key: DispensingChipKey) => void;
  onRequestorChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStaffChange: (value: string) => void;
  onStatusChange: (value: "all" | DispensingStatus) => void;
  resultCount: number;
  staffList: string[];
}) {
  const presetLabel =
    DISPENSING_DATE_PRESETS.find((p) => p.value === filters.preset)?.label ??
    "Range";

  const statusLabel =
    DISPENSING_STATUSES.find((s) => s.value === filters.status)?.label ??
    "Status";

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
    <div className="sticky top-0 z-10 shrink-0 border-border/50 border-b bg-card/95 backdrop-blur-[6px]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {/* Search */}
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
          />
          <input
            aria-label="Search dispensing records"
            className="h-8 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search medicine, batch, staff…"
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

        {/* Date range preset */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {presetLabel}
            <ChevronDown aria-hidden className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[170px]">
            {DISPENSING_DATE_PRESETS.map((preset) => (
              <ValueOption
                key={preset.value}
                label={preset.label}
                onSelect={onPresetChange}
                value={preset.value}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status segmented */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            <Filter aria-hidden className="size-3" />
            {statusLabel}
            <ChevronDown aria-hidden className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[150px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              {DISPENSING_STATUSES.map((status) => (
                <StatusOption
                  active={filters.status === status.value}
                  key={status.value}
                  label={status.label}
                  onStatusChange={onStatusChange}
                  value={status.value}
                />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Staff */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {filters.staff === "All" ? "Staff" : filters.staff}
            <ChevronDown aria-hidden className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[280px] min-w-[170px]"
          >
            <ValueOption
              label="All staff"
              onSelect={onStaffChange}
              value="All"
            />
            {staffList.map((name) => (
              <ValueOption
                key={name}
                label={name}
                onSelect={onStaffChange}
                value={name}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Medicine */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {filters.medicine === "All" ? "Medicine" : filters.medicine}
            <ChevronDown aria-hidden className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[280px] min-w-[200px]"
          >
            <ValueOption
              label="All medicines"
              onSelect={onMedicineChange}
              value="All"
            />
            {medicines.map((name) => (
              <ValueOption
                key={name}
                label={name}
                onSelect={onMedicineChange}
                value={name}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Branch */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {filters.branch === "All" ? "Location" : filters.branch}
            <ChevronDown aria-hidden className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[170px]">
            <ValueOption label="All" onSelect={onBranchChange} value="All" />
            {branches.map((branch) => (
              <ValueOption
                key={branch}
                label={branch}
                onSelect={onBranchChange}
                value={branch}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-caption text-muted-foreground">
          {resultCount} records
        </span>
      </div>

      {/* Active chips */}
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          {activeChips.map((chip) => (
            <ChipItem
              chipKey={chip.key}
              key={`${chip.key}-${chip.label}`}
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
