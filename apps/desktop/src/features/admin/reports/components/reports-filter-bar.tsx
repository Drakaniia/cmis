import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Download, FileDown, Upload } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, useCallback, useRef } from "react";

import { densitySpring } from "@/lib/motion";
import type { ReportsPreset } from "../types";

const PRESETS: { label: string; value: ReportsPreset }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "1Y", value: "1y" },
];

const CATEGORIES = [
  "All",
  "Analgesic",
  "Antibiotic",
  "Antiseptic",
  "Supplement",
  "Respiratory",
  "Gastro",
  "First Aid",
] as const;

/**
 * §4 — Segmented pill selector with spring layout animation.
 * Active pill uses layoutId spring for fluid sliding indicator (Apple §3).
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
          layoutId="reports-date-pill"
          transition={reduceMotion ? { duration: 0 } : densitySpring}
        />
      ) : null}
      <span className="relative">{label}</span>
    </button>
  );
}

/**
 * CMIS-UI-07 §2 + Apple §12 — sticky, translucent filter bar.
 *
 * Apple Design:
 * §12 — Heavy translucent material: backdrop-blur 16px, saturate 180%.
 *        Content scrolls *under* it. Material weight = structural (heavy).
 * §8  — Button hierarchy: Import/Export CSV are outline (secondary),
 *        Export PDF is ghost (tertiary). Import has Upload icon for clarity.
 * §1  — All buttons have instant press feedback (scale 0.97).
 * §4  — Pill selector uses spring layout animation for fluid selection.
 * §14 — Reduced motion: no spring layout, instant pill swap.
 * §15 — Filter labels use small tracking for legibility.
 */
export function ReportsFilterBar({
  category,
  hasData,
  onCategoryChange,
  onExportCsv,
  onExportPdf,
  onPresetChange,
  preset,
}: {
  category: string;
  hasData: boolean;
  onCategoryChange: (c: string) => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onPresetChange: (p: ReportsPreset) => void;
  preset: ReportsPreset;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCategoryChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      onCategoryChange(event.target.value),
    [onCategoryChange]
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      // Reset so the same file can be re-selected
      event.target.value = "";
      // Import logic would go here — for now, show a toast placeholder
      import("sonner").then(({ toast }) => {
        toast.success(`Imported: ${file.name}`, {
          description: `${(file.size / 1024).toFixed(1)} KB`,
        });
      });
    },
    []
  );

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
        {/* §4 Date presets — spring pill selector */}
        <fieldset aria-label="Date range" className="flex items-center gap-1.5">
          <span className="mr-1 hidden font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em] sm:inline">
            Range
          </span>
          {PRESETS.map((p) => (
            <PresetButton
              active={preset === p.value}
              key={p.value}
              label={p.label}
              onSelect={onPresetChange}
              value={p.value}
            />
          ))}
        </fieldset>

        <div aria-hidden className="hidden h-5 w-px bg-border/60 sm:block" />

        {/* Category */}
        <div className="flex items-center gap-1.5">
          <span className="hidden font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em] sm:inline">
            Category
          </span>
          <div className="relative">
            <select
              aria-label="Filter by category"
              className="h-7 rounded-md border border-input bg-background px-2 pr-7 font-medium text-xs shadow-sm focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
              onChange={handleCategoryChange}
              value={category}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* §8 Action buttons — Import (outline, secondary), Export CSV (outline, secondary),
         * Export PDF (ghost, tertiary). Hierarchy through visual weight. */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Hidden file input for import */}
          <input
            accept=".csv,.xlsx,.xls"
            aria-hidden="true"
            className="hidden"
            onChange={handleImportFile}
            ref={fileInputRef}
            tabIndex={-1}
            type="file"
          />
          <Button
            className="press-feedback"
            onClick={handleImportClick}
            size="sm"
            variant="outline"
          >
            <Upload aria-hidden className="size-3.5" />
            Import
          </Button>
          <Button
            className="press-feedback"
            disabled={!hasData}
            onClick={onExportCsv}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden className="size-3.5" />
            Export CSV
          </Button>
          <Button
            className="press-feedback"
            disabled={!hasData}
            onClick={onExportPdf}
            size="sm"
            variant="ghost"
          >
            <FileDown aria-hidden className="size-3.5" />
            Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
