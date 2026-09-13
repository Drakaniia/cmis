/**
 * CMIS-UI-01 §8 — Stock-in / Scan sheet.
 *
 * A bottom-sheet (narrow) or centered modal (wide) that opens when
 * the user triggers "Stock In" or "Scan Barcode" from Quick Actions.
 * Wraps the AdminSheet pattern from features/admin/components/sheet.tsx.
 */

import * as React from "react";

import { AdminSheet } from "@/features/admin/components/sheet";

export function StockSheet({
  initialTab,
  onOpenChange,
  open,
  originRect,
}: {
  initialTab: "scan" | "stock-in";
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect: DOMRect | null;
}) {
  const [tab, setTab] = React.useState(initialTab);

  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [initialTab, open]);

  return (
    <AdminSheet
      label={tab === "scan" ? "Scan barcode" : "Stock in"}
      onOpenChange={onOpenChange}
      open={open}
      originRect={originRect}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            aria-pressed={tab === "stock-in"}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium text-xs transition-colors ${
              tab === "stock-in"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("stock-in")}
            type="button"
          >
            Stock In
          </button>
          <button
            aria-pressed={tab === "scan"}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium text-xs transition-colors ${
              tab === "scan"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("scan")}
            type="button"
          >
            Scan Barcode
          </button>
        </div>

        {tab === "scan" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-muted-foreground text-sm">
              Point your barcode scanner at an item or batch code.
            </p>
            <div className="flex size-16 items-center justify-center rounded-xl border-2 border-border/60 border-dashed">
              <span className="text-caption text-muted-foreground">📷</span>
            </div>
            <p className="text-caption text-muted-foreground">
              Scanned items will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-muted-foreground text-sm">
              Add new stock or receive a delivery.
            </p>
            <p className="text-caption text-muted-foreground">
              Stock-in wizard coming soon.
            </p>
          </div>
        )}
      </div>
    </AdminSheet>
  );
}
