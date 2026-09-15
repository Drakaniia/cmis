import {
  DocsCallout,
  DocsFigure,
  DocsP,
  DocsSection,
  DocsStep,
  DocsSteps,
  DocsSubHeading,
} from "../docs-primitives";

const BUCKETS = [
  {
    action: "Pull it now. Dispensing expired stock is never correct.",
    description: "the date has passed.",
    label: "Expired",
  },
  {
    action: "Dispense these first — they are safe and need using.",
    description: "expires within 30 days.",
    label: "Expiring Soon",
  },
  {
    action: "Plan ahead; mention it when the next order is placed.",
    description: "expires within 90 days.",
    label: "Expiring Later",
  },
  {
    action: "Nothing to do.",
    description: "more than 90 days away.",
    label: "Safe",
  },
];

export function ExpirySection() {
  return (
    <DocsSection id="expiry-alerts" title="Expiry Alerts">
      <DocsP>
        Expiry Alerts sorts every batch on the shelf by how long it has left, so
        the answer to “what needs using first?” is one page. Batches are grouped
        into four buckets:
      </DocsP>
      <ul className="space-y-1.5">
        {BUCKETS.map((bucket) => (
          <li
            className="text-[13px] text-muted-foreground leading-relaxed"
            key={bucket.label}
          >
            <span className="font-medium text-foreground">{bucket.label}</span>{" "}
            — {bucket.description} {bucket.action}
          </li>
        ))}
      </ul>

      <DocsSubHeading>Working the list</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Pick a range.">
          The presets at the top switch between Expired, the next 30 days, 30–90
          days, or everything.
        </DocsStep>
        <DocsStep title="Jump by month.">
          The strip above the list shows the next twelve months — a taller bar
          means more batches expiring that month. Click one to jump straight
          there.
        </DocsStep>
        <DocsStep title="Read the row.">
          Each row tells you the item, the batch, the quantity left and how long
          is remaining (“expires in 12d”, “expired 3d ago”).
        </DocsStep>
        <DocsStep title="Act on the row.">
          Dispose a batch that is past its date, or correct the expiry when the
          date was typed wrong. Both actions are recorded in the audit log.
        </DocsStep>
      </DocsSteps>

      <DocsCallout title="Clear the shelf before you reorder" tone="tip">
        Check the Expired bucket before placing a new order — replacing stock
        that is still usable is the most expensive mistake this page prevents.
      </DocsCallout>
      <DocsCallout title="Dispose, don't hide">
        Disposing keeps the batch in the record with a reason, so month-end
        reports still add up. Deleting stock is not possible — that is
        deliberate.
      </DocsCallout>

      <DocsP>
        For the underlying batches and quantities, open{" "}
        <span className="font-medium text-foreground">Stock Management</span>{" "}
        and expand the item.
      </DocsP>

      <DocsFigure
        alt="Expiry Alerts grouped into Expired, Expiring Soon, Expiring Later and Safe, with a month strip above the list"
        caption="Expiry Alerts: bucket, batch, quantity and time remaining for every batch on the shelf."
      />
    </DocsSection>
  );
}
