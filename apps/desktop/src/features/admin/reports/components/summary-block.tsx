"use client";

import { cn } from "@cmis/ui/lib/utils";
import type { ReactNode } from "react";

import type { MonthActivity, StockSummary } from "../types";

/**
 * The month summary card (F2): stock totals, shelf health and this month's
 * movement, category-filtered. Every figure carries its label in words — nothing
 * is a bare number in a box that requires decoding.
 *
 * The context line reads "Stock as of …" (D30), so a screenshot can never be
 * mistaken for historical stock. The in/out figures are the only ones the month
 * picker drives.
 */
function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground leading-tight">
        {label}
      </dt>
      <dd className="font-semibold text-foreground text-lg tabular-nums leading-tight">
        {value}
      </dd>
    </div>
  );
}

function FigureGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em]">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {children}
      </dl>
    </div>
  );
}

export function SummaryBlock({
  activity,
  asOf,
  category,
  monthLabel,
  summary,
}: {
  activity: MonthActivity;
  asOf: string;
  category: string;
  monthLabel: string;
  summary: StockSummary;
}) {
  return (
    <section
      aria-label="Month summary"
      className={cn(
        "overflow-hidden rounded-[var(--radius-field)] border bg-card",
        "shadow-xs"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-border/60 border-b bg-muted/30 px-4 py-2.5">
        <h2 className="font-semibold text-[13px] tracking-[-0.01em]">
          Stock summary
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {asOf} · {monthLabel} · {category}
        </p>
      </div>

      <div className="grid gap-5 px-4 py-3.5 md:grid-cols-3">
        <FigureGroup title="Stock totals">
          <Figure label="Medicines" value={summary.medicines} />
          <Figure label="Units on hand" value={summary.unitsOnHand} />
          <Figure label="Categories" value={summary.categories} />
        </FigureGroup>

        <FigureGroup title="Shelf health">
          <Figure label="Low stock" value={summary.low} />
          <Figure label="Out of stock" value={summary.out} />
          <Figure label="Expiring ≤ 30 days" value={summary.expiringSoon} />
          <Figure label="Expiring ≤ 90 days" value={summary.expiringLater} />
          <Figure label="Expired" value={summary.expired} />
        </FigureGroup>

        <FigureGroup title="This month">
          <Figure label="Received" value={activity.received} />
          <Figure label="Dispensed" value={activity.dispensed} />
        </FigureGroup>
      </div>
    </section>
  );
}
