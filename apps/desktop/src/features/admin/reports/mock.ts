/**
 * CMIS-UI-07 — synthetic report data.
 * Admin-only: all branches aggregated. Values are deterministic per
 * preset+category so filters feel responsive but not random.
 */
import { INVENTORY_CATEGORIES } from "@/features/inventory/types";
import type {
  CategoryUsage,
  ExpiryBucket,
  FulfillmentPoint,
  LowStockPoint,
  StockMovementPoint,
  TopDispensedRow,
} from "./types";

function seeded(seed: string, i: number): number {
  let h = 2_166_136_261;
  const s = `${seed}:${i}`;
  for (let c = 0; c < s.length; c += 1) {
    h ^= s.charCodeAt(c);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0) / 4_294_967_295;
}

function fmtLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
}

function rangeDays(preset: string): number {
  switch (preset) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "1y":
      return 180; // cap 1y display to 180 points for perf; labeled Year
    default:
      return 30;
  }
}

export function mockStockMovement(
  preset: string,
  category: string
): StockMovementPoint[] {
  const days = rangeDays(preset);
  const points: StockMovementPoint[] = [];
  const catBias = category === "All" ? 0 : seeded(category, 99) * 6 - 3;
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const r1 = seeded(`in:${preset}:${category}`, i);
    const r2 = seeded(`out:${preset}:${category}`, i + 100);
    // Weekly seasonality
    const wave = Math.sin((i / 7) * Math.PI * 2) * 2;
    points.push({
      date: d.toISOString().slice(0, 10),
      in: Math.max(0, Math.round(8 + r1 * 14 + wave + catBias)),
      label: fmtLabel(d),
      out: Math.max(0, Math.round(6 + r2 * 12 + wave * 0.6 + catBias * 0.7)),
    });
  }
  return points;
}

export function mockLowStockTrend(
  preset: string,
  category: string
): LowStockPoint[] {
  const days = rangeDays(preset);
  const points: LowStockPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const r = seeded(`low:${preset}:${category}`, i);
    // Stress trend: gently rising toward now
    const trend = (days - i) * 0.03;
    points.push({
      count: Math.max(1, Math.round(4 + r * 8 + trend)),
      date: d.toISOString().slice(0, 10),
      label: fmtLabel(d),
    });
  }
  return points;
}

export function mockExpiryBuckets(category: string): ExpiryBucket[] {
  const now = new Date();
  const buckets: ExpiryBucket[] = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const r = seeded(`exp:${category}`, i);
    const count = Math.max(0, Math.round(r * 18));
    let urgency: ExpiryBucket["urgency"] = "caution";
    if (i <= 1) {
      urgency = "danger";
    } else if (i <= 3) {
      urgency = "warn";
    }
    buckets.push({
      count,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      urgency,
    });
  }
  return buckets;
}

const CHART_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "hsl(var(--muted-foreground) / 0.6)",
];

export function mockUsageByCategory(
  category: string,
  preset = "30d"
): CategoryUsage[] {
  if (category !== "All") {
    return [
      {
        category,
        color: CHART_VARS[0],
        value: 100,
      },
    ];
  }
  return INVENTORY_CATEGORIES.slice(0, 6).map((cat, i) => {
    // Use category-specific seed — previous `seeded("usage", i)` produced
    // near-identical r≈0.60 for i=0..5 → 131-133 → 17% each. Mixing the
    // category name (and preset) gives proper spread and preset reactivity.
    const r = seeded(`usage:${preset}:${cat}`, i);
    return {
      category: cat,
      color: CHART_VARS[i % CHART_VARS.length],
      // 30-200 range ensures visible variance without tiny slivers
      value: Math.round(30 + r * 170),
    };
  });
}

export function mockFulfillment(category: string): FulfillmentPoint[] {
  const cats =
    category === "All" ? INVENTORY_CATEGORIES.slice(0, 6) : [category];
  return cats.map((cat, i) => {
    const r = seeded(`fulfill:${category}`, i);
    const requested = Math.round(40 + r * 80);
    const dispensed = Math.round(
      requested * (0.72 + seeded(`rate:${cat}`, i) * 0.25)
    );
    return {
      category: cat,
      dispensed,
      label: cat.slice(0, 4),
      requested,
    };
  });
}

const TOP_BASE: Omit<TopDispensedRow, "qty">[] = [
  {
    category: "Analgesic",
    id: "inv-001",
    name: "Paracetamol 500mg",
    sku: "SKU-001",
  },
  {
    category: "Antibiotic",
    id: "inv-002",
    name: "Amoxicillin 500mg",
    sku: "SKU-002",
  },
  {
    category: "Supplement",
    id: "inv-005",
    name: "Vitamin B Complex",
    sku: "SKU-005",
  },
  { category: "Gastro", id: "inv-007", name: "Loperamide 2mg", sku: "SKU-007" },
  {
    category: "Antiseptic",
    id: "inv-015",
    name: "Povidone Iodine 10% 60ml",
    sku: "SKU-015",
  },
  {
    category: "Antibiotic",
    id: "inv-012",
    name: "Cotrimoxazole 480mg",
    sku: "SKU-012",
  },
  {
    category: "First Aid",
    id: "inv-008",
    name: "Gauze Pads 10x10",
    sku: "SKU-008",
  },
];

export function mockTopDispensed(
  category: string,
  preset: string
): TopDispensedRow[] {
  const filtered =
    category === "All"
      ? TOP_BASE
      : TOP_BASE.filter((r) => r.category === category);
  const source = filtered.length > 0 ? filtered : TOP_BASE.slice(0, 5);
  return source
    .slice(0, 5)
    .map((row, i) => {
      const r = seeded(`top:${preset}:${category}`, i);
      return { ...row, qty: Math.round(22 + r * 90 + (5 - i) * 6) };
    })
    .sort((a, b) => b.qty - a.qty);
}
