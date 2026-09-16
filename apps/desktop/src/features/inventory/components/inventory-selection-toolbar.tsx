import { Button } from "@cmis/ui/components/button";
import { Trash2 } from "lucide-react";
import { useCallback } from "react";

/**
 * Spec §7.7 — the selection toolbar.
 *
 * It states the scope rule the selection actually follows: selecting covers the
 * filtered page only, and changing a filter clears it, so nothing invisible can
 * be deleted by accident.
 */
export function InventorySelectionToolbar({
  count,
  onClear,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onDelete: () => void;
}) {
  const handleClear = useCallback(() => onClear(), [onClear]);
  const handleDelete = useCallback(() => onDelete(), [onDelete]);

  if (count === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="flex shrink-0 items-center gap-2 border-border/50 border-b bg-accent/40 px-2 py-1.5"
    >
      <span className="font-medium text-caption text-foreground">
        {count} selected
      </span>
      <span className="truncate text-caption text-muted-foreground">
        Visible rows only · changing a filter clears the selection
      </span>
      <Button
        className="press-feedback ml-auto"
        onClick={handleClear}
        size="sm"
        variant="ghost"
      >
        Clear
      </Button>
      <Button
        className="press-feedback"
        onClick={handleDelete}
        size="sm"
        variant="destructive"
      >
        <Trash2 aria-hidden className="size-3.5" />
        Delete
      </Button>
    </div>
  );
}
