import { Button } from "@cmis/ui/components/button";
import { ArrowRight, FileText, Link2 } from "lucide-react";

import { absoluteDateTime } from "../../format";
import type { AuditRow } from "../types";
import { auditCategoryOf } from "../types";

function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * CMIS-UI-09 §3.2 — expanded row. Expansion (not a modal) keeps scan context,
 * and the animation is a cross-fade so the table doesn't jump sideways.
 */
export function AuditRowDetail({
  row,
  onCorrect,
  onRequest,
  onViewCorrection,
}: {
  onCorrect: (row: AuditRow) => void;
  onRequest: (requestRef: string) => void;
  onViewCorrection: (correctionId: string) => void;
  row: AuditRow;
}) {
  const keys = [
    ...new Set([
      ...Object.keys(row.before ?? {}),
      ...Object.keys(row.after ?? {}),
    ]),
  ];

  return (
    <div className="border-border/50 border-t bg-muted/30 px-4 py-3 text-caption">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground text-sm">{row.detail}</p>
          <p className="mt-0.5 text-muted-foreground">
            {row.id} · {row.user} · {absoluteDateTime(row.at)} ·{" "}
            {auditCategoryOf(row.action).label}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.requestRef ? (
            <Button
              className="press-feedback"
              onClick={() => onRequest(row.requestRef as string)}
              size="xs"
              variant="outline"
            >
              <Link2 aria-hidden className="size-3" />
              {row.requestRef}
            </Button>
          ) : null}
          {row.corrected && row.correctionId ? (
            <Button
              className="press-feedback"
              onClick={() => onViewCorrection(row.correctionId as string)}
              size="xs"
              variant="outline"
            >
              <FileText aria-hidden className="size-3" />
              View correction
            </Button>
          ) : null}
          {row.action === "correction" ? null : (
            <Button
              className="press-feedback"
              onClick={() => onCorrect(row)}
              size="xs"
              variant="ghost"
            >
              Create correction
            </Button>
          )}
        </div>
      </div>

      {keys.length > 0 ? (
        <dl className="mt-3 overflow-hidden rounded-md border border-border/60 bg-card">
          {keys.map((key) => {
            const before = row.before?.[key];
            const after = row.after?.[key];
            const changed = formatValue(before) !== formatValue(after);
            return (
              <div
                className="grid grid-cols-[0.8fr_1.1fr_auto_1.1fr] items-center gap-2 border-border/40 border-b px-2.5 py-1.5 last:border-b-0"
                key={key}
              >
                <dt className="truncate font-medium text-foreground">{key}</dt>
                <dd className="truncate font-mono text-muted-foreground">
                  {formatValue(before)}
                </dd>
                <ArrowRight
                  aria-hidden
                  className="size-3 text-muted-foreground"
                />
                <dd
                  className={
                    changed
                      ? "truncate font-mono text-foreground"
                      : "truncate font-mono text-muted-foreground"
                  }
                >
                  {formatValue(after)}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="mt-3 text-muted-foreground">
          No structured diff recorded for this entry.
        </p>
      )}

      {row.reason ? (
        <p className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-foreground">
          <span className="font-medium">Reason:</span> {row.reason}
        </p>
      ) : null}
    </div>
  );
}
