import type {
  CategoryUsage,
  ExpiryBucket,
  FulfillmentPoint,
  LowStockPoint,
  StockMovementPoint,
  TopDispensedRow,
} from "./types";

function cell(v: string): string {
  return `"${v.replaceAll('"', '""')}"`;
}

function section(title: string, headers: string[], rows: string[][]): string {
  const out: string[] = [];
  out.push(cell(title));
  out.push(headers.map(cell).join(","));
  for (const r of rows) {
    out.push(r.map(cell).join(","));
  }
  out.push("");
  return out.join("\n");
}

export function buildReportsCsv(input: {
  category: string;
  expiry: ExpiryBucket[];
  fulfillment: FulfillmentPoint[];
  lowStock: LowStockPoint[];
  movement: StockMovementPoint[];
  preset: string;
  top: TopDispensedRow[];
  usage: CategoryUsage[];
}): string {
  const meta = section(
    "Filters",
    ["Preset", "Category"],
    [[input.preset, input.category]]
  );
  const movement = section(
    "Stock Movement",
    ["Date", "Label", "In", "Out"],
    input.movement.map((p) => [p.date, p.label, String(p.in), String(p.out)])
  );
  const low = section(
    "Low-Stock Trend",
    ["Date", "Label", "Count"],
    input.lowStock.map((p) => [p.date, p.label, String(p.count)])
  );
  const expiry = section(
    "Expiry Timeline",
    ["Month", "Count", "Urgency"],
    input.expiry.map((b) => [b.label, String(b.count), b.urgency])
  );
  const usage = section(
    "Usage by Category",
    ["Category", "Value"],
    input.usage.map((u) => [u.category, String(u.value)])
  );
  const fulfil = section(
    "Dispensed vs Requested",
    ["Category", "Requested", "Dispensed"],
    input.fulfillment.map((f) => [
      f.category,
      String(f.requested),
      String(f.dispensed),
    ])
  );
  const top = section(
    "Top Dispensed",
    ["Name", "SKU", "Category", "Qty"],
    input.top.map((r) => [r.name, r.sku, r.category, String(r.qty)])
  );
  return [meta, movement, low, expiry, usage, fulfil, top].join("\n");
}

export function downloadReportsCsv(
  data: Parameters<typeof buildReportsCsv>[0],
  fileName: string
): void {
  const blob = new Blob([buildReportsCsv(data)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
