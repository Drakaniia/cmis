import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { AlertTriangle } from "lucide-react";
import { expiryLabel } from "../domain/expiry";
import {
  type ItemHistoryTotals,
  useItemHistory,
} from "../hooks/use-item-history";
import type { InventoryItem } from "../types";

/**
 * Stock detail modal §11.2 — the real dispensing history.
 *
 * Newest first, a totals strip above, and a load-more at the end. Rows that
 * fail the text match simply are not listed (decision 19): the honest gap is
 * preferable to a count the app cannot act on.
 *
 * Apple Design §15 — the totals are the glanceable line, so they get weight and
 * tabular figures; the table below stays quiet.
 */

function TotalsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="truncate font-semibold text-foreground text-sm tabular-nums">
        {value}
      </p>
    </div>
  );
}

function TotalsStrip({ totals }: { totals: ItemHistoryTotals }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-muted/40 px-3 py-2.5">
      <TotalsStat label="Units dispensed" value={String(totals.units)} />
      <TotalsStat label="Records" value={String(totals.records)} />
      <TotalsStat
        label="First recorded"
        value={totals.first ? expiryLabel(totals.first) : "—"}
      />
      <TotalsStat
        label="Last recorded"
        value={totals.last ? expiryLabel(totals.last) : "—"}
      />
    </div>
  );
}

function HistoryTable({
  rows,
}: {
  rows: ReturnType<typeof useItemHistory>["rows"];
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-caption">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-2 py-1.5 font-medium">Date</th>
            <th className="px-2 py-1.5 font-medium">Batch</th>
            <th className="px-2 py-1.5 font-medium">Qty</th>
            <th className="px-2 py-1.5 font-medium">Requestor</th>
            <th className="px-2 py-1.5 font-medium">Staff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              className={cn(index % 2 === 0 ? "bg-card" : "bg-muted/20")}
              key={`${row.at}-${row.batch}-${row.requestor}-${index}`}
            >
              <td className="px-2 py-1.5">{expiryLabel(row.at)}</td>
              <td className="px-2 py-1.5">{row.batch || "—"}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.qty}</td>
              <td className="px-2 py-1.5">{row.requestor || "—"}</td>
              <td className="px-2 py-1.5">{row.staff || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItemHistoryPanel({ item }: { item: InventoryItem }) {
  const history = useItemHistory(item, true);

  if (history.isError) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <AlertTriangle aria-hidden className="size-5 text-destructive" />
        <p className="text-caption text-muted-foreground">
          Could not load dispensing history.
        </p>
        <Button
          className="press-feedback"
          onClick={() => history.refetch()}
          size="sm"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (history.isLoading) {
    return (
      <div className="space-y-2 px-4 py-4">
        <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
        <div className="h-24 animate-pulse rounded-md bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <TotalsStrip totals={history.totals} />

      {history.rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-caption text-muted-foreground">
          No dispensing recorded for this item.
        </p>
      ) : (
        <>
          <HistoryTable rows={history.rows} />
          {history.hasMore ? (
            <div className="mt-3 flex justify-center">
              <Button
                className="press-feedback"
                onClick={() => history.loadMore()}
                size="sm"
                variant="outline"
              >
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
