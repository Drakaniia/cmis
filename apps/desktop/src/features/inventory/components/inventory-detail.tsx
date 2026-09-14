import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Clock, Package, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { daysUntilExpiry, expiryLabel } from "../mock";
import type { InventoryItem } from "../types";

function StatusMarker({ status }: { status: InventoryItem["status"] }) {
  const map: Record<
    string,
    {
      label: string;
      variant: "success" | "warning" | "destructive" | "default";
    }
  > = {
    expiring: { label: "Expiring Soon", variant: "warning" },
    in: { label: "In Stock", variant: "success" },
    low: { label: "Low Stock", variant: "warning" },
    out: { label: "Out of Stock", variant: "destructive" },
  };
  const entry = map[status] ?? map.in;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          entry.variant === "success" && "bg-[var(--success)]",
          entry.variant === "warning" && "bg-[var(--warning)]",
          entry.variant === "destructive" && "bg-destructive",
          entry.variant === "default" && "bg-muted-foreground"
        )}
      />
      <span className="font-medium text-caption">{entry.label}</span>
    </span>
  );
}

/**
 * Apple Design §12 — Action bar is a translucent material layer between
 * the header and scrolling content. Content scrolls underneath (§12).
 * §1 — Each button has instant press feedback (scale 0.97).
 * §4 — Spring hover on the entire bar creates a living surface.
 * §8 — Primary action (Stock In) is visually dominant; secondary
 *       actions recede — hierarchy through material weight, not size.
 */
export function InventoryDetailContent({
  item,
  onStockIn,
  onStockOut,
  onClose,
  autoFocus = false,
}: {
  item: InventoryItem | null;
  onStockIn: () => void;
  onStockOut: () => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const stockInRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (autoFocus && item && stockInRef.current) {
      stockInRef.current.focus();
    }
  }, [autoFocus, item]);

  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="w-full max-w-sm rounded-lg border border-border border-dashed bg-muted/30 px-6 py-10">
          <Package
            aria-hidden
            className="mx-auto size-8 text-muted-foreground"
          />
          <p className="mt-3 font-medium text-foreground text-sm">
            Select an item
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            Choose a row to view details. ←
          </p>
        </div>
        <p className="text-caption text-muted-foreground">
          Detail shows history + actions.
        </p>
      </div>
    );
  }

  const nearestExpiry = item.expiry;
  const daysLeft = daysUntilExpiry(nearestExpiry);
  const expiryText = `${expiryLabel(nearestExpiry)} (${daysLeft >= 0 ? `${daysLeft} days` : "expired"})`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* §15 — Header: tight tracking on heading, caption tracking on metadata */}
      <div className="shrink-0 border-border/50 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              className="truncate font-semibold text-foreground text-sm"
              style={{ letterSpacing: "-0.01em" }}
            >
              {item.name} — {item.category}
            </h2>
            <p className="mt-1 flex flex-wrap gap-2 text-caption text-muted-foreground">
              <span>SKU: {item.sku}</span>
              {item.batches[0] ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Batch: {item.batches[0].batch}</span>
                </>
              ) : null}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-caption">
              <span
                className={cn(
                  daysLeft <= 7 && daysLeft >= 0 && "text-[var(--warning)]",
                  daysLeft < 0 && "text-destructive"
                )}
              >
                Expiry: {expiryText}
              </span>
              <span aria-hidden>·</span>
              <span
                className={cn(
                  item.qty === 0 && "font-semibold text-destructive"
                )}
              >
                Qty: {item.qty}
              </span>
              <span aria-hidden>·</span>
              <span>Supplier: {item.supplier}</span>
            </p>
            <div className="mt-2">
              <StatusMarker status={item.status} />
            </div>
          </div>
          {onClose ? (
            <Button
              aria-label="Close detail"
              className="press-feedback shrink-0"
              onClick={onClose}
              size="icon-sm"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* §12 — Frosted action bar: translucent material between header & scroll.
       * Content scrolls underneath; material weight is lighter than header
       * (less opaque, more blur) to encode hierarchy. §8 — Stock In is the
       * primary action with confirm variant; Stock Out is secondary outline;
       * Edit/History are ghost — hierarchy through visual weight. */}
      <motion.div
        animate={{ opacity: 1 }}
        className={cn(
          "flex flex-wrap items-center gap-1.5 px-3 py-2",
          /* §12 Material: lighter frosted surface for action bar */
          "border-border/30 border-b bg-card/50 backdrop-blur-md"
        )}
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
      >
        {/* §8 — Primary CTA: confirm variant (solid, confident) */}
        <Button
          className="press-feedback"
          onClick={onStockIn}
          ref={stockInRef}
          size="sm"
          variant="confirm"
        >
          Stock In
        </Button>
        {/* §8 — Secondary: outline (visible but not dominant) */}
        <Button
          className="press-feedback"
          onClick={onStockOut}
          size="sm"
          variant="outline"
        >
          Stock Out
        </Button>
        {/* §8 — Tertiary: ghost (subtle, same weight as text) */}
        <Button className="press-feedback" size="sm" variant="ghost">
          Edit
        </Button>
        <Button className="press-feedback" size="sm" variant="ghost">
          History
        </Button>
      </motion.div>

      {/* Content scroll area — §12 content scrolls under the frosted bar */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-3">
          <h3 className="flex items-center gap-1.5 font-semibold text-caption text-foreground uppercase tracking-widest">
            <Clock aria-hidden className="size-3.5" />
            Dispensing history (last 10)
          </h3>
          {item.dispensingHistory.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-caption text-muted-foreground">
              No dispensing yet for this item.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <table className="w-full text-left text-caption">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Qty</th>
                    <th className="px-2 py-1.5 font-medium">Requestor</th>
                    <th className="px-2 py-1.5 font-medium">Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {item.dispensingHistory.slice(0, 10).map((r, idx) => (
                    <tr
                      className={cn(idx % 2 === 0 ? "bg-card" : "bg-muted/20")}
                      key={`${r.date}-${r.batch}-${r.requestor}-${r.qty}`}
                    >
                      <td className="px-2 py-1.5">{r.date}</td>
                      <td className="px-2 py-1.5">{r.qty}</td>
                      <td className="px-2 py-1.5">{r.requestor}</td>
                      <td className="px-2 py-1.5">{r.staff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <h3 className="font-semibold text-caption text-foreground uppercase tracking-widest">
            Batches (FEFO)
          </h3>
          {item.batches.length === 0 ? (
            <p className="mt-2 text-caption text-muted-foreground">
              No batches.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {[...item.batches]
                .sort(
                  (a, b) =>
                    new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
                )
                .map((b) => (
                  <li
                    className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-caption"
                    key={b.batch}
                  >
                    <span className="font-medium">{b.batch}</span>
                    <span className="text-muted-foreground">
                      {expiryLabel(b.expiry)}
                    </span>
                    <span className={cn(b.qty === 0 && "text-destructive")}>
                      Qty {b.qty}
                    </span>
                    <span className="text-muted-foreground">{b.supplier}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
