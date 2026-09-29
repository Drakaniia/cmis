import { cn } from "@cmis/ui/lib/utils";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
} from "react";

import { densitySpring } from "@/lib/motion";

/**
 * Shared chrome for the alert pages' filter bars (CMIS-UI-03 §3.1,
 * CMIS-UI-04 §3.3).
 *
 * Both bars are the same control in the same place, so they are one
 * implementation: a toolbar material that rows scroll beneath (§12), a search
 * field, a segmented control, removable chips, and a bulk action that arrives
 * as a spring rather than teleporting (§4, §7).
 */

/**
 * The toolbar layer, in the chrome the app's other filter bars already use
 * (§16 — the same control looks and behaves the same wherever it appears: this
 * matches Stock Management's and the audit log's bars exactly).
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 shrink-0 border-border/50 border-b bg-card/95 backdrop-blur-[6px]">
      {children}
    </div>
  );
}

/** Search row. The clear affordance arrives and leaves on a spring so the
 * input's trailing edge never jumps (§4). */
export function FilterSearchField({
  density,
  label,
  onChange,
  placeholder,
  value,
}: {
  density: "compact" | "comfortable";
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const handleInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && value) {
        onChange("");
      }
    },
    [onChange, value]
  );

  const handleClear = useCallback(() => onChange(""), [onChange]);

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="relative flex flex-1 items-center">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
        />
        <input
          aria-label={label}
          className={cn(
            "w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
            density === "compact" ? "h-8" : "h-9"
          )}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={value}
        />
        <AnimatePresence initial={false}>
          {value ? (
            <motion.button
              animate={{ opacity: 1, scale: 1 }}
              aria-label="Clear search"
              className="absolute right-2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
              exit={{ opacity: 0, scale: 0.8 }}
              initial={{ opacity: 0, scale: 0.8 }}
              key="clear-search"
              onClick={handleClear}
              transition={densitySpring}
              type="button"
            >
              <X className="size-3.5" />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** The controls row: segmented controls, dropdowns, chips, bulk action. Wraps
 * instead of scrolling, so no filter is ever hidden off-screen (§16). */
export function FilterControlsRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  layoutId,
  legend,
  onChange,
  options,
  value,
}: {
  layoutId: string;
  legend: string;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <fieldset className="m-0 inline-flex min-w-0 shrink-0 items-center rounded-full border border-input bg-muted p-0.5">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <SegmentedOption
          active={option.value === value}
          key={option.value}
          label={option.label}
          layoutId={layoutId}
          onSelect={onChange}
          value={option.value}
        />
      ))}
    </fieldset>
  );
}

/**
 * Segmented pill. The selection pill morphs between options (§7 — the
 * relationship between choice and state stays continuous), and the press gets
 * its own feedback because the global button rule skips `aria-pressed`
 * controls, which would otherwise respond only on release (§1).
 */
function SegmentedOption<T extends string>({
  active,
  label,
  layoutId,
  onSelect,
  value,
}: {
  active: boolean;
  label: string;
  layoutId: string;
  onSelect: (value: T) => void;
  value: T;
}) {
  const handleSelect = useCallback(() => onSelect(value), [onSelect, value]);

  return (
    <button
      aria-pressed={active}
      className={cn(
        "relative z-10 rounded-full px-2.5 py-1 font-medium text-xs transition-[color,transform] duration-100 ease-out active:scale-[0.97]",
        active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={handleSelect}
      type="button"
    >
      {active ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-primary shadow-sm"
          layoutId={layoutId}
          transition={densitySpring}
        />
      ) : null}
      <span className="relative">{label}</span>
    </button>
  );
}

/**
 * Active filter chips. Removing one reflows its neighbours on a spring rather
 * than snapping them left, so the row reads as one surface making room (§4).
 */
export function ActiveFilterChips({
  chips,
  onClearAll,
  onRemove,
}: {
  chips: { key: string; label: string; value: string }[];
  onClearAll: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <>
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <FilterChip
            chipKey={chip.key}
            key={`${chip.key}-${chip.value}`}
            label={chip.label}
            onRemove={onRemove}
          />
        ))}
      </AnimatePresence>
      {chips.length > 0 ? (
        <button
          className="shrink-0 whitespace-nowrap text-caption text-primary hover:underline"
          onClick={onClearAll}
          type="button"
        >
          Clear all
        </button>
      ) : null}
    </>
  );
}

function FilterChip({
  chipKey,
  label,
  onRemove,
}: {
  chipKey: string;
  label: string;
  onRemove: (key: string) => void;
}) {
  const handleRemove = useCallback(
    () => onRemove(chipKey),
    [chipKey, onRemove]
  );

  return (
    <motion.span
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs"
      exit={{ opacity: 0, scale: 0.9 }}
      initial={{ opacity: 0, scale: 0.9 }}
      layout
      transition={densitySpring}
    >
      {label}
      <button
        aria-label={`Remove ${label}`}
        className="rounded-full p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10"
        onClick={handleRemove}
        type="button"
      >
        <X className="size-3" />
      </button>
    </motion.span>
  );
}

/** The right-aligned bulk action for a selection. It springs in from the right
 * edge instead of shoving the row sideways (§7 — spatial consistency). */
export function FilterBulkAction({
  children,
  open,
}: {
  children: ReactNode;
  open: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, x: 0 }}
          className="ml-auto shrink-0"
          exit={{ opacity: 0, scale: 0.94 }}
          initial={{ opacity: 0, scale: 0.94, x: 8 }}
          key="bulk-action"
          transition={densitySpring}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
