import type { DbLike } from "./db-like";

/**
 * What deleting a product would actually destroy, counted before the modal
 * opens (spec §7.7) — the warning shows numbers, not adjectives.
 */
export interface ItemImpact {
  batchCount: number;
  dispensingCount: number;
  totalQty: number;
}

interface BatchAggregate {
  c: number;
  item_id: string;
  units: number;
}

interface EventAggregate {
  c: number;
  item_id: string;
}

function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}

export async function fetchItemImpact(
  db: DbLike,
  itemIds: string[]
): Promise<Map<string, ItemImpact>> {
  const impact = new Map<string, ItemImpact>();
  const ids = [...new Set(itemIds)].filter((id) => id !== "");
  if (ids.length === 0) {
    return impact;
  }
  const marks = placeholders(ids.length);
  const batches = await db.select<BatchAggregate[]>(
    `SELECT item_id, COUNT(*) AS c, COALESCE(SUM(qty), 0) AS units FROM inventory_batches WHERE item_id IN (${marks}) GROUP BY item_id`,
    ids
  );
  const events = await db.select<EventAggregate[]>(
    `SELECT item_id, COUNT(*) AS c FROM dispensing_events WHERE item_id IN (${marks}) GROUP BY item_id`,
    ids
  );

  for (const id of ids) {
    impact.set(id, { batchCount: 0, dispensingCount: 0, totalQty: 0 });
  }
  for (const row of batches) {
    const entry = impact.get(row.item_id);
    if (entry) {
      entry.batchCount = row.c;
      entry.totalQty = row.units;
    }
  }
  for (const row of events) {
    const entry = impact.get(row.item_id);
    if (entry) {
      entry.dispensingCount = row.c;
    }
  }
  return impact;
}

export function sumImpact(impacts: ItemImpact[]): ItemImpact {
  return impacts.reduce<ItemImpact>(
    (total, current) => ({
      batchCount: total.batchCount + current.batchCount,
      dispensingCount: total.dispensingCount + current.dispensingCount,
      totalQty: total.totalQty + current.totalQty,
    }),
    { batchCount: 0, dispensingCount: 0, totalQty: 0 }
  );
}

export function describeImpact(impact: ItemImpact): string {
  const batches = `${impact.batchCount} ${impact.batchCount === 1 ? "batch" : "batches"}`;
  const records = `${impact.dispensingCount} ${impact.dispensingCount === 1 ? "dispensing record" : "dispensing records"}`;
  return `${batches} · ${impact.totalQty} units · ${records}`;
}
