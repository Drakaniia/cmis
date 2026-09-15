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

export function ReportsSection() {
  return (
    <DocsSection id="reports-analytics" title="Reports & Analytics">
      <DocsP>
        Reports turns the day-to-day record into answers: what is moving, what
        is sitting still, where the shortfalls are. Every chart reads the same
        filters, so the numbers on screen always agree with each other.
      </DocsP>

      <DocsSubHeading>Choose a period and a category</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Pick a date range.">
          The presets at the top switch between this month, the last three
          months, the year and everything.
        </DocsStep>
        <DocsStep title="Filter by category.">
          Choose a category (Analgesic, Antibiotic, and so on) to narrow every
          widget at once, or leave it on All.
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

      <DocsSubHeading>Taking numbers away</DocsSubHeading>
      <DocsP>
        <span className="font-medium text-foreground">Export CSV</span> saves
        what the current filters show — ready for a spreadsheet or an audit
        file. For a paginated handout, use Print: CMIS opens the system print
        dialog, where “Save as PDF” produces the report as a document.
      </DocsP>

      <DocsCallout title="Empty chart? Check the period first" tone="tip">
        A widget with no movement in the selected range draws an empty state
        rather than a flat line. Widen the date range before assuming something
        is wrong.
      </DocsCallout>
      <DocsCallout title="Charts follow the records" tone="note">
        Reports are built from the same data as{" "}
        <span className="font-medium text-foreground">Stock Management</span>{" "}
        and the{" "}
        <span className="font-medium text-foreground">Dispensing Log</span>. If
        a figure looks wrong, correct the underlying stock movement — the chart
        will follow.
      </DocsCallout>

      <DocsFigure
        alt="Reports page showing the filter bar above a grid of charts for stock movement, expiry timeline, usage by category and top dispensed items"
        caption="Reports & Analytics: filter once at the top, and every chart below answers from the same data."
      />
      <DocsP>
        Expiry buckets and low-stock levels have their own working pages:{" "}
        <DocsRoute to="/admin/inventory/expiry">Expiry Alerts</DocsRoute> and{" "}
        <DocsRoute to="/admin/inventory/low-stock">Low-Stock Alerts</DocsRoute>.
      </DocsP>
    </DocsSection>
  );
}
