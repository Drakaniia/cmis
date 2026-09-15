import type {
  InventoryItem,
  LowStockRow,
  LowStockStatus,
  SupplierInfo,
} from "../types";

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

export function calculateGap(currentQty: number, threshold: number): number {
  return threshold - currentQty;
}

export function calculateGapPercent(
  currentQty: number,
  threshold: number
): number {
  if (threshold <= 0) {
    return currentQty > 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, (currentQty / threshold) * 100));
}

export function calculateSuggestedQty(
  currentQty: number,
  threshold: number
): number {
  return Math.max(threshold * 2 - currentQty, threshold);
}

export const LOW_STOCK_STATUS_CONFIG: Record<
  LowStockStatus,
  { badgeClass: string; barColor: string; edgeColor: string; label: string }
> = {
  "in-stock": {
    badgeClass: "bg-muted/50 text-muted-foreground",
    barColor: "#A0AEC0",
    edgeColor: "transparent",
    label: "In Stock",
  },
  "low-stock": {
    badgeClass: "bg-[var(--warning)]/10 text-[var(--warning)]",
    barColor: "#ED8936",
    edgeColor: "#ED8936",
    label: "Low",
  },
  "out-of-stock": {
    badgeClass: "bg-destructive/10 text-destructive",
    barColor: "#E53E3E",
    edgeColor: "#E53E3E",
    label: "Out",
  },
};

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
