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
          The new-request form opens from anywhere in the app, over whatever you
          were looking at. It does not interrupt typing: inside a text field
          Ctrl+N stays a line break.
        </DocsStep>
        <DocsStep title="Pick the medicine, quantity and unit.">
          The medicine list comes from Stock Management, and picking one fills
          in its category and unit. What is on the shelf is shown as you type; a
          quantity above it is allowed, and the hand-over will simply be partial
          when it happens.
        </DocsStep>
        <DocsStep title="Add another item if you need to.">
          Each item becomes its own card, with its own reference, so a request
          still holds exactly one medicine.
        </DocsStep>
        <DocsStep title="Record who it is for — or leave it blank.">
          The requestor and reason are what the approver uses to decide. Leave
          the requestor blank for a counter walk-in; the card reads “Walk-in”.
        </DocsStep>
        <DocsStep title="Submit.">
          Cards land in Pending with the time they arrived. Turn on “Start in
          Ready to Claim” to skip the approval steps for a walk-in hand-over —
          the history still shows the skip.
        </DocsStep>
      </DocsSteps>
      <DocsCallout title="A medicine that is not stocked cannot be requested">
        If nothing in Stock Management matches what you typed, the form will not
        submit: there would be no stock to deduct at hand-over. Stock the item
        in first, or pick the closest match.
      </DocsCallout>

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
          from Ready to Claim at hand-over. Nothing moves until you confirm, and
          the confirmation shows the plan: which batch leaves the shelf, how
          much is left afterwards, and how much stays on the card if the request
          is larger than stock on hand.
        </DocsStep>
        <DocsStep title="Deny">
          from Pending or Approved. A reason is required and stays on the card.
        </DocsStep>
        <DocsStep title="Cancel">
          from Pending only, when a request was raised in error. It deletes the
          card and its history, so Deny is the better answer when the request
          was refused rather than withdrawn.
        </DocsStep>
        <DocsStep title="Re-open → Pending">
          from Denied, when the request can be reconsidered.
        </DocsStep>
      </DocsSteps>

      <DocsSubHeading>When a move is refused</DocsSubHeading>
      <DocsP>
        A card can always be picked up, but not every column can take it. While
        you drag, columns that cannot accept the card fade and the cursor turns
        into a “can’t drop” arrow; hold the card over one and its header says so
        in words. Letting go returns the card to where it came from and explains
        the rule, along with the legal way to get where you were going.
      </DocsP>
      <DocsSteps>
        <DocsStep title="Claimed is the end of the flow.">
          A handed-over request has already moved stock and been recorded. It
          cannot be moved back — use{" "}
          <DocsRoute to="/admin/dispensing">Dispensing Log</DocsRoute> to review
          the hand-over. The refusal offers that record directly.
        </DocsStep>
        <DocsStep title="A denied request goes back to Pending first.">
          Re-open puts it back in the flow; from there it can be approved again.
        </DocsStep>
        <DocsStep title="Hand-over happens from Ready to Claim.">
          Approving and preparing do not move stock. Move the card to Ready to
          Claim, then dispense it.
        </DocsStep>
      </DocsSteps>
      <DocsCallout title="Dragging across a wide board">
        Hold a card near the left or right edge and the board scrolls for you;
        near the top or bottom of a column and that column scrolls. The Denied
        rail opens on its own while you carry a card over it, so a card can be
        denied without expanding anything first.
      </DocsCallout>
      <DocsCallout title="Cards stay where you put them" tone="tip">
        Dropping a card between two others sets its place for good — the order
        is saved and survives a restart. Menu, keyboard and batch moves always
        add the card to the end of the destination column instead.
      </DocsCallout>

      <DocsCallout title="Handing over is what moves the stock" tone="tip">
        Approving and preparing reserve nothing. The quantity leaves the shelf
        at Dispense, taken from the earliest-expiring batch first, and the
        dispensing log and dashboard totals update in the same moment. There is
        no undo — a partial hand-over leaves the rest of the request in Ready to
        Claim to be dispensed later.
      </DocsCallout>

      <DocsCallout title="Working in bulk" tone="tip">
        Tick several cards in the same column to use the batch bar — Approve
        all, Prepare all, Dispense all or Deny all. A mixed selection only
        offers the moves that are valid for every card.
      </DocsCallout>
      <DocsCallout title="Clearing the Claimed column">
        The Claimed column has a <em>Clear</em> action beside its count. It asks
        for confirmation, then takes those cards off the board — nothing is
        deleted. Every hand-over, its batch and its quantity stay in the{" "}
        <DocsRoute to="/admin/dispensing">Dispensing Log</DocsRoute>.
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
