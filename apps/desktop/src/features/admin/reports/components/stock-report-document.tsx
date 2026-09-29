import { cn } from "@cmis/ui/lib/utils";

import { LOW_STOCK_STATUS_CONFIG } from "@/features/inventory/domain/low-stock";
import type {
  CategoryGroup,
  GrandTotal,
  MonthActivity,
  StockLevelRow,
  StockSummary,
} from "../types";

/**
 * The Stock Report as a document — the same sheet the Rust PDF draws and the
 * system print dialog puts on paper (stock-level-report spec F8).
 *
 * It is deliberately paper-shaped rather than app-shaped: fixed neutral colours
 * instead of theme tokens, hairline rules instead of translucent materials, and
 * a column grid that survives both a preview pane and a printed page. One
 * renderer, two surfaces: the preview modal shows it, and `reports-page` mounts
 * a second instance behind `hidden print:block`.
 */

type Align = "center" | "left" | "right";

interface DocumentColumn {
  align: Align;
  label: string;
  /** Percentage of the printable width — mirrors the PDF's mm column widths. */
  width: string;
}

/**
 * Column order and widths are shared with the Rust renderer
 * (`TABLE_COL_WIDTHS` in `src-tauri/src/commands/reports.rs`), which keeps the
 * preview and the saved PDF reading the same way even though they are drawn by
 * different engines.
 */
const COLUMNS: DocumentColumn[] = [
  { align: "left", label: "Medicine", width: "22.71%" },
  { align: "left", label: "Form & strength", width: "19.05%" },
  { align: "right", label: "On hand", width: "8.06%" },
  { align: "left", label: "Pack hint", width: "13.92%" },
  { align: "right", label: "Threshold", width: "8.06%" },
  { align: "center", label: "Status", width: "10.26%" },
  { align: "left", label: "Nearest expiry", width: "10.26%" },
  { align: "right", label: "Batches", width: "7.69%" },
];

const CELL = "border border-neutral-300 px-2 py-1 align-top";
const HEAD_CELL =
  "border border-neutral-400 bg-neutral-100 px-2 py-1 font-semibold text-[10px] text-neutral-700 uppercase tracking-[0.03em]";

function alignClass(align: Align): string {
  if (align === "right") {
    return "text-right tabular-nums";
  }
  if (align === "center") {
    return "text-center";
  }
  return "text-left";
}

function DocumentRow({ row }: { row: StockLevelRow }) {
  const statusLabel = LOW_STOCK_STATUS_CONFIG[row.status].label;
  return (
    <tr className="break-inside-avoid">
      <td className={cn(CELL, "text-left")}>
        <span className="font-medium">{row.name}</span>
        {row.sku === "" ? null : (
          <span className="text-neutral-500"> ({row.sku})</span>
        )}
      </td>
      <td className={cn(CELL, "text-left")}>{row.formStrength}</td>
      <td className={cn(CELL, alignClass("right"))}>{row.onHand}</td>
      <td className={cn(CELL, "text-left")}>{row.packHint}</td>
      <td className={cn(CELL, alignClass("right"))}>{row.threshold}</td>
      <td className={cn(CELL, alignClass("center"))}>{statusLabel}</td>
      <td className={cn(CELL, "text-left")}>{row.expiryLabel}</td>
      <td className={cn(CELL, alignClass("right"))}>{row.batches}</td>
    </tr>
  );
}

function DocumentTable({ group }: { group: CategoryGroup }) {
  return (
    <table className="w-full border-collapse text-[10.5px] leading-snug">
      <colgroup>
        {COLUMNS.map((column) => (
          <col key={column.label} style={{ width: column.width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th
              className={cn(HEAD_CELL, alignClass(column.align))}
              key={column.label}
              scope="col"
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {group.rows.map((row) => (
          <DocumentRow key={row.id} row={row} />
        ))}
        <tr className="break-inside-avoid bg-neutral-50 font-medium">
          <td className={CELL} colSpan={COLUMNS.length}>
            <span className="font-semibold">{group.label} subtotal</span>
            {" · "}
            {group.subtotal.medicines}{" "}
            {group.subtotal.medicines === 1 ? "medicine" : "medicines"}
            {" · "}
            {group.subtotal.unitsOnHand} units
            {" · "}
            {group.subtotal.low} low
            {" · "}
            {group.subtotal.out} out
            {" · "}
            nearest expiry {group.subtotal.nearestExpiry}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[9.5px] text-neutral-500 uppercase tracking-[0.04em]">
        {label}
      </dt>
      <dd className="font-semibold text-[13px] tabular-nums">{value}</dd>
    </div>
  );
}

function SummaryStrip({
  activity,
  monthLabel,
  summary,
}: {
  activity: MonthActivity;
  monthLabel: string;
  summary: StockSummary;
}) {
  return (
    <section className="mt-3 border border-neutral-300">
      <h2 className="border-neutral-300 border-b bg-neutral-100 px-3 py-1.5 font-semibold text-[10px] text-neutral-700 uppercase tracking-[0.05em]">
        Summary
      </h2>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 px-3 py-3 sm:grid-cols-5 lg:grid-cols-8">
        <SummaryItem label="Medicines" value={summary.medicines} />
        <SummaryItem label="Units on hand" value={summary.unitsOnHand} />
        <SummaryItem label="Categories" value={summary.categories} />
        <SummaryItem label="Low stock" value={summary.low} />
        <SummaryItem label="Out of stock" value={summary.out} />
        <SummaryItem label="Expiring <= 30d" value={summary.expiringSoon} />
        <SummaryItem label="Expiring <= 90d" value={summary.expiringLater} />
        <SummaryItem label="Expired" value={summary.expired} />
      </dl>
      <p className="border-neutral-300 border-t bg-neutral-50 px-3 py-1.5 text-[10px] text-neutral-600">
        {monthLabel}: received <strong>{activity.received}</strong> · dispensed{" "}
        <strong>{activity.dispensed}</strong>
      </p>
    </section>
  );
}

export interface StockReportDocumentProps {
  activity: MonthActivity;
  asOf: string;
  category: string;
  generatedAt: string;
  grandTotal: GrandTotal;
  groups: CategoryGroup[];
  location: string;
  monthLabel: string;
  operator: string;
  summary: StockSummary;
}

export function StockReportDocument({
  activity,
  asOf,
  category,
  generatedAt,
  grandTotal,
  groups,
  location,
  monthLabel,
  operator,
  summary,
}: StockReportDocumentProps) {
  const categoryLabel = category === "All" ? "All categories" : category;

  return (
    <article className="stock-report-document bg-white px-6 py-5 text-neutral-900">
      <header className="border-neutral-800 border-b-2 pb-2">
        <h1 className="font-bold text-[19px] tracking-[-0.02em]">
          Stock Level Report
        </h1>
        <p className="mt-1 text-[10.5px] text-neutral-600">
          {monthLabel} · received {activity.received} · dispensed{" "}
          {activity.dispensed} · {categoryLabel}
        </p>
        <p className="text-[10.5px] text-neutral-600">
          {asOf} · generated {generatedAt}
        </p>
        <p className="text-[10.5px] text-neutral-600">
          Operator: {operator} · Location: {location}
        </p>
      </header>

      <SummaryStrip
        activity={activity}
        monthLabel={monthLabel}
        summary={summary}
      />

      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <section
            className="break-inside-avoid"
            data-report-group
            key={group.label}
          >
            <h2 className="mb-1 font-semibold text-[12px] tracking-[-0.01em]">
              {group.label} — {group.subtotal.medicines}{" "}
              {group.subtotal.medicines === 1 ? "medicine" : "medicines"}
            </h2>
            <DocumentTable group={group} />
          </section>
        ))}
      </div>

      <div className="mt-4 border-2 border-neutral-800">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-neutral-100 px-3 py-2 font-semibold text-[11px]">
          <span className="tracking-[-0.01em]">
            Grand total · {grandTotal.categories}{" "}
            {grandTotal.categories === 1 ? "category" : "categories"}
          </span>
          <span className="font-normal text-neutral-600">
            {grandTotal.medicines} medicines · {grandTotal.unitsOnHand} units ·{" "}
            {grandTotal.low} low · {grandTotal.out} out · nearest expiry{" "}
            {grandTotal.nearestExpiry}
          </span>
        </div>
      </div>

      <footer className="mt-3 border-neutral-300 border-t pt-1.5 text-[9.5px] text-neutral-500">
        Stock Level Report · {monthLabel} · {categoryLabel} · generated{" "}
        {generatedAt}
      </footer>
    </article>
  );
}
