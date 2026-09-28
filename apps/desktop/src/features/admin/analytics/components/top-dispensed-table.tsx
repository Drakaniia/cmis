import type { TopDispensedRow } from "../types";
import { EmptyWidget, WidgetCard } from "./widget-card";

export function TopDispensedTable({ rows }: { rows: TopDispensedRow[] }) {
  if (rows.length === 0) {
    return (
      <WidgetCard subtitle="Top 5 by quantity dispensed" title="Top Dispensed">
        <EmptyWidget message="No dispensed items in this period." />
      </WidgetCard>
    );
  }
  return (
    <WidgetCard subtitle="Top 5 by quantity dispensed" title="Top Dispensed">
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
            <tr>
              <th className="px-2.5 py-1.5 text-left font-semibold">#</th>
              <th className="px-2.5 py-1.5 text-left font-semibold">
                Medicine
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r, i) => (
              <tr
                className="transition-colors hover:bg-muted/40 motion-reduce:transition-none"
                key={r.id}
              >
                <td className="px-2.5 py-2 text-muted-foreground text-xs tabular-nums">
                  {i + 1}
                </td>
                <td className="px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-xs leading-tight tracking-[-0.005em]">
                      {r.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed tracking-[0.005em]">
                      {r.category} · {r.sku}
                    </div>
                  </div>
                </td>
                <td className="px-2.5 py-2 text-right font-bold text-xs tabular-nums">
                  {r.qty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetCard>
  );
}
