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

export function LowStockSection() {
  return (
    <DocsSection id="low-stock-alerts" title="Low-Stock Alerts">
      <DocsP>
        Every item has a{" "}
        <span className="font-medium text-foreground">threshold</span> — the
        quantity below which you do not want to run. Low-Stock Alerts compares
        what is actually on the shelf against that threshold and shows the items
        that need attention, with the information needed to order them.
      </DocsP>

      <DocsSubHeading>Reading the status</DocsSubHeading>
      <ul className="space-y-1.5">
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Out</span> — nothing on
          the shelf. Clear this first: it blocks dispensing.
        </li>
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Low</span> — below the
          threshold but not empty. Order now, before it becomes Out.
        </li>
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">In Stock</span> — above
          the threshold. Shown only when you clear the filters.
        </li>
      </ul>

      <DocsSubHeading>Building an order</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Sort by what is most urgent.">
          The status and gap columns sort, so Out of stock and the biggest
          shortfalls rise to the top.
        </DocsStep>
        <DocsStep title="Read the gap.">
          Each row shows current quantity against the threshold, and the
          shortfall between them.
        </DocsStep>
        <DocsStep title="Use the suggested quantity.">
          CMIS proposes a sensible reorder amount (roughly double the threshold,
          minus what is already there) to cover the gap without over-ordering.
        </DocsStep>
        <DocsStep title="Check the supplier.">
          The row shows who supplies the item and their typical lead time, so
          you know whether the order will land before the shelf runs dry.
        </DocsStep>
        <DocsStep title="Open the reorder sheet.">
          Add the items you are ordering, adjust quantities, then hand the sheet
          to whoever places the order.
        </DocsStep>
      </DocsSteps>

      <DocsCallout title="Thresholds are yours to tune" tone="tip">
        If an item keeps appearing here when you still have plenty, its
        threshold is too high. Use{" "}
        <span className="font-medium text-foreground">Adjust threshold</span> on
        the row — admins can set defaults for whole categories in Settings →
        Thresholds.
      </DocsCallout>
      <DocsCallout title="The sheet is a shopping list">
        Nothing is sent to a supplier from CMIS. Take the reorder sheet to
        whoever places orders, and record the delivery later with Stock In so
        these numbers come back down.
      </DocsCallout>

      <DocsP>
        Quantities update the moment stock is recorded on{" "}
        <DocsRoute to="/admin/inventory">Stock Management</DocsRoute> or
        dispensed from the Request Queue.
      </DocsP>

      <DocsFigure
        alt="Low-Stock Alerts list showing Out and Low items with current quantity, threshold gap, suggested reorder quantity and supplier"
        caption="Low-Stock Alerts: status, gap to threshold, suggested order quantity and supplier lead time per item."
      />
    </DocsSection>
  );
}
