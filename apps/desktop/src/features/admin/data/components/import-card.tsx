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

import { dragSpring } from "@/lib/motion";
import { ConfirmModal } from "../../components/confirm-modal";
import { SettingsCard } from "../../settings/components/settings-card";
import { parseImportDiff } from "../import-diff";
import type { ImportDiff } from "../types";

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
    const content = await file.text();
    setDiff(parseImportDiff(file.name, content));
  }, []);

  const queueRead = useCallback(
    (file: File) => {
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
    setProgress(12);
    await new Promise((resolve) => setTimeout(resolve, 220));
    setProgress(58);
    await new Promise((resolve) => setTimeout(resolve, 240));
    setProgress(100);
    await new Promise((resolve) => setTimeout(resolve, 140));
    setProgress(null);
    if (diff) {
      toast.success("Data imported", {
        description: `${diff.fileName} · audited at ${new Date().toLocaleTimeString("en-US")}`,
      });
    }
    setDiff(null);
  }, [diff]);

  const handleDiscard = useCallback(() => setDiff(null), []);
  const handleRequestConfirm = useCallback(() => setConfirmOpen(true), []);

  const totalChanges = diff
    ? diff.counts.inserts + diff.counts.updates + diff.counts.deletes
    : 0;

  return (
    <SettingsCard
      description="Accepts .csv, .json and .db backups. Nothing commits until you confirm."
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
          accept=".csv,.json,.db"
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
              {diff.kind}
            </span>
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
