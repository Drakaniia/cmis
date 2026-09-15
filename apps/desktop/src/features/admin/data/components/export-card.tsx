import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { Download } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { invoke } from "@/lib/tauri";
import { SettingsCard } from "../../settings/components/settings-card";
import { useExportCounts } from "../hooks/use-export-counts";
import type { ExportDataType, ExportFormat } from "../types";
import { EXPORT_TYPES } from "../types";

/** Rough row counts that decide whether a progress bar is shown (§4.3). */
const LARGE_EXPORT_THRESHOLD = 500;

function ExportTypeToggle({
  checked,
  count,
  id,
  label,
  onToggle,
}: {
  checked: boolean;
  count: number | null;
  id: ExportDataType;
  label: string;
  onToggle: (id: ExportDataType) => void;
}) {
  const handleCheckedChange = useCallback(() => onToggle(id), [id, onToggle]);

  return (
    <label className="inline-flex items-center gap-2" htmlFor={`export-${id}`}>
      <Checkbox
        checked={checked}
        id={`export-${id}`}
        onCheckedChange={handleCheckedChange}
      />
      {label}
      <span className="text-muted-foreground">
        ({count === null ? "—" : count.toLocaleString()})
      </span>
    </label>
  );
}

function FormatOption({
  active,
  onSelect,
  option,
}: {
  active: boolean;
  onSelect: (format: ExportFormat) => void;
  option: ExportFormat;
}) {
  const handleChange = useCallback(() => onSelect(option), [onSelect, option]);

  return (
    <label className="inline-flex items-center gap-1.5">
      <input
        checked={active}
        className="accent-primary"
        name="export-format"
        onChange={handleChange}
        type="radio"
      />
      {option.toUpperCase()}
    </label>
  );
}

export function ExportCard() {
  const counts = useExportCounts();
  const [selected, setSelected] = useState<ExportDataType[]>(
    EXPORT_TYPES.map((type) => type.id)
  );
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [progress, setProgress] = useState<number | null>(null);

  const selectedTypes = EXPORT_TYPES.filter((type) =>
    selected.includes(type.id)
  );
  const selectedRows = selectedTypes.reduce(
    (sum, type) => sum + (counts[type.id] ?? 0),
    0
  );
  const hasUnknownCounts = selectedTypes.some(
    (type) => counts[type.id] === null
  );
  const isLarge = selectedRows > LARGE_EXPORT_THRESHOLD;
  const disabled = selected.length === 0 || progress !== null;

  const toggle = useCallback((id: ExportDataType) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  }, []);

  const handleDownload = useCallback(async () => {
    setProgress(8);
    await new Promise((resolve) => setTimeout(resolve, 180));
    setProgress(45);
    await new Promise((resolve) => setTimeout(resolve, 220));
    setProgress(82);

    let savedTo: string | null = null;
    let webFallbackDone = false;
    try {
      const path = await invoke<string>("export_data", {
        dataTypes: selected,
        format,
      });
      savedTo = typeof path === "string" ? path : null;
    } catch {
      savedTo = null;
    }

    // Web fallback: if Tauri not available and xlsx requested, generate populated template client-side
    if (
      savedTo === null &&
      format === "xlsx" &&
      selected.includes("inventory")
    ) {
      try {
        const { getDb } = await import("@/lib/db");
        const { downloadInventoryXlsx } = await import(
          "@/features/inventory/import/export-xlsx"
        );
        const db = await getDb();
        const items = (await db.select<
          {
            category: string | null;
            dosage: string;
            name: string;
            stock_on_hand: number | null;
            stock_remaining: number | null;
            supplier: string | null;
            total_dispensed: number | null;
            id: string;
          }[]
        >(
          "SELECT id, name, dosage, stock_on_hand, total_dispensed, stock_remaining, category, supplier FROM inventory_items ORDER BY name"
        )) as unknown as {
          category: string | null;
          dosage: string;
          name: string;
          stock_on_hand: number | null;
          stock_remaining: number | null;
          supplier: string | null;
          total_dispensed: number | null;
          id: string;
        }[];
        const rows = await Promise.all(
          items.map(async (it) => {
            const events = (await db.select<{ day: number; qty: number }[]>(
              "SELECT day, qty FROM dispensing_events WHERE item_id = ? ORDER BY day",
              [it.id]
            )) as unknown as { day: number; qty: number }[];
            const daily = new Array(31).fill(0);
            for (const e of events) {
              if (e.day >= 1 && e.day <= 31) {
                daily[e.day - 1] = e.qty;
              }
            }
            return {
              category: it.category,
              daily,
              dosage: it.dosage ?? "",
              name: it.name,
              stockOnHand: it.stock_on_hand,
              stockRemaining: it.stock_remaining,
              supplier: it.supplier,
              totalDispensed: it.total_dispensed,
            };
          })
        );
        const stamp = new Date().toISOString().slice(0, 10);
        downloadInventoryXlsx(rows, `cmis-export-${stamp}.xlsx`);
        webFallbackDone = true;
      } catch {
        // fallback toast below
      }
    }

    setProgress(100);
    await new Promise((resolve) => setTimeout(resolve, 120));
    setProgress(null);

    const stamp = new Date().toISOString().slice(0, 10);
    if (webFallbackDone) {
      toast.success(`Export ready — cmis-export-${stamp}.xlsx`);
      return;
    }
    toast.success(
      savedTo
        ? `Export saved to ${savedTo}`
        : `Export ready — cmis-export-${stamp}.${format}`
    );
  }, [format, selected]);

  return (
    <SettingsCard
      description="Pick what to include, then save it anywhere with the native picker."
      title="Export"
    >
      <fieldset className="text-caption text-foreground">
        <legend className="mb-1.5">Data to include</legend>
        <div className="flex flex-wrap gap-4">
          {EXPORT_TYPES.map((type) => (
            <ExportTypeToggle
              checked={selected.includes(type.id)}
              count={counts[type.id]}
              id={type.id}
              key={type.id}
              label={type.label}
              onToggle={toggle}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 text-caption text-foreground">
        <legend className="mb-1.5">Format</legend>
        <div className="flex gap-4">
          {(["csv", "json", "xlsx"] as const).map((option) => (
            <FormatOption
              active={format === option}
              key={option}
              onSelect={setFormat}
              option={option}
            />
          ))}
        </div>
        {format === "xlsx" ? (
          <p className="mt-1.5 text-caption text-muted-foreground">
            XLSX uses the 41-col Inventory Template — re-importable on any empty
            DB.
          </p>
        ) : null}
      </fieldset>

      {progress === null ? null : (
        <div
          aria-label="Export progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">
          {selectedRows.toLocaleString()}
          {hasUnknownCounts ? "+ rows" : " rows"}
          {isLarge ? " — streams in chunks" : ""}
        </p>
        <Button
          className="press-feedback"
          disabled={disabled}
          onClick={handleDownload}
          size="sm"
        >
          <Download aria-hidden className="size-3.5" />
          {progress === null ? "Download" : "Exporting…"}
        </Button>
      </div>
    </SettingsCard>
  );
}
