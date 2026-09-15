import {
  DocsCallout,
  DocsFigure,
  DocsKey,
  DocsP,
  DocsRoute,
  DocsSection,
  DocsStep,
  DocsSteps,
  DocsSubHeading,
} from "../docs-primitives";

const COLUMNS = [
  {
    description: "staff have asked; nobody has decided yet.",
    label: "Pending",
  },
  {
    description: "approved for release once it is prepared.",
    label: "Approved",
  },
  {
    description: "packed and waiting at the counter.",
    label: "Ready to Claim",
  },
  { description: "handed over, recorded and dispensed.", label: "Claimed" },
  {
    description: "declined, kept on the board with the reason.",
    label: "Denied",
  },
];

export function RequestsSection() {
  return (
    <DocsSection id="request-queue" title="Request Queue">
      <DocsP>
        The Request Queue is a board of cards — one card per request. Cards move
        left to right as a request is approved, prepared and handed over, so
        anyone can see at a glance what is waiting on whom.
      </DocsP>

      <DocsSubHeading>The five columns</DocsSubHeading>
      <ul className="space-y-1.5">
        {COLUMNS.map((column) => (
          <li
            className="text-[13px] text-muted-foreground leading-relaxed"
            key={column.label}
          >
            <span className="font-medium text-foreground">{column.label}</span>{" "}
            — {column.description}
          </li>
        ))}
      </ul>

      <DocsSubHeading>Submit a request</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Press Ctrl+N (or File → New Request).">
          The new-request form opens from anywhere in the app.
        </DocsStep>
        <DocsStep title="Pick the items and quantities.">
          Add each medicine with how much is needed; the form checks what is on
          the shelf as you go.
        </DocsStep>
        <DocsStep title="Record who it is for.">
          The requestor and purpose are what the approver uses to decide.
        </DocsStep>
        <DocsStep title="Submit.">
          The card lands in Pending with the time it arrived.
        </DocsStep>
      </DocsSteps>

      <DocsSubHeading>Move a card forward</DocsSubHeading>
      <DocsP>
        Drag a card to the next column, or open its ⋯ menu and pick the action.
        The menu only offers moves that are allowed, so you cannot skip a step
        by accident:
      </DocsP>
      <DocsSteps>
        <DocsStep title="Approve">
          from Pending into Approved. Open the card’s details first if you need
          to see the current stock levels.
        </DocsStep>
        <DocsStep title="Prepare → Ready to Claim">
          from Approved once the items are packed and waiting.
        </DocsStep>
        <DocsStep title="Dispense → Claimed">
          from Ready to Claim at hand-over. This writes the dispensing record,
          deducts the quantity from stock and asks which batch you took it from.
        </DocsStep>
        <DocsStep title="Deny">
          from Pending or Approved. A reason is required and stays on the card.
        </DocsStep>
        <DocsStep title="Re-open → Pending">
          from Denied, when the request can be reconsidered.
        </DocsStep>
      </DocsSteps>

      <DocsCallout title="Working in bulk" tone="tip">
        Tick several cards in the same column to use the batch bar — Approve
        all, Prepare all, Dispense all or Deny all. A mixed selection only
        offers the moves that are valid for every card.
      </DocsCallout>
      <DocsCallout title="Claimed cards disappear after a day">
        Twenty-four hours after hand-over a claimed card leaves the board to
        keep it readable. Nothing is lost — every dispensed request stays in the
        dispensing log.
      </DocsCallout>

      <DocsSubHeading>Finding a card</DocsSubHeading>
      <DocsP>
        Search by requestor, item or reference, filter by date, and use{" "}
        <DocsKey>Ctrl</DocsKey> <DocsKey>K</DocsKey> to jump straight to the
        queue. Open any card for its full history: who moved it, from which
        column, and when.
      </DocsP>

      <DocsFigure
        alt="Request Queue board with Pending, Approved, Ready to Claim, Claimed and Denied columns and a highlighted selection bar"
        caption="The Request Queue: five columns, drag-and-drop cards, and batch actions for a selection."
      />
      <DocsP>
        Handed-over requests are recorded on{" "}
        <DocsRoute to="/admin/dispensing">Dispensing Log</DocsRoute> — that is
        the page to use when someone asks what was given out and when.
      </DocsP>
    </DocsSection>
  );
}
