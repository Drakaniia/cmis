import { Button } from "@cmis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { ChevronDown, Download, Filter, Search, X } from "lucide-react";
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
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-card px-2.5 py-1 font-medium text-[11px] tracking-[0.01em] text-foreground shadow-sm">
      {label}
      <button
        aria-label={`Remove ${label}`}
        className="rounded-full bg-muted p-0.5 hover:bg-foreground hover:text-background"
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
  onExport,
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
  onExport: () => void;
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
            aria-label="Search dispensing records"
            className="h-9 w-full rounded-full border border-border/60 bg-muted/50 pr-9 pl-9 text-[13px] tracking-[0.01em] shadow-[inset_0_1px_2px_oklch(0_0_0/0.04)] outline-none placeholder:text-muted-foreground/60 focus:border-ring/60 focus:bg-card focus:ring-2 focus:ring-ring/20"
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search medicine, batch, staff…"
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

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 font-medium text-[12px] tracking-[0.01em] shadow-sm hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {presetLabel}
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
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

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 font-medium text-[12px] tracking-[0.01em] shadow-sm hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            <Filter aria-hidden className="size-3.5 text-muted-foreground" />
            {statusLabel}
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
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

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 font-medium text-[12px] tracking-[0.01em] shadow-sm hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {filters.staff === "All" ? "Staff" : filters.staff}
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[280px] min-w-[170px]">
            <ValueOption label="All staff" onSelect={onStaffChange} value="All" />
            {staffList.map((name) => (
              <ValueOption key={name} label={name} onSelect={onStaffChange} value={name} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 font-medium text-[12px] tracking-[0.01em] shadow-sm hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {filters.medicine === "All" ? "Medicine" : filters.medicine}
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[280px] min-w-[200px]">
            <ValueOption label="All medicines" onSelect={onMedicineChange} value="All" />
            {medicines.map((name) => (
              <ValueOption key={name} label={name} onSelect={onMedicineChange} value={name} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 font-medium text-[12px] tracking-[0.01em] shadow-sm hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {filters.branch === "All" ? "Location" : filters.branch}
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[170px]">
            <ValueOption label="All" onSelect={onBranchChange} value="All" />
            {branches.map((branch) => (
              <ValueOption key={branch} label={branch} onSelect={onBranchChange} value={branch} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          className="press-feedback rounded-full border-border/60 shadow-sm hover:shadow-md"
          onClick={onExport}
          size="sm"
          variant="outline"
        >
          <Download aria-hidden className="size-3.5" />
          Export CSV
        </Button>

        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] text-muted-foreground tabular-nums">
          {resultCount} records
        </span>
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-border/20 border-t bg-muted/20 px-3 py-2">
          {activeChips.map((chip) => (
            <ChipItem
              chipKey={chip.key}
              key={`${chip.key}-${chip.label}`}
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
        </div>
      ) : null}
    </div>
  );
}
