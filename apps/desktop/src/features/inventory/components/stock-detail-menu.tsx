import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Stock detail modal §12 — the row's `⋯` menu, shared by Expiry Alerts and
 * Low-Stock Alerts so the four new actions are defined once.
 *
 * The trigger and the content both carry `data-row-control`, which is how the
 * row's click handler knows an event came from a control and must not also open
 * the detail modal.
 */

const COPY_FAILED = "Could not copy — copy manually";

/** Decision 25 — clipboard failures are reported, never swallowed. */
async function copyToClipboard(label: string, value: string) {
  const trimmed = value.trim();
  if (trimmed === "") {
    toast.error(COPY_FAILED);
    return;
  }
  try {
    await navigator.clipboard.writeText(trimmed);
    toast.success(label);
  } catch {
    toast.error(COPY_FAILED);
  }
}

export function StockDetailMenu({
  batchCode,
  itemName,
  onDeleteBatch,
  onOpenInStockManagement,
  onView,
  sku,
}: {
  /** Expiry Alerts only — Low-Stock has no clicked batch. */
  batchCode?: string;
  itemName: string;
  /**
   * Expiry Alerts only. A wrong lot is corrected by deleting the batch, not by
   * an offsetting stock-out, so the item survives the menu sharing.
   */
  onDeleteBatch?: () => void;
  onOpenInStockManagement: () => void;
  onView: () => void;
  sku: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More actions"
        className="press-feedback inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        data-row-control
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div data-row-control>
          <DropdownMenuItem onClick={onView}>View details</DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyToClipboard("SKU copied", sku)}>
            Copy SKU
          </DropdownMenuItem>
          {batchCode === undefined ? null : (
            <DropdownMenuItem
              onClick={() => copyToClipboard("Batch code copied", batchCode)}
            >
              Copy batch code
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => copyToClipboard("Item name copied", itemName)}
          >
            Copy item name
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenInStockManagement}>
            Open in Stock Management
          </DropdownMenuItem>
          {onDeleteBatch ? (
            <DropdownMenuItem onClick={onDeleteBatch}>
              <Trash2 aria-hidden className="size-3.5 text-destructive" />
              Delete batch
            </DropdownMenuItem>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
