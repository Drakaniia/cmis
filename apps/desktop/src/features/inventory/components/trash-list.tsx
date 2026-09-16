import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { cn } from "@cmis/ui/lib/utils";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { describeTrashEntry, type TrashEntry } from "../creation/trash";

/**
 * Spec §7.6 — the Trash tab.
 *
 * Deleted products and batches land here with everything needed to restore them
 * or to delete them for good. Nothing is ever purged automatically (decision
 * 12), so the header states that plainly and carries the running count.
 */

const RELATIVE_UNITS: { divisor: number; one: string; many: string }[] = [
  { divisor: 86_400_000, many: "days", one: "day" },
  { divisor: 3_600_000, many: "hours", one: "hour" },
  { divisor: 60_000, many: "minutes", one: "minute" },
];

export function relativeTime(iso: string, now: number = Date.now()): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) {
    return iso;
  }
  const elapsed = now - at;
  if (elapsed < 60_000) {
    return "just now";
  }
  for (const unit of RELATIVE_UNITS) {
    const value = Math.floor(elapsed / unit.divisor);
    if (value >= 1) {
      return `${value} ${value === 1 ? unit.one : unit.many} ago`;
    }
  }
  return "just now";
}

function TypePill({ kind }: { kind: TrashEntry["kind"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[10px]",
        kind === "item"
          ? "border-[var(--chart-1)]/40 bg-[var(--chart-1)]/12 text-[var(--chart-1)]"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      {kind === "item" ? "Product" : "Batch"}
    </span>
  );
}

function TrashRowActions({
  entry,
  onPurge,
  onRestore,
}: {
  entry: TrashEntry;
  onPurge: (entry: TrashEntry) => void;
  onRestore: (entry: TrashEntry) => void;
}) {
  const handlePurge = useCallback(() => onPurge(entry), [entry, onPurge]);
  const handleRestore = useCallback(() => onRestore(entry), [entry, onRestore]);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        aria-label={`Restore ${entry.label}`}
        className="press-feedback"
        onClick={handleRestore}
        size="sm"
        variant="outline"
      >
        <ArchiveRestore aria-hidden className="size-3.5" />
        Restore
      </Button>
      <Button
        aria-label={`Delete ${entry.label} permanently`}
        className="press-feedback"
        onClick={handlePurge}
        size="sm"
        variant="ghost"
      >
        <Trash2 aria-hidden className="size-3.5 text-destructive" />
        Delete permanently
      </Button>
    </div>
  );
}

function TrashRow({
  entry,
  onPurge,
  onRestore,
  onToggle,
  selected,
}: {
  entry: TrashEntry;
  onPurge: (entry: TrashEntry) => void;
  onRestore: (entry: TrashEntry) => void;
  onToggle: (id: string) => void;
  selected: boolean;
}) {
  const handleToggle = useCallback(
    () => onToggle(entry.id),
    [entry.id, onToggle]
  );
  const name =
    entry.kind === "batch"
      ? `${entry.label.split(" · ")[0]} — batch`
      : entry.label;
  return (
    <tr className={cn("border-border/50 border-b", selected && "bg-accent/60")}>
      <td className="px-2 py-1.5 text-center">
        <Checkbox
          aria-label={`Select ${entry.label}`}
          checked={selected}
          onCheckedChange={handleToggle}
        />
      </td>
      <td className="px-2 py-1.5">
        <TypePill kind={entry.kind} />
      </td>
      <td className="max-w-0 truncate px-2 py-1.5 font-medium text-sm">
        {name}
      </td>
      <td className="max-w-0 truncate px-2 py-1.5 text-caption text-muted-foreground">
        {describeTrashEntry(entry)}
      </td>
      <td
        className="px-2 py-1.5 text-caption text-muted-foreground"
        title={new Date(entry.deletedAt).toLocaleString()}
      >
        {relativeTime(entry.deletedAt)}
      </td>
      <td className="px-2 py-1.5 text-caption text-muted-foreground">
        {entry.deletedBy}
      </td>
      <td className="px-2 py-1.5">
        <TrashRowActions
          entry={entry}
          onPurge={onPurge}
          onRestore={onRestore}
        />
      </td>
    </tr>
  );
}

export function TrashList({
  entries,
  loading = false,
  selectedIds,
  onPurge,
  onPurgeSelected,
  onRestore,
  onToggle,
  onToggleAll,
}: {
  entries: TrashEntry[];
  loading?: boolean;
  selectedIds: Set<string>;
  onPurge: (entry: TrashEntry) => void;
  onPurgeSelected: () => void;
  onRestore: (entry: TrashEntry) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected =
    entries.length > 0 && entries.every((entry) => selectedIds.has(entry.id));
  const handleToggleAll = useCallback(() => onToggleAll(), [onToggleAll]);

  if (!loading && entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-start gap-1 p-6 text-left">
        <p className="font-medium text-foreground text-sm">Trash is empty</p>
        <p className="text-caption text-muted-foreground">
          Deleted products and batches appear here and can be restored.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-border/50 border-b bg-card px-2 py-1.5">
        <span className="font-medium text-caption text-foreground">
          {entries.length} {entries.length === 1 ? "item" : "items"}
        </span>
        <span className="text-caption text-muted-foreground">
          Nothing is deleted automatically. Items stay here until you
          permanently delete them.
        </span>
        {selectedIds.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-caption text-foreground">
              {selectedIds.size} selected
            </span>
            <Button
              className="press-feedback"
              onClick={onPurgeSelected}
              size="sm"
              variant="destructive"
            >
              Delete permanently
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-muted/60 font-medium text-caption">
            <tr className="border-border/50 border-b">
              <th className="w-8 px-2 py-1 text-center">
                <Checkbox
                  aria-label="Select all trashed items"
                  checked={allSelected}
                  onCheckedChange={handleToggleAll}
                />
              </th>
              <th className="w-20 px-2 py-1">Type</th>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Detail</th>
              <th className="w-24 px-2 py-1">Deleted</th>
              <th className="w-20 px-2 py-1">By</th>
              <th className="w-64 px-2 py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? null
              : entries.map((entry) => (
                  <TrashRow
                    entry={entry}
                    key={entry.id}
                    onPurge={onPurge}
                    onRestore={onRestore}
                    onToggle={onToggle}
                    selected={selectedIds.has(entry.id)}
                  />
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
