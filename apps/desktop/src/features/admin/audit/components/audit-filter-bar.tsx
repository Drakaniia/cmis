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

import type { AuditChipKey } from "../hooks/use-audit-filters";
import type { AuditActionType, AuditDatePreset, AuditFilters } from "../types";
import {
  AUDIT_ACTION_TYPES,
  AUDIT_DATE_PRESETS,
  auditCategoryOf,
} from "../types";

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

function ActionOption({
  action,
  checked,
  onToggleAction,
}: {
  action: AuditActionType;
  checked: boolean;
  onToggleAction: (action: AuditActionType) => void;
}) {
  const handleToggle = useCallback(
    () => onToggleAction(action),
    [action, onToggleAction]
  );
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      closeOnClick={false}
      onClick={handleToggle}
    >
      {auditCategoryOf(action).label}
    </DropdownMenuCheckboxItem>
  );
}

function ChipItem({
  chipKey,
  label,
  onRemoveChip,
}: {
  chipKey: AuditChipKey;
  label: string;
  onRemoveChip: (key: AuditChipKey, label?: string) => void;
}) {
  const handleRemove = useCallback(
    () => onRemoveChip(chipKey, label),
    [chipKey, label, onRemoveChip]
  );
  return <Chip label={label} onRemove={handleRemove} />;
}

/**
 * CMIS-UI-09 §3.3 — sticky filter bar. Filters persist to the URL so an audit
 * sweep survives a refresh or a palette jump.
 */
export function AuditFilterBar({
  filters,
  users,
  activeChips,
  resultCount,
  onSearchChange,
  onUserChange,
  onPresetChange,
  onToggleAction,
  onClearFilters,
  onRemoveChip,
}: {
  activeChips: { key: AuditChipKey; label: string }[];
  filters: AuditFilters;
  onClearFilters: () => void;
  onPresetChange: (value: AuditDatePreset) => void;
  onRemoveChip: (key: AuditChipKey, label?: string) => void;
  onSearchChange: (value: string) => void;
  onToggleAction: (action: AuditActionType) => void;
  onUserChange: (value: string) => void;
  resultCount: number;
  users: string[];
}) {
  const presetLabel =
    AUDIT_DATE_PRESETS.find((preset) => preset.value === filters.preset)
      ?.label ?? "Range";
  const actionCount = filters.actions.length;

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
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
          />
          <input
            aria-label="Search audit details, user or action"
            className="h-8 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search details, user, action…"
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
            {AUDIT_DATE_PRESETS.map((preset) => (
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
                className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground"
                type="button"
              />
            }
          >
            {filters.user === "All" ? "User" : filters.user}
            <ChevronDown aria-hidden className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[280px] min-w-[190px]"
          >
            <ValueOption
              label="All users"
              onSelect={onUserChange}
              value="All"
            />
            {users.map((user) => (
              <ValueOption
                key={user}
                label={user}
                onSelect={onUserChange}
                value={user}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

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
            {actionCount === 0 ? "Action type" : `Action type (${actionCount})`}
            <ChevronDown aria-hidden className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[190px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter by action</DropdownMenuLabel>
              {AUDIT_ACTION_TYPES.map((action) => (
                <ActionOption
                  action={action}
                  checked={filters.actions.includes(action)}
                  key={action}
                  onToggleAction={onToggleAction}
                />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-caption text-muted-foreground">
          {resultCount} entries
        </span>
      </div>
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
