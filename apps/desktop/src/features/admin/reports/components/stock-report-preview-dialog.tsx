import { Button } from "@cmis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cmis/ui/components/dialog";
import { Printer } from "lucide-react";
import { useCallback } from "react";

import {
  StockReportDocument,
  type StockReportDocumentProps,
} from "./stock-report-document";

/**
 * The step between pressing "Save PDF" and a file appearing on disk
 * (stock-level-report spec F7, revised): the operator reviews the document
 * first, then chooses where it goes in the native save dialog.
 *
 * The preview is the same `StockReportDocument` the print path uses, so what is
 * reviewed is what is printed — and, column for column, what the Rust PDF draws.
 */
export function StockReportPreviewDialog({
  document,
  isSaving,
  onConfirmSave,
  onOpenChange,
  onPrint,
  open,
}: {
  document: StockReportDocumentProps;
  isSaving: boolean;
  onConfirmSave: () => void;
  onOpenChange: (open: boolean) => void;
  onPrint: () => void;
  open: boolean;
}) {
  const handleCancel = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-5xl print:hidden">
        <DialogHeader className="border-border/60 border-b px-5 py-3.5">
          <DialogTitle>PDF preview — Stock Level Report</DialogTitle>
          <DialogDescription>
            Review the document below. Saving opens a dialog so you can choose
            the folder and filename.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] overflow-auto bg-neutral-200/70 p-4 sm:p-6 dark:bg-neutral-800/60">
          <div className="mx-auto w-[1040px] max-w-full overflow-hidden border border-neutral-300 shadow-lg">
            <StockReportDocument {...document} />
          </div>
        </div>

        <DialogFooter className="border-border/60 border-t px-5 py-3.5">
          <Button
            className="press-feedback"
            onClick={handleCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="press-feedback"
            onClick={onPrint}
            type="button"
            variant="outline"
          >
            <Printer aria-hidden className="size-3.5" />
            Print
          </Button>
          <Button
            className="press-feedback"
            disabled={isSaving}
            onClick={onConfirmSave}
            type="button"
          >
            {isSaving ? "Saving…" : "Save PDF…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
