import type {
  InventoryItem,
  LowStockRow,
  LowStockStatus,
  SupplierInfo,
} from "./types";

// ─── CMIS-UI-04 §2.1 — Classification ─────────────────────────────────────

/** Classify an item into low-stock status based on current qty vs threshold */
export function classifyLowStock(
  currentQty: number,
  threshold: number
): LowStockStatus {
  if (currentQty === 0) {
    return "out-of-stock";
  }
  if (currentQty < threshold) {
    return "low-stock";
  }
  return "in-stock";
}

/** Calculate gap (threshold - current) — positive means under threshold */
export function calculateGap(currentQty: number, threshold: number): number {
  return threshold - currentQty;
}

/** Calculate gap fill percentage for the inline bar: current / threshold * 100, clamped */
export function calculateGapPercent(
  currentQty: number,
  threshold: number
): number {
  if (threshold <= 0) {
    return currentQty > 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, (currentQty / threshold) * 100));
}

/** CMIS-UI-04 §3.1 — Reorder suggestion: max(threshold*2 - current, threshold) */
export function calculateSuggestedQty(
  currentQty: number,
  threshold: number
): number {
  return Math.max(threshold * 2 - currentQty, threshold);
}

// ─── CMIS-UI-04 §2.1 — Status config ──────────────────────────────────────

export const LOW_STOCK_STATUS_CONFIG: Record<
  LowStockStatus,
  { badgeClass: string; barColor: string; edgeColor: string; label: string }
> = {
  "in-stock": {
    badgeClass: "bg-muted/50 text-muted-foreground",
    barColor: "#A0AEC0", // neutral gray
    edgeColor: "transparent",
    label: "In Stock",
  },
  "low-stock": {
    badgeClass: "bg-[var(--warning)]/10 text-[var(--warning)]",
    barColor: "#ED8936", // orange
    edgeColor: "#ED8936", // amber left edge
    label: "Low",
  },
  "out-of-stock": {
    badgeClass: "bg-destructive/10 text-destructive",
    barColor: "#E53E3E", // red
    edgeColor: "#E53E3E", // red left edge
    label: "Out",
  },
};

// ─── CMIS-UI-04 §3.2 — Supplier lead time hints ────────────────────────────

export const SUPPLIER_LEAD_TIMES: SupplierInfo[] = [
  { leadTimeDays: 3, name: "PharmaCorp" },
  { leadTimeDays: 5, name: "MedSupply Co" },
  { leadTimeDays: 2, name: "HealthPlus" },
  { leadTimeDays: 7, name: "VitaLabs" },
  { leadTimeDays: 4, name: "MediCore" },
  { leadTimeDays: 6, name: "GastroMed" },
  { leadTimeDays: 3, name: "FirstAid Co" },
  { leadTimeDays: 5, name: "ORS Labs" },
  { leadTimeDays: 4, name: "HealWell" },
  { leadTimeDays: 3, name: "DermCare" },
];

export function getLeadTime(supplier: string): number | undefined {
  return SUPPLIER_LEAD_TIMES.find((s) => s.name === supplier)?.leadTimeDays;
}

// ─── CMIS-UI-04 §2 — Build low-stock rows ──────────────────────────────────

export function buildLowStockRows(items: InventoryItem[]): LowStockRow[] {
  return items.map((item) => {
    const lowStockStatus = classifyLowStock(item.qty, item.threshold);
    const gap = calculateGap(item.qty, item.threshold);
    const gapPercent = calculateGapPercent(item.qty, item.threshold);
    const suggestedQty = calculateSuggestedQty(item.qty, item.threshold);
    return {
      currentQty: item.qty,
      gap,
      gapPercent,
      item,
      lowStockStatus,
      suggestedQty,
      threshold: item.threshold,
    };
  });
}

// ─── Mock inventory items for low-stock testing ─────────────────────────────

export const mockLowStockItems: InventoryItem[] = [
  {
    barcode: "8901000123456",
    batches: [
      {
        batch: "B-2026-04",
        expiry: daysFromNow(248),
        qty: 80,
        supplier: "PharmaCorp",
      },
      {
        batch: "B-2025-11",
        expiry: daysFromNow(45),
        qty: 40,
        supplier: "PharmaCorp",
      },
    ],
    category: "Analgesic",
    dispensingHistory: [],
    expiry: daysFromNow(45),
    id: "inv-001",
    name: "Paracetamol 500mg",
    qty: 120,
    sku: "SKU-001",
    status: "in",
    supplier: "PharmaCorp",
    threshold: 20,
  },
  {
    barcode: "8901000123457",
    batches: [
      {
        batch: "B-2026-02",
        expiry: daysFromNow(12),
        qty: 8,
        supplier: "MedSupply Co",
      },
    ],
    category: "Antibiotic",
    dispensingHistory: [],
    expiry: daysFromNow(12),
    id: "inv-002",
    name: "Amoxicillin 500mg",
    qty: 8,
    sku: "SKU-002",
    status: "low",
    supplier: "MedSupply Co",
    threshold: 15,
  },
  {
    barcode: "8901000123458",
    batches: [],
    category: "Analgesic",
    dispensingHistory: [],
    expiry: daysFromNow(90),
    id: "inv-003",
    name: "Ibuprofen 400mg",
    qty: 0,
    sku: "SKU-003",
    status: "out",
    supplier: "PharmaCorp",
    threshold: 10,
  },
  {
    batches: [
      {
        batch: "B-2026-09",
        expiry: daysFromNow(18),
        qty: 22,
        supplier: "HealthPlus",
      },
    ],
    category: "Antiseptic",
    dispensingHistory: [],
    expiry: daysFromNow(18),
    id: "inv-004",
    name: "Alcohol 70% 500ml",
    qty: 22,
    sku: "SKU-004",
    status: "in",
    supplier: "HealthPlus",
    threshold: 15,
  },
  {
    batches: [
      {
        batch: "B-2026-10",
        expiry: daysFromNow(200),
        qty: 65,
        supplier: "VitaLabs",
      },
    ],
    category: "Supplement",
    dispensingHistory: [],
    expiry: daysFromNow(200),
    id: "inv-005",
    name: "Vitamin B Complex",
    qty: 65,
    sku: "SKU-005",
    status: "in",
    supplier: "VitaLabs",
    threshold: 12,
  },
  {
    batches: [
      {
        batch: "B-2026-07",
        expiry: daysFromNow(5),
        qty: 4,
        supplier: "MediCore",
      },
    ],
    category: "Respiratory",
    dispensingHistory: [],
    expiry: daysFromNow(5),
    id: "inv-006",
    name: "Salbutamol Inhaler",
    qty: 4,
    sku: "SKU-006",
    status: "expiring",
    supplier: "MediCore",
    threshold: 10,
  },
  {
    batches: [
      {
        batch: "B-2026-03",
        expiry: daysFromNow(320),
        qty: 140,
        supplier: "GastroMed",
      },
    ],
    category: "Gastro",
    dispensingHistory: [],
    expiry: daysFromNow(320),
    id: "inv-007",
    name: "Loperamide 2mg",
    qty: 140,
    sku: "SKU-007",
    status: "in",
    supplier: "GastroMed",
    threshold: 20,
  },
  {
    batches: [
      {
        batch: "B-2026-05",
        expiry: daysFromNow(60),
        qty: 9,
        supplier: "FirstAid Co",
      },
    ],
    category: "First Aid",
    dispensingHistory: [],
    expiry: daysFromNow(60),
    id: "inv-008",
    name: "Gauze Pads 10x10",
    qty: 9,
    sku: "SKU-008",
    status: "low",
    supplier: "FirstAid Co",
    threshold: 30,
  },
  {
    batches: [
      {
        batch: "B-2025-12",
        expiry: daysFromNow(2),
        qty: 6,
        supplier: "PharmaCorp",
      },
      {
        batch: "B-2026-06",
        expiry: daysFromNow(180),
        qty: 30,
        supplier: "PharmaCorp",
      },
    ],
    category: "Analgesic",
    dispensingHistory: [],
    expiry: daysFromNow(2),
    id: "inv-009",
    name: "Cetirizine 10mg",
    qty: 36,
    sku: "SKU-009",
    status: "expiring",
    supplier: "PharmaCorp",
    threshold: 15,
  },
  {
    batches: [
      {
        batch: "B-2026-08",
        expiry: daysFromNow(210),
        qty: 55,
        supplier: "ORS Labs",
      },
    ],
    category: "Supplement",
    dispensingHistory: [],
    expiry: daysFromNow(210),
    id: "inv-010",
    name: "ORS Sachet",
    qty: 55,
    sku: "SKU-010",
    status: "in",
    supplier: "ORS Labs",
    threshold: 20,
  },
  {
    batches: [
      {
        batch: "B-2026-12",
        expiry: daysFromNow(400),
        qty: 200,
        supplier: "PharmaCorp",
      },
    ],
    category: "Analgesic",
    dispensingHistory: [],
    expiry: daysFromNow(400),
    id: "inv-011",
    name: "Mefenamic Acid 500mg",
    qty: 200,
    sku: "SKU-011",
    status: "in",
    supplier: "PharmaCorp",
    threshold: 25,
  },
  {
    batches: [
      {
        batch: "B-2026-01",
        expiry: daysFromNow(28),
        qty: 11,
        supplier: "MedSupply Co",
      },
    ],
    category: "Antibiotic",
    dispensingHistory: [],
    expiry: daysFromNow(28),
    id: "inv-012",
    name: "Cotrimoxazole 480mg",
    qty: 11,
    sku: "SKU-012",
    status: "low",
    supplier: "MedSupply Co",
    threshold: 20,
  },
  {
    batches: [
      {
        batch: "B-2026-13",
        expiry: daysFromNow(95),
        qty: 34,
        supplier: "HealWell",
      },
    ],
    category: "Supplement",
    dispensingHistory: [],
    expiry: daysFromNow(95),
    id: "inv-013",
    name: "Ferrous Sulfate 325mg",
    qty: 34,
    sku: "SKU-013",
    status: "in",
    supplier: "HealWell",
    threshold: 18,
  },
  {
    batches: [
      {
        batch: "B-2026-14",
        expiry: daysFromNow(14),
        qty: 7,
        supplier: "MediCore",
      },
    ],
    category: "Respiratory",
    dispensingHistory: [],
    expiry: daysFromNow(14),
    id: "inv-014",
    name: "Carbocisteine 500mg",
    qty: 7,
    sku: "SKU-014",
    status: "low",
    supplier: "MediCore",
    threshold: 12,
  },
  {
    batches: [
      {
        batch: "B-2026-15",
        expiry: daysFromNow(180),
        qty: 90,
        supplier: "DermCare",
      },
    ],
    category: "Antiseptic",
    dispensingHistory: [],
    expiry: daysFromNow(180),
    id: "inv-015",
    name: "Povidone Iodine 10% 60ml",
    qty: 90,
    sku: "SKU-015",
    status: "in",
    supplier: "DermCare",
    threshold: 15,
  },
  {
    batches: [
      {
        batch: "B-2026-16",
        expiry: daysFromNow(340),
        qty: 75,
        supplier: "VitaLabs",
      },
    ],
    category: "Supplement",
    dispensingHistory: [],
    expiry: daysFromNow(340),
    id: "inv-016",
    name: "Ascorbic Acid 500mg",
    qty: 75,
    sku: "SKU-016",
    status: "in",
    supplier: "VitaLabs",
    threshold: 20,
  },
  // ─── Extra low-stock items for richer demo ───────────────────────────────
  {
    batches: [
      {
        batch: "B-2026-20",
        expiry: daysFromNow(60),
        qty: 3,
        supplier: "MedSupply Co",
      },
    ],
    category: "Antibiotic",
    dispensingHistory: [],
    expiry: daysFromNow(60),
    id: "inv-017",
    name: "Metronidazole 400mg",
    qty: 3,
    sku: "SKU-017",
    status: "low",
    supplier: "MedSupply Co",
    threshold: 25,
  },
  {
    batches: [],
    category: "First Aid",
    dispensingHistory: [],
    expiry: daysFromNow(120),
    id: "inv-018",
    name: "Adhesive Bandages",
    qty: 0,
    sku: "SKU-018",
    status: "out",
    supplier: "FirstAid Co",
    threshold: 50,
  },
  {
    batches: [
      {
        batch: "B-2026-21",
        expiry: daysFromNow(90),
        qty: 6,
        supplier: "HealWell",
      },
    ],
    category: "Supplement",
    dispensingHistory: [],
    expiry: daysFromNow(90),
    id: "inv-019",
    name: "Calcium + Vitamin D",
    qty: 6,
    sku: "SKU-019",
    status: "low",
    supplier: "HealWell",
    threshold: 15,
  },
  {
    batches: [
      {
        batch: "B-2026-22",
        expiry: daysFromNow(150),
        qty: 2,
        supplier: "DermCare",
      },
    ],
    category: "Antiseptic",
    dispensingHistory: [],
    expiry: daysFromNow(150),
    id: "inv-020",
    name: "Chlorhexidine 0.12%",
    qty: 2,
    sku: "SKU-020",
    status: "low",
    supplier: "DermCare",
    threshold: 8,
  },
];

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
