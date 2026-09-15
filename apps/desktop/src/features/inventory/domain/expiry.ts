import type {
  ExpiryRow,
  ExpiryStatus,
  InventoryItem,
  MinimapBucket,
} from "../types";
import { EXPIRY_THRESHOLDS } from "../types";

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
  rows.sort((a, b) => a.daysUntil - b.daysUntil);
  return rows;
}

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
