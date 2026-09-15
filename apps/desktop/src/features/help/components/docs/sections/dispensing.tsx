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
          Use Dispense → Claimed on the card, or the primary button in the
          card’s detail view.
        </DocsStep>
        <DocsStep title="Confirm the batch and quantity.">
          CMIS suggests the batch that expires soonest; change it if you pulled
          a different box. The quantity is checked against stock before it is
          accepted.
        </DocsStep>
        <DocsStep title="Check the totals.">
          Stock is reduced, the request moves to Claimed and the entry appears
          here immediately.
        </DocsStep>
      </DocsSteps>

      <DocsCallout title="Expired batches are not offered" tone="warning">
        A batch past its expiry date cannot be dispensed. If the batch you are
        holding was pulled from the shelf, dispose of it and record the
        replacement batch instead.
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
