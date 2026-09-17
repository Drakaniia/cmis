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

export function DispensingSection() {
  return (
    <DocsSection id="dispensing-log" title="Dispensing Log">
      <DocsP>
        The Dispensing Log is the permanent record of what left the clinic: the
        medicine, how much, the batch it came from, who claimed it and when. It
        is read-only — entries are written when a request is dispensed, so the
        log cannot drift away from what actually happened.
      </DocsP>

      <DocsSubHeading>Recording a dispensing</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Prepare the request.">
          On the Request Queue, move the card to Ready to Claim once the items
          are packed.
        </DocsStep>
        <DocsStep title="Dispense at hand-over.">
          Use Dispense → Claimed on the card, the primary button in the card’s
          detail view, or drag the card into the Claimed column. Dragging asks
          for the same confirmation rather than moving the card on its own.
        </DocsStep>
        <DocsStep title="Read the plan and confirm it.">
          CMIS picks the batches for you, earliest expiry first, and the
          confirmation states what will happen before anything moves: which
          batch, how much is taken, and how much is left on the shelf
          afterwards.
        </DocsStep>
        <DocsStep title="Check the totals.">
          Stock is reduced, the request moves to Claimed and the entry appears
          here immediately. If the request asked for more than is on hand, only
          what exists is taken and the card stays in Ready to Claim with the
          remainder.
        </DocsStep>
      </DocsSteps>

      <DocsCallout title="Expired batches are not offered" tone="warning">
        A batch past its expiry date can never be dispensed — it is excluded
        before the plan is built, not warned about afterwards. If the batch you
        are holding was pulled from the shelf, dispose of it and record the
        replacement instead.
      </DocsCallout>

      <DocsCallout title="One request can be dispensed more than once">
        A partial hand-over is a real, recorded event: it gets its own row in
        this log, and the card keeps its remaining quantity in Ready to Claim
        for the next visit. Open the request to see every hand-over it has had.
      </DocsCallout>

      <DocsSubHeading>Looking something up</DocsSubHeading>
      <DocsP>
        Search by requestor, medicine or batch number, and filter by date range
        or status to answer questions like “what was dispensed last Tuesday?” or
        “who received the last of this batch?”. Open a row for the full detail,
        including the request it came from and the batches that were used.
      </DocsP>

      <DocsSubHeading>Exports</DocsSubHeading>
      <DocsP>
        Use <span className="font-medium text-foreground">Export CSV</span> to
        save exactly what the current filters show — that is the file to hand
        over for a stock audit or a monthly report. The export is a snapshot:
        changing the filters afterwards does not change the file you saved.
      </DocsP>

      <DocsFigure
        alt="Dispensing Log table listing medicine, quantity, batch, requestor and dispensing time, with search and date filters above"
        caption="The Dispensing Log: one row per dispensed request, with filters and CSV export."
      />
      <DocsP>
        Totals, trends and category breakdowns live on{" "}
        <DocsRoute to="/admin/reports">Reports &amp; Analytics</DocsRoute>.
      </DocsP>
    </DocsSection>
  );
}
