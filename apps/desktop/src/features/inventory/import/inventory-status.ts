export type InventoryStatus = "in" | "low" | "out";

export function deriveStatus(qty: number, threshold: number): InventoryStatus {
  if (qty === 0) {
    return "out";
  }
  if (qty < threshold) {
    return "low";
  }
  return "in";
}

export function deriveNeedsBatch(batchesEmpty: boolean): boolean {
  return batchesEmpty;
}
