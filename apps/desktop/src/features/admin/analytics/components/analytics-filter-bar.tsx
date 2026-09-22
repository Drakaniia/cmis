import { cn } from "@cmis/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { useCallback } from "react";

import { CategoryPicker } from "@/features/inventory/components/category-picker";
import { densitySpring } from "@/lib/motion";
import type { ReportsPreset } from "../types";

const PRESETS: { label: string; value: ReportsPreset }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "1Y", value: "1y" },
];

/**
 * §4 — Segmented pill selector with spring layout animation.
 * §1 — Press feedback on every pill (scale 0.97 on pointerdown).
 * §14 — Reduced motion: no spring layout, instant swap.
 */
function PresetButton({
  active,
  label,
  onSelect,
  value,
}: {
  active: boolean;
  label: string;
  onSelect: (preset: ReportsPreset) => void;
  value: ReportsPreset;
}) {
  const reduceMotion = useReducedMotion();
  const handleClick = useCallback(() => onSelect(value), [onSelect, value]);

  return (
    <button
      aria-pressed={active}
      className={cn(
        "press-feedback relative z-10 rounded-full border px-3 py-1 font-medium text-xs transition-colors",
        active
          ? "border-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      onClick={handleClick}
      type="button"
    >
      {active ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-primary shadow-sm"
          layoutId="analytics-date-pill"
          transition={reduceMotion ? { duration: 0 } : densitySpring}
        />
      ) : null}
      <span className="relative">{label}</span>
    </button>
  );
}

/**
 * Analytics' sticky, translucent filter bar: the date presets and the category
 * picker. The Import / Export CSV / Export PDF controls that used to sit here
 * are deleted (D25 — the stock report is the page that produces a document).
 */
export function AnalyticsFilterBar({
  category,
  onCategoryChange,
  onPresetChange,
  preset,
}: {
  category: string;
  onCategoryChange: (category: string) => void;
  onPresetChange: (preset: ReportsPreset) => void;
  preset: ReportsPreset;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10",
        /* §12 Heavy translucent material — structural layer */
        "border-border/50 border-b",
        "bg-background/60 backdrop-blur-[16px] backdrop-saturate-[180%]",
        "supports-[backdrop-filter]:bg-background/50"
      )}
      style={
        {
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
        } as React.CSSProperties
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <fieldset aria-label="Date range" className="flex items-center gap-1.5">
          <span className="mr-1 hidden font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em] sm:inline">
            Range
          </span>
          {PRESETS.map((presetOption) => (
            <PresetButton
              active={preset === presetOption.value}
              key={presetOption.value}
              label={presetOption.label}
              onSelect={onPresetChange}
              value={presetOption.value}
            />
          ))}
        </fieldset>

        <div aria-hidden className="hidden h-5 w-px bg-border/60 sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="hidden font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em] sm:inline">
            Category
          </span>
          <CategoryPicker
            allLabel="All categories"
            aria-label="Filter by category"
            onChange={onCategoryChange}
            placeholder="Category"
            value={category}
            variant="filter"
          />
        </div>
      </div>
    </div>
  );
}
