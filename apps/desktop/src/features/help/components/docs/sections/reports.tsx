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

export function StockReportSection() {
  return (
    <DocsSection id="stock-report" title="Stock Report">
      <DocsP>
        The Stock Report is a document, not a dashboard: every medicine on the
        shelf with its full standing, grouped by category, with a month summary
        above it. It is the page to hand to someone — on screen, through the
        system print dialog, or as a saved PDF.
      </DocsP>

      <DocsSubHeading>Reading the summary</DocsSubHeading>
      <DocsP>
        Three groups of figures sit at the top. <strong>Stock totals</strong>{" "}
        and <strong>shelf health</strong> are the live snapshot — how many
        medicines, units and categories, and how many are low, out of stock,
        expiring within 30 or 90 days, or already expired.{" "}
        <strong>This month</strong> is the only group the month picker drives:
        units received and units dispensed. The card is stamped “Stock as of …”
        so a screenshot can never be mistaken for historical stock.
      </DocsP>

      <DocsSubHeading>Choosing the month and category</DocsSubHeading>
      <DocsSteps>
        <DocsStep title="Step to a month.">
          The ‹ › controls move one month at a time; the forward control stops
          at the current month, and “Current month” brings you back. Stock
          figures stay live — only the in and out totals follow the month.
        </DocsStep>
        <DocsStep title="Filter by category.">
          Choosing a category narrows the summary, the groups and the printed
          document at once. “All categories” shows everything.
        </DocsStep>
        <DocsStep title="Search and sort.">
          Search matches medicine, SKU or category. Sortable columns reorder the
          rows inside each category — the categories themselves stay in
          alphabetical order.
        </DocsStep>
      </DocsSteps>

      <DocsSubHeading>The grouped list</DocsSubHeading>
      <DocsP>
        Each category is its own section with a subtotal strip — medicines,
        units on hand, low, out and the nearest expiry — closed by a grand total
        that matches the summary above. Every column is a medicine's standing:
        form and strength, on-hand units, the packed equivalent, reorder
        threshold, status, nearest expiry and how many batches back it.
      </DocsP>

      <DocsSubHeading>Printing and saving</DocsSubHeading>
      <DocsP>
        <span className="font-medium text-foreground">Print</span> opens the
        system print dialog with the window chrome stripped away and every
        category present — its own “Save as PDF” produces the document.{" "}
        <span className="font-medium text-foreground">Save as PDF</span> writes
        the same report through the app itself as an A4 landscape file into
        Documents. The report honours the active category filter, so what prints
        matches what you see.
      </DocsP>

      <DocsSubHeading>Exporting the workbook</DocsSubHeading>
      <DocsP>
        <span className="font-medium text-foreground">Export</span> writes the
        medicines on screen as an Excel workbook laid out like the inventory
        template — the same file the app imports, so exporting and re-importing
        reproduces the same items, pack pairs and month figures. The day columns
        follow the selected month (28 to 31 days), and the file honours the
        category filter, the search box and the sort order. A second sheet
        carries the month summary with its context, and the save dialog defaults
        to Documents.
      </DocsP>

      <DocsCallout title="An em dash is not a zero" tone="tip">
        A month with no deliveries and no dispensing shows — for both figures. A
        month that received something but dispensed nothing shows a real 0.
      </DocsCallout>
      <DocsCallout title="Stock is live, the month is not" tone="note">
        The month picker changes only the “This month” figures. The medicine
        list and the health counts are the current snapshot, on both screen and
        paper.
      </DocsCallout>

      <DocsFigure
        alt="Stock Report showing the month stepper and category filter above a summary card and a list of medicines grouped by category with subtotals"
        caption="Stock Report: a month summary, then every medicine grouped by category with its subtotal."
      />
      <DocsP>
        Charts and trends — movement, expiry timeline, usage, top dispensed and
        fulfilment — live on{" "}
        <DocsRoute to="/admin/analytics">Analytics</DocsRoute>. Expiry and
        low-stock levels have their own working pages:{" "}
        <DocsRoute to="/admin/inventory/expiry">Expiry Alerts</DocsRoute> and{" "}
        <DocsRoute to="/admin/inventory/low-stock">Low-Stock Alerts</DocsRoute>.
      </DocsP>
    </DocsSection>
  );
}
