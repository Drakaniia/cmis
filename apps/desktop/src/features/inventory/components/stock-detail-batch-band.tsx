import { cn } from "@cmis/ui/lib/utils";
import {
  EXPIRY_STATUS_CONFIG,
  expiryLabel,
  relativeExpiryText,
} from "../domain/expiry";
import type { ExpiryRow } from "../types";

/**
 * Stock detail modal §8 — the row-scoped context band.
 *
 * The reused item header below it answers "what is this product"; this band
 * answers "which lot did I just click, and how urgent is it". Expiry Alerts
 * passes a row, Low-Stock passes nothing and renders no band at all.
 *
 * Apple Design §12 — a tinted material surface with a 4px status edge, so the
 * urgency reads before any text does. §15 — tight tracking on the headline.
 * §14 — every value is a plain string in the DOM, so a screen reader announces
 * the batch, the urgency and the item context without a live region.
 */

/** A blank or unparseable date must never reach `relativeExpiryText`. */
function hasValidExpiry(iso: string): boolean {
  if (iso.trim() === "") {
    return false;
  }
  return !Number.isNaN(new Date(iso).getTime());
}

/** Decision 28 — a missing value still renders; it just reads as an em-dash. */
function valueOrDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "—";
  }
  const trimmed = value.trim();
  return trimmed === "" ? "—" : trimmed;
}

function Separator() {
  return (
    <span aria-hidden className="text-muted-foreground/60">
      ·
    </span>
  );
}

export function StockDetailBatchBand({ row }: { row: ExpiryRow }) {
  const { batch, daysUntil, expiryStatus, item } = row;
  const expiryIsUsable = hasValidExpiry(batch.expiry);
  // An unusable date has no status to claim, so the badge falls back to the
  // neutral entry rather than asserting "Expired" from a NaN comparison.
  const config = expiryIsUsable
    ? EXPIRY_STATUS_CONFIG[expiryStatus]
    : EXPIRY_STATUS_CONFIG.safe;
  const headline = expiryIsUsable ? relativeExpiryText(daysUntil) : null;

  return (
    <section
      aria-label={`Batch ${valueOrDash(batch.batch)} for ${item.displayName}`}
      className={cn(
        /* §12 — lighter material than the panel, tinted by urgency */
        "flex items-stretch gap-3 border-border/40 border-b px-4 py-3",
        expiryIsUsable && expiryStatus === "expired" && "bg-destructive/5",
        expiryIsUsable &&
          expiryStatus === "expiring-soon" &&
          "bg-[var(--warning)]/5",
        (!expiryIsUsable ||
          expiryStatus === "expiring-later" ||
          expiryStatus === "safe") &&
          "bg-muted/30"
      )}
    >
      {/* 4px urgency edge — the same bar the table row uses, so the modal and
       * the row read as the same object at different zoom levels. */}
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ backgroundColor: config.barColor }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="min-w-0 font-semibold text-foreground text-sm"
            style={{ letterSpacing: "-0.01em" }}
          >
            {headline ?? "No expiry on record"}
          </h3>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-medium text-[10px]",
              config.badgeClass
            )}
          >
            {expiryIsUsable ? config.label : "No expiry"}
          </span>
        </div>

        {/* Facts line — the batch's own identity */}
        <p className="flex flex-wrap items-center gap-x-1.5 text-caption">
          <span>Batch {valueOrDash(batch.batch)}</span>
          <Separator />
          <span>
            {expiryIsUsable
              ? expiryLabel(batch.expiry)
              : valueOrDash(batch.expiry)}
          </span>
          <Separator />
          <span>Qty {valueOrDash(batch.qty)}</span>
          <Separator />
          <span className="text-muted-foreground">
            {valueOrDash(batch.supplier)}
          </span>
        </p>

        {/* Secondary line — item context plus the day count, spelled out */}
        <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
          <span>{valueOrDash(item.category)}</span>
          <Separator />
          <span>Threshold {valueOrDash(item.threshold)}</span>
          {expiryIsUsable ? (
            <>
              <Separator />
              <span className="tabular-nums">{Math.abs(daysUntil)} days</span>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
