import {
  DocsCallout,
  DocsFigure,
  DocsP,
  DocsRoute,
  DocsSection,
  DocsStep,
  DocsSteps,
  DocsSubHeading,
} from "../docs-primitives";

const WIDGETS = [
  {
    description:
      "how much came in versus how much went out over the selected period.",
    label: "Stock movement",
  },
  {
    description:
      "when the batches currently on the shelf will expire — the same data as Expiry Alerts, drawn as a timeline.",
    label: "Expiry timeline",
  },
  {
    description:
      "which categories are used most, as a share of everything dispensed.",
    label: "Usage by category",
  },
  {
    description: "the medicines dispensed most often, ranked.",
    label: "Top dispensed items",
  },
  {
    description:
      "how many requests were fulfilled against how many were asked for.",
    label: "Dispensed vs requested",
  },
  {
    description:
      "whether stock-outs are getting more or less frequent as time goes on.",
    label: "Low-stock trend",
  },
];

export function AnalyticsSection() {
  return (
    <DocsSection id="analytics" title="Analytics">
      <DocsP>
        Analytics turns the day-to-day record into answers: what is moving, what
        is sitting still, where the shortfalls are. Every card reads the same
        filters, so the numbers on screen always agree with each other. The stock
        report lives next door, at{" "}
        <DocsRoute to="/admin/reports">Stock Report</DocsRoute>.
      </DocsP>

      <DocsSubHeading>Choose a period and a category</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Pick a date range.">
          The presets at the top switch between recent days and a longer window.
        </DocsStep>
        <DocsStep title="Filter by category.">
          Choose a category (Analgesic, Antibiotic, and so on) to narrow every
          card at once, or leave it on All.
        </DocsStep>
        <DocsStep title="Read the grid.">
          Each card is one question. Hover a chart for exact figures rather than
          estimating from the bars.
        </DocsStep>
      </DocsSteps>

      <DocsSubHeading>What each card answers</DocsSubHeading>
      <ul className="space-y-1.5">
        {WIDGETS.map((widget) => (
          <li
            className="text-[13px] text-muted-foreground leading-relaxed"
            key={widget.label}
          >
            <span className="font-medium text-foreground">{widget.label}</span>{" "}
            — {widget.description}
          </li>
        ))}
      </ul>

      <DocsCallout title="Empty chart? Check the period first" tone="tip">
        A card with no movement in the selected range draws an empty state rather
        than a flat line. Widen the date range before assuming something is
        wrong.
      </DocsCallout>
      <DocsCallout title="Charts follow the records" tone="note">
        Analytics are built from the same data as{" "}
        <span className="font-medium text-foreground">Stock Management</span> and
        the{" "}
        <span className="font-medium text-foreground">Dispensing Log</span>. If a
        figure looks wrong, correct the underlying stock movement — the chart
        will follow.
      </DocsCallout>

      <DocsFigure
        alt="Analytics page showing the filter bar above a grid of charts for stock movement, expiry timeline, usage by category and top dispensed items"
        caption="Analytics: filter once at the top, and every card below answers from the same data."
      />
    </DocsSection>
  );
}
