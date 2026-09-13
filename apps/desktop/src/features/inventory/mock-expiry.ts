import type {
  ExpiryRow,
  ExpiryStatus,
  InventoryItem,
  MinimapBucket,
} from "./types";
import { EXPIRY_THRESHOLDS } from "./types";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysUntilExpiry(iso: string): number {
  const now = new Date();
  const exp = new Date(iso);
  const diff = exp.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function expiryLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** CMIS-UI-03 §2.1 — Classify expiry into urgency status */
export function classifyExpiry(daysUntil: number): ExpiryStatus {
  if (daysUntil < 0) {
    return "expired";
  }
  if (daysUntil <= EXPIRY_THRESHOLDS.soon) {
    return "expiring-soon";
  }
  if (daysUntil <= EXPIRY_THRESHOLDS.later) {
    return "expiring-later";
  }
  return "safe";
}

/** CMIS-UI-03 §2.1 — Relative expiry text */
export function relativeExpiryText(daysUntil: number): string {
  if (daysUntil < 0) {
    return `expired ${Math.abs(daysUntil)}d ago`;
  }
  if (daysUntil === 0) {
    return "expires today";
  }
  if (daysUntil === 1) {
    return "expires tomorrow";
  }
  return `in ${daysUntil}d`;
}

/** CMIS-UI-03 §2.1 — Status config for bar color, badge, icon */
export const EXPIRY_STATUS_CONFIG: Record<
  ExpiryStatus,
  { barColor: string; badgeClass: string; label: string }
> = {
  expired: {
    badgeClass: "bg-destructive/10 text-destructive",
    barColor: "#E53E3E",
    label: "Expired",
  },
  "expiring-later": {
    badgeClass: "bg-muted text-muted-foreground",
    barColor: "#ECC94B",
    label: "Expiring Later",
  },
  "expiring-soon": {
    badgeClass: "bg-[var(--warning)]/10 text-[var(--warning)]",
    barColor: "#ED8936",
    label: "Expiring Soon",
  },
  safe: {
    badgeClass: "bg-muted/50 text-muted-foreground",
    barColor: "transparent",
    label: "Safe",
  },
};

/** Build expiry rows from inventory items — one row per batch */
export function buildExpiryRows(items: InventoryItem[]): ExpiryRow[] {
  const rows: ExpiryRow[] = [];
  for (const item of items) {
    for (const batch of item.batches) {
      const daysUntil = daysUntilExpiry(batch.expiry);
      rows.push({
        batch,
        daysUntil,
        expiryStatus: classifyExpiry(daysUntil),
        item,
      });
    }
  }
  // Sort by expiry ascending (soonest first) — CMIS-UI-03 §3 default sort
  rows.sort((a, b) => a.daysUntil - b.daysUntil);
  return rows;
}

/** Build minimap buckets — 12 monthly buckets from current month */
export function buildMinimapBuckets(rows: ExpiryRow[]): MinimapBucket[] {
  const now = new Date();
  const buckets: MinimapBucket[] = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short" });
    const count = rows.filter((r) => {
      const exp = new Date(r.batch.expiry);
      return (
        exp.getFullYear() === d.getFullYear() && exp.getMonth() === d.getMonth()
      );
    }).length;
    buckets.push({ count, label, monthKey });
  }
  return buckets;
}

/** Mock expiry-specific inventory items (with batches at various expiry dates) */
export const mockExpiryInventory: InventoryItem[] = [
  {
    barcode: "8901000123458",
    batches: [
      {
        batch: "B-2025-09",
        expiry: daysFromNow(-11),
        qty: 12,
        supplier: "PharmaCorp",
      },
    ],
    category: "Analgesic",
    dispensingHistory: [],
    expiry: daysFromNow(-11),
    id: "exp-001",
    name: "Ibuprofen 400mg",
    qty: 12,
    sku: "SKU-003",
    status: "expiring",
    supplier: "PharmaCorp",
    threshold: 10,
  },
  {
    barcode: "8901000123466",
    batches: [
      {
        batch: "B-2025-12",
        expiry: daysFromNow(-3),
        qty: 8,
        supplier: "PharmaCorp",
      },
      {
        batch: "B-2026-06",
        expiry: daysFromNow(180),
        qty: 30,
        supplier: "PharmaCorp",
      },
    ],
    category: "Antihistamine",
    dispensingHistory: [],
    expiry: daysFromNow(-3),
    id: "exp-002",
    name: "Cetirizine 10mg",
    qty: 38,
    sku: "SKU-009",
    status: "expiring",
    supplier: "PharmaCorp",
    threshold: 15,
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
    id: "exp-003",
    name: "Amoxicillin 500mg",
    qty: 8,
    sku: "SKU-002",
    status: "low",
    supplier: "MedSupply Co",
    threshold: 15,
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
    id: "exp-004",
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
        batch: "B-2026-09",
        expiry: daysFromNow(18),
        qty: 22,
        supplier: "HealthPlus",
      },
    ],
    category: "Antiseptic",
    dispensingHistory: [],
    expiry: daysFromNow(18),
    id: "exp-005",
    name: "Alcohol 70% 500ml",
    qty: 22,
    sku: "SKU-004",
    status: "expiring",
    supplier: "HealthPlus",
    threshold: 15,
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
    id: "exp-006",
    name: "Cotrimoxazole 480mg",
    qty: 11,
    sku: "SKU-012",
    status: "low",
    supplier: "MedSupply Co",
    threshold: 20,
  },
  {
    barcode: "8901000123456",
    batches: [
      {
        batch: "B-2025-11",
        expiry: daysFromNow(45),
        qty: 40,
        supplier: "PharmaCorp",
      },
      {
        batch: "B-2026-04",
        expiry: daysFromNow(248),
        qty: 80,
        supplier: "PharmaCorp",
      },
    ],
    category: "Analgesic",
    dispensingHistory: [],
    expiry: daysFromNow(45),
    id: "exp-007",
    name: "Paracetamol 500mg",
    qty: 120,
    sku: "SKU-001",
    status: "in",
    supplier: "PharmaCorp",
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
    id: "exp-008",
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
        batch: "B-2026-13",
        expiry: daysFromNow(95),
        qty: 34,
        supplier: "HealWell",
      },
    ],
    category: "Supplement",
    dispensingHistory: [],
    expiry: daysFromNow(95),
    id: "exp-009",
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
        batch: "B-2026-10",
        expiry: daysFromNow(200),
        qty: 65,
        supplier: "VitaLabs",
      },
    ],
    category: "Supplement",
    dispensingHistory: [],
    expiry: daysFromNow(200),
    id: "exp-010",
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
        batch: "B-2026-15",
        expiry: daysFromNow(180),
        qty: 90,
        supplier: "DermCare",
      },
    ],
    category: "Antiseptic",
    dispensingHistory: [],
    expiry: daysFromNow(180),
    id: "exp-011",
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
        batch: "B-2026-03",
        expiry: daysFromNow(320),
        qty: 140,
        supplier: "GastroMed",
      },
    ],
    category: "Gastro",
    dispensingHistory: [],
    expiry: daysFromNow(320),
    id: "exp-012",
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
        batch: "B-2026-07",
        expiry: daysFromNow(5),
        qty: 4,
        supplier: "MediCore",
      },
    ],
    category: "Respiratory",
    dispensingHistory: [],
    expiry: daysFromNow(5),
    id: "exp-013",
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
        batch: "B-2026-08",
        expiry: daysFromNow(210),
        qty: 55,
        supplier: "ORS Labs",
      },
    ],
    category: "Supplement",
    dispensingHistory: [],
    expiry: daysFromNow(210),
    id: "exp-014",
    name: "ORS Sachet",
    qty: 55,
    sku: "SKU-010",
    status: "in",
    supplier: "ORS Labs",
    threshold: 20,
  },
];
