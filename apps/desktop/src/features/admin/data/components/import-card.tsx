import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { AlertTriangle, FileUp, Upload } from "lucide-react";
import { motion } from "motion/react";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  deriveImportMonth,
  describeImportMonth,
} from "@/features/inventory/import/import-month";
import type { ParseResult } from "@/features/inventory/import/types";
import { dragSpring } from "@/lib/motion";
import { ConfirmModal } from "../../components/confirm-modal";
import { SettingsCard } from "../../settings/components/settings-card";
import { parseImportDiff } from "../import-diff";
import type { ImportDiff } from "../types";

/** Sonner dedupes on this id, so one import leaves exactly one toast. */
const IMPORT_TOAST_ID = "data-import";

const LINE_BREAK = /\r?\n/;

declare global {
  interface Window {
    /**
     * CSV text staged by the preview step and committed by confirm.
     * `undefined` whenever nothing is staged, so a stale read cannot import.
     */
    __inventoryImportCsv: string | undefined;
  }
}

/**
 * The preview for a file the importer can write.
 *
 * The month is read from the file name here, at preview time, so the operator
 * sees which dispensing month the grid is about to land in *before* confirming
 * a destructive write — the workbook itself never states it.
 */
/** The key `importInventoryCsv` dedupes on — `name|dosage`, both normalised. */
function matchKey(name: string, dosage: string): string {
  return `${name.toLowerCase().trim()}|${dosage.toLowerCase().trim()}`;
}

/**
 * `name|dosage` keys already in the database, so the preview can tell an update
 * from an insert before a destructive confirm. A preview that reports "85
 * inserts" over 85 matching rows is worse than no preview.
 */
async function loadExistingKeys(): Promise<ReadonlySet<string>> {
  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    const rows = await db.select<{ dosage: string; name: string }[]>(
      "SELECT name, dosage FROM inventory_items"
    );
    return new Set(rows.map((row) => matchKey(row.name, row.dosage)));
  } catch {
    // No database behind this window (web preview): every row is an insert.
    return new Set();
  }
}

function inventoryDiff(
  fileName: string,
  parsed: ParseResult,
  existingKeys: ReadonlySet<string>
): ImportDiff {
  const derived = deriveImportMonth(fileName);
  const warnings = parsed.warnings
    .slice(0, 5)
    .map(
      (w) =>
        `Row ${w.row} ${w.column}: ${w.raw} → ${String(w.coerced)} (${w.reason})`
    );
  if (derived.fallback) {
    warnings.unshift(
      `No month in the file name — grid days will be recorded under ${derived.month}.`
    );
  }
  const changeOf = (row: { dosage: string; name: string }) =>
    existingKeys.has(matchKey(row.name, row.dosage))
      ? ("update" as const)
      : ("insert" as const);
  const updates = parsed.rows.filter(
    (row) => changeOf(row) === "update"
  ).length;

  return {
    counts: {
      deletes: 0,
      inserts: parsed.rows.length - updates,
      updates,
    },
    fileName,
    inventory: {
      month: derived.month,
      monthNote: describeImportMonth(derived),
    },
    kind: "csv",
    sample: parsed.rows.slice(0, 3).map((r) => ({
      change: changeOf(r),
      id: r.name,
      label: `${r.name} ${r.dosage}`.trim(),
    })),
    warnings,
  };
}

/**
 * Reads file bytes in engines without File.arrayBuffer (jsdom, older WebViews).
 */
function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      resolve(reader.result as ArrayBuffer)
    );
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Could not read the selected file."))
    );
    reader.readAsArrayBuffer(file);
  });
}

/** Same fallback for text: `File.text()` is not universal either. */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Could not read the selected file."))
    );
    reader.readAsText(file);
  });
}

/** A preview that carries its failure, so the card never stays silent. */
function previewFailure(fileName: string, cause: unknown): ImportDiff {
  return {
    counts: { deletes: 0, inserts: 0, updates: 0 },
    fileName,
    kind: "csv",
    sample: [],
    warnings: [
      cause instanceof Error
        ? cause.message
        : "Could not read the selected file.",
    ],
  };
}

/**
 * CMIS-UI-09 §4.3 — import is a destructive zone.
 *
 * The diff is a dry run: nothing commits until the Admin types IMPORT. Motion
 * here stays critically damped (no bounce) — bounce implies momentum, and this
 * is a deliberate, high-stakes action (§4.4 Utility).
 */
export function ImportCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const readFile = useCallback(async (file: File) => {
    // Nothing is staged until a file reads cleanly, and a file that cannot be
    // read reports itself in the preview instead of failing silently.
    window.__inventoryImportCsv = undefined;
    try {
      // Excel workbooks: convert to CSV text once, then preview and stage the
      // exact text the confirm step commits — no re-serialization drift.
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const { inventoryXlsxToCsv } = await import(
          "@/features/inventory/import/xlsx-parser"
        );
        const { parseInventoryCsv } = await import(
          "@/features/inventory/import/csv-parser"
        );
        const csv = inventoryXlsxToCsv(await readFileBytes(file));
        setDiff(
          inventoryDiff(
            file.name,
            parseInventoryCsv(csv),
            await loadExistingKeys()
          )
        );
        window.__inventoryImportCsv = csv;
        return;
      }

      const content = await readFileText(file);
      // Inventory CSV (first cell NAME OF MEDICATION) takes the same path as a
      // workbook; anything else is preview-only.
      const { parseInventoryCsv } = await import(
        "@/features/inventory/import/csv-parser"
      );
      const firstLine = content.split(LINE_BREAK)[0] ?? "";
      if (firstLine.toUpperCase().includes("NAME OF MEDICATION")) {
        setDiff(
          inventoryDiff(
            file.name,
            parseInventoryCsv(content),
            await loadExistingKeys()
          )
        );
        window.__inventoryImportCsv = content;
        return;
      }
      setDiff(parseImportDiff(file.name, content));
    } catch (err) {
      setDiff(previewFailure(file.name, err));
    }
  }, []);

  const queueRead = useCallback(
    (file: File) => {
      // readFile reports its own failures in the preview.
      readFile(file).then(
        () => undefined,
        () => undefined
      );
    },
    [readFile]
  );

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        queueRead(file);
      }
    },
    [queueRead]
  );

  const handleBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        queueRead(file);
      }
      event.target.value = "";
    },
    [queueRead]
  );

  const handleConfirm = useCallback(async () => {
    setConfirmOpen(false);
    const staged = diff?.inventory;
    const inventoryCsv = window.__inventoryImportCsv;
    if (staged && inventoryCsv) {
      setProgress(12);
      try {
        const { getDb } = await import("@/lib/db");
        const { importInventoryCsv } = await import(
          "@/features/inventory/import/import"
        );
        const db = await getDb();
        const result = await importInventoryCsv(
          inventoryCsv,
          db as Parameters<typeof importInventoryCsv>[1],
          {
            month: staged.month,
          }
        );
        setProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 140));
        setProgress(null);
        // One steady id per import: re-importing replaces the toast instead of
        // stacking a column of them.
        toast.success(
          `Imported ${result.imported} medications into ${staged.month} — ${result.inserted} new, ${result.updated} updated`,
          {
            description: `${diff.fileName} · ${result.dosageMissingCount} need dosage, ${result.mismatchCount} mismatches, ${result.warnings.length} warnings`,
            id: IMPORT_TOAST_ID,
          }
        );
        if (result.dosageMissingCount > 0) {
          toast.warning(
            `${result.dosageMissingCount} items need dosage — review in inventory filters`
          );
        }
        window.__inventoryImportCsv = undefined;
        setDiff(null);
        return;
      } catch (err) {
        setProgress(null);
        // `importInventoryCsv` restores its snapshot before throwing, so the
        // description carries the real failure — not a rollback error.
        toast.error("Import failed", {
          description: err instanceof Error ? err.message : String(err),
          id: IMPORT_TOAST_ID,
        });
        return;
      }
    }
    // Everything else is a preview: `parseImportDiff` reads the file but no
    // importer exists for .json/.db, so claiming success would be a lie.
    toast.warning("Nothing imported", {
      description: `${diff?.fileName ?? "This file"} is not an inventory workbook — no rows were written. Import an inventory .xlsx or .csv.`,
      id: IMPORT_TOAST_ID,
    });
    setDiff(null);
  }, [diff]);

  const handleDiscard = useCallback(() => setDiff(null), []);
  const handleRequestConfirm = useCallback(() => setConfirmOpen(true), []);

  const totalChanges = diff
    ? diff.counts.inserts + diff.counts.updates + diff.counts.deletes
    : 0;

  return (
    <SettingsCard
      description="Imports inventory .xlsx and .csv into the database. .json and .db files are previewed only. Nothing commits until you confirm."
      title="Import"
    >
      <motion.div
        animate={{ scale: dragOver ? 1.01 : 1 }}
        className={cn(
          "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"
        )}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        transition={dragSpring}
      >
        <FileUp aria-hidden className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-foreground text-sm">
          Drag a file here to preview the change
        </p>
        <p className="text-caption text-muted-foreground">
          The preview never writes to the database.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            .csv
          </span>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium font-mono text-[10px] text-primary">
            .xlsx
          </span>
          <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            .json
          </span>
          <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            .db
          </span>
        </div>
        <Button
          className="press-feedback mt-3"
          onClick={handleBrowse}
          size="sm"
          variant="outline"
        >
          <Upload aria-hidden className="size-3.5" />
          Browse files
        </Button>
        <input
          accept=".csv,.json,.db,.xlsx"
          className="hidden"
          onChange={handleFileChange}
          ref={inputRef}
          type="file"
        />
      </motion.div>

      {diff ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-card p-3">
            <span className="font-medium text-foreground text-sm">
              {diff.fileName}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-caption uppercase">
              {diff.inventory ? "Inventory CSV" : diff.kind}
            </span>
            {diff.inventory ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-caption text-primary">
                Dispensing month {diff.inventory.month} ·{" "}
                {diff.inventory.monthNote}
              </span>
            ) : null}
            <span className="ml-auto flex gap-3 text-caption">
              <span className="text-[var(--success)]">
                +{diff.counts.inserts} inserts
              </span>
              <span className="text-[var(--warning)]">
                ~{diff.counts.updates} updates
              </span>
              <span className="text-destructive">
                −{diff.counts.deletes} deletes
              </span>
            </span>
          </div>

          {diff.warnings.map((warning) => (
            <p
              className="flex items-start gap-2 rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2 text-caption text-foreground"
              key={warning}
            >
              <AlertTriangle
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]"
              />
              {warning}
            </p>
          ))}

          {diff.sample.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border/60">
              <div className="grid grid-cols-[0.7fr_1fr_1.4fr] items-center gap-2 border-border/50 border-b bg-muted/60 px-3 py-1.5 font-medium text-caption text-muted-foreground">
                <span>Change</span>
                <span>ID</span>
                <span>Record</span>
              </div>
              {diff.sample.map((row) => (
                <div
                  className="grid grid-cols-[0.7fr_1fr_1.4fr] items-center gap-2 border-border/50 border-b px-3 py-1.5 text-caption last:border-b-0"
                  key={`${row.change}-${row.id}`}
                >
                  <span className="capitalize">{row.change}</span>
                  <span className="truncate font-mono">{row.id}</span>
                  <span className="truncate text-muted-foreground">
                    {row.label}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {progress === null ? null : (
            <div
              aria-label="Import progress"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progress}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-caption text-muted-foreground">
              {totalChanges} changes staged
            </p>
            <div className="flex gap-2">
              <Button
                className="press-feedback"
                onClick={handleDiscard}
                size="sm"
                variant="ghost"
              >
                Discard
              </Button>
              <Button
                className="press-feedback"
                disabled={progress !== null}
                onClick={handleRequestConfirm}
                size="sm"
                variant="destructive"
              >
                Confirm import
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        confirmLabel="Import and overwrite"
        description={`This overwrites the current data with "${diff?.fileName ?? ""}". The original database is backed up first.`}
        destructive
        onConfirm={handleConfirm}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Overwrite current data?"
        typeToConfirm="IMPORT"
      />
    </SettingsCard>
  );
}
