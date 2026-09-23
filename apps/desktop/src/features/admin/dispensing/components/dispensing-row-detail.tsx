import { Button } from "@cmis/ui/components/button";
import { Link2, XCircle } from "lucide-react";
import { useCallback } from "react";

import { absoluteDateTime } from "../../format";
import type { DispensingRow } from "../types";
import { batchLabel, DISPENSING_SOURCE_DETAIL } from "../types";

/**
 * CMIS-UI-06 §4 — expanded row detail for a dispensing record.
 * Opens as an inline expansion (scan context preserved), showing full record
 * details with request link or denied reason.
 */
export function DispensingRowDetail({
  row,
  onRequest,
}: {
  onRequest: (requestRef: string) => void;
  row: DispensingRow;
}) {
  const isDenied = row.status === "denied";
  const handleRequest = useCallback(
    () => onRequest(row.requestLink as string),
    [onRequest, row.requestLink]
  );

  return (
    <div className="border-border/40 border-t bg-muted/20 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[14px] tracking-[-0.01em] text-foreground">
            {row.medicine}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] tracking-[0.01em] text-muted-foreground">
            <span className="rounded-full bg-card px-2 py-0.5 font-mono tracking-[0.02em] tabular-nums">
              {row.id}
            </span>
            <span className="rounded-full bg-card px-2 py-0.5">{row.requestor}</span>
            <span className="font-mono tabular-nums">({row.requestorId})</span>·{" "}
            {absoluteDateTime(row.dispensedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.requestLink ? (
            <Button
              className="press-feedback rounded-full"
              onClick={handleRequest}
              size="xs"
              variant="outline"
            >
              <Link2 aria-hidden className="size-3" />
              {row.requestLink}
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 overflow-hidden rounded-xl border border-border/40 bg-card shadow-sm">
        <DetailRow
          label="Medicine"
          value={`${row.medicine} (${row.medicineSku})`}
        />
        {/* "No batch recorded" rather than a blank: a quick deduction of an
            item with no batch rows has no code to show, and an empty cell
            reads as missing data instead of a recorded absence. */}
        <DetailRow label="Batch" value={batchLabel(row)} />
        <DetailRow label="Quantity" value={String(row.qty)} />
        <DetailRow label="Dispensed by" value={row.staff} />
        <DetailRow label="Location" value={row.branch} />
        <DetailRow
          label="Status"
          value={
            isDenied ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                <XCircle aria-hidden className="size-3" />
                Denied
              </span>
            ) : (
              "Dispensed"
            )
          }
        />
        <DetailRow
          label="Source"
          value={DISPENSING_SOURCE_DETAIL[row.source]}
        />
        {row.requestLink ? (
          <DetailRow label="Request" value={row.requestLink} />
        ) : (
          <DetailRow label="Request" value="Direct stock-out (no request)" />
        )}
      </dl>

      {isDenied ? (
        <p className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[12px] leading-[1.5] tracking-[0.01em] text-foreground">
          <span className="font-semibold">Denied:</span> This request was not fulfilled. The record is
          retained for audit completeness.
        </p>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[0.38fr_1fr] items-center gap-2 border-border/30 border-b px-3 py-2.5 last:border-b-0">
      <dt className="truncate text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="truncate font-mono text-[12px] tracking-[0.01em] text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}
