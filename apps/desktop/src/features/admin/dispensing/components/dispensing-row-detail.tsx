import { Button } from "@cmis/ui/components/button";
import { Link2, XCircle } from "lucide-react";

import { absoluteDateTime } from "../../format";
import type { DispensingRow } from "../types";

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

  return (
    <div className="border-border/50 border-t bg-muted/30 px-4 py-3 text-caption">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground text-sm">{row.medicine}</p>
          <p className="mt-0.5 text-muted-foreground">
            {row.id} · {row.requestor} ({row.requestorId}) ·{" "}
            {absoluteDateTime(row.dispensedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.requestLink ? (
            <Button
              className="press-feedback"
              onClick={() => onRequest(row.requestLink as string)}
              size="xs"
              variant="outline"
            >
              <Link2 aria-hidden className="size-3" />
              {row.requestLink}
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 overflow-hidden rounded-md border border-border/60 bg-card">
        <DetailRow
          label="Medicine"
          value={`${row.medicine} (${row.medicineSku})`}
        />
        <DetailRow label="Batch" value={row.batch} />
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
        {row.requestLink ? (
          <DetailRow label="Request" value={row.requestLink} />
        ) : (
          <DetailRow label="Request" value="Direct stock-out (no request)" />
        )}
      </dl>

      {isDenied ? (
        <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-foreground">
          <span className="font-medium">Denied:</span> This request was not
          fulfilled. The record is retained for audit completeness.
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
    <div className="grid grid-cols-[0.4fr_1fr] items-center gap-2 border-border/40 border-b px-2.5 py-1.5 last:border-b-0">
      <dt className="truncate font-medium text-foreground">{label}</dt>
      <dd className="truncate font-mono text-muted-foreground">{value}</dd>
    </div>
  );
}
