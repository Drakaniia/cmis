import type { InventoryItem } from "./types";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatExpiryLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function expiryLabel(iso: string): string {
  return formatExpiryLabel(iso);
}

export function daysUntilExpiry(iso: string): number {
  const now = new Date();
  const exp = new Date(iso);
  const diff = exp.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export const mockInventory: InventoryItem[] = [
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
    dispensingHistory: [
      {
        batch: "B-2026-04",
        date: "Sep 10, 2026",
        qty: 2,
        requestor: "Maria S.",
        staff: "Nurse Joy",
      },
      {
        batch: "B-2025-11",
        date: "Sep 08, 2026",
        qty: 5,
        requestor: "John D.",
        staff: "M. Reyes",
      },
    ],
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
    dispensingHistory: [
      {
        batch: "B-2026-02",
        date: "Sep 11, 2026",
        qty: 3,
        requestor: "Ana R.",
        staff: "J. Cruz",
      },
    ],
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
    status: "expiring",
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
    dispensingHistory: [
      {
        batch: "B-2026-07",
        date: "Sep 09, 2026",
        qty: 2,
        requestor: "Carlo M.",
        staff: "A. Lim",
      },
    ],
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
];

export const mockSuppliers = [
  "PharmaCorp",
  "MedSupply Co",
  "HealthPlus",
  "VitaLabs",
  "MediCore",
  "GastroMed",
  "FirstAid Co",
  "ORS Labs",
  "HealWell",
  "DermCare",
] as const;
