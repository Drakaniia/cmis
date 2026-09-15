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

export function StockSection() {
  return (
    <DocsSection id="stock-management" title="Stock Management">
      <DocsP>
        Stock Management is the shelf itself. Every medicine is an{" "}
        <span className="font-medium text-foreground">item</span>, and each
        delivery of that item is a{" "}
        <span className="font-medium text-foreground">batch</span> with its own
        quantity, batch number, supplier and expiry date. Keeping batches apart
        is what lets the Expiry Alerts page tell you exactly which box to pull
        off the shelf first.
      </DocsP>

      <DocsSubHeading>Record a delivery (Stock In)</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Open Stock Management.">
          Use the sidebar, or press <DocsKey>Ctrl</DocsKey> <DocsKey>K</DocsKey>{" "}
          and type “stock”.
        </DocsStep>
        <DocsStep title="Choose Stock In.">
          The button sits at the top right of the list.
        </DocsStep>
        <DocsStep title="Find the item.">
          Scan the barcode or type the SKU — the wizard fills in the name,
          category, unit and current quantity for you. If nothing matches,
          choose “New item” and type the details once.
        </DocsStep>
        <DocsStep title="Enter the batch.">
          Batch number, expiry date, quantity received and supplier. The expiry
          date is required: it drives every alert in the app.
        </DocsStep>
        <DocsStep title="Confirm.">
          The quantity is added to the item, the batch appears under it, and the
          movement is written to the audit log.
        </DocsStep>
      </DocsSteps>
      <DocsCallout title="Expiry date is not the delivery date" tone="warning">
        Type the date printed on the box (month and year are enough). A wrong
        year here is the most common cause of a medicine showing up as expired.
      </DocsCallout>

      <DocsSubHeading>Take stock out</DocsSubHeading>
      <DocsP>
        Use <span className="font-medium text-foreground">Stock Out</span> for
        anything leaving the shelf outside of a request: transfers, corrections
        after a physical count, or stock handed to another station. Pick the
        item, pick the batch (the wizard suggests the earliest expiry first),
        enter the quantity and confirm.
      </DocsP>

      <DocsSubHeading>Fix a mistake, or remove a batch</DocsSubHeading>
      <DocsP>
        Open an item in the list to see its batches and history. From a batch
        row you can:
      </DocsP>
      <ul className="space-y-1.5">
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">
            Extend / correct expiry
          </span>{" "}
          — for a date that was typed wrong. The old and new dates are both kept
          in the audit log.
        </li>
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Dispose</span> — for
          stock that is expired, damaged or recalled. Disposed batches leave the
          shelf but stay in the record with the reason you chose.
        </li>
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Adjust threshold</span>{" "}
          — the level at which this item appears on{" "}
          <DocsRoute to="/admin/inventory/low-stock">
            Low-Stock Alerts
          </DocsRoute>
          .
        </li>
      </ul>

      <DocsCallout title="Search and filter">
        Type in the search box to narrow by name or SKU, and use the category
        filter for a whole group. The filters follow you between Inventory pages
        while you work.
      </DocsCallout>

      <DocsFigure
        alt="Stock Management list with an item expanded to show its batches, quantities and expiry dates"
        caption="An item in Stock Management, showing its batches and the actions available on each one."
      />
    </DocsSection>
  );
}
