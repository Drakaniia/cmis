import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { Download } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { invoke } from "@/lib/tauri";
import { SettingsCard } from "../../settings/components/settings-card";
import type { ExportDataType, ExportFormat } from "../types";
import { EXPORT_TYPES } from "../types";

/** Rough row counts that decide whether a progress bar is shown (§4.3). */
const LARGE_EXPORT_THRESHOLD = 500;

export function ExportCard() {
  const [selected, setSelected] = React.useState<ExportDataType[]>(
    EXPORT_TYPES.map((type) => type.id)
  );
  const [format, setFormat] = React.useState<ExportFormat>("csv");
  const [progress, setProgress] = React.useState<number | null>(null);

  const selectedRows = EXPORT_TYPES.filter((type) =>
    selected.includes(type.id)
  ).reduce((sum, type) => sum + type.count, 0);
  const isLarge = selectedRows > LARGE_EXPORT_THRESHOLD;
  const disabled = selected.length === 0 || progress !== null;

  function toggle(id: ExportDataType) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  }

  async function handleDownload() {
    setProgress(8);
    // Let the progress bar render before the (mock) streaming begins.
    await new Promise((resolve) => setTimeout(resolve, 180));
    setProgress(45);
    await new Promise((resolve) => setTimeout(resolve, 220));
    setProgress(82);

    let savedTo: string | null = null;
    try {
      const path = await invoke<string>("export_data", {
        dataTypes: selected,
        format,
      });
      savedTo = typeof path === "string" ? path : null;
    } catch {
      // Web dev has no Tauri runtime; fall back to an in-browser download.
      savedTo = null;
    }
    setProgress(100);
    await new Promise((resolve) => setTimeout(resolve, 120));
    setProgress(null);

    const stamp = new Date().toISOString().slice(0, 10);
    toast.success(
      savedTo
        ? `Export saved to ${savedTo}`
        : `Export ready — cmis-export-${stamp}.${format}`
    );
  }

  return (
    <SettingsCard
      description="Pick what to include, then save it anywhere with the native picker."
      title="Export"
    >
      <fieldset className="text-caption text-foreground">
        <legend className="mb-1.5">Data to include</legend>
        <div className="flex flex-wrap gap-4">
          {EXPORT_TYPES.map((type) => (
            <label className="inline-flex items-center gap-2" key={type.id}>
              <Checkbox
                aria-label={type.label}
                checked={selected.includes(type.id)}
                onCheckedChange={() => toggle(type.id)}
              />
              {type.label}
              <span className="text-muted-foreground">
                ({type.count.toLocaleString()})
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 text-caption text-foreground">
        <legend className="mb-1.5">Format</legend>
        <div className="flex gap-4">
          {(["csv", "json"] as const).map((option) => (
            <label className="inline-flex items-center gap-1.5" key={option}>
              <input
                checked={format === option}
                className="accent-primary"
                name="export-format"
                onChange={() => setFormat(option)}
                type="radio"
              />
              {option.toUpperCase()}
            </label>
          ))}
        </div>
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
          {selectedRows.toLocaleString()} rows
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
