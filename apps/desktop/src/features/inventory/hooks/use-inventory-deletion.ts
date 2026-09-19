import { useCallback, useEffect, useMemo, useState } from "react";

/** Shared empty selection — a new Set each render would defeat memoisation. */
const EMPTY_SELECTION: Set<string> = new Set<string>();

import { toast } from "sonner";
import { describeImpact, type ItemImpact, sumImpact } from "../creation/impact";
import type { TrashEntry } from "../creation/trash/types";
import type { InventoryFilters, InventoryItem } from "../types";
import {
  useDeleteBatch,
  useDeleteImpact,
  useDeleteItem,
  usePurgeTrash,
  useRestoreTrash,
  useTrash,
} from "./use-trash";

/**
 * Deletion and Trash state for Stock Management (spec §7.6, §7.7).
 *
 * It lives in a hook rather than in the page because the page is already the
 * composition root for filters, wizards and panels — and because the rules here
 * are the ones worth testing on their own: selection scope, the two-step
 * confirm, and the SKU-collision path on restore.
 */

/** What the delete modal is about to act on, with consequences already counted. */
export type DeleteTarget =
  | { impact: ItemImpact; itemId: string; kind: "item"; label: string }
  | {
      batchName: string;
      itemId: string;
      kind: "batch";
      productName: string;
      qtyAfter: number;
      qtyBefore: number;
      totalQty: number;
    }
  | {
      items: { id: string; impact: ItemImpact; label: string }[];
      kind: "bulk";
    };

/** Resolves the item the delete modal is being prepared for. */
type PendingDelete = { id: string; kind: "item" } | { kind: "bulk" };

/** Real numbers, one line each — the modal never argues in prose (§7.7). */
function consequencesFor(target: DeleteTarget | null): string[] {
  if (!target) {
    return [];
  }
  if (target.kind === "batch") {
    return [
      `${target.totalQty} units will be removed`,
      `Product qty ${target.qtyBefore} → ${target.qtyAfter}`,
      "The batch row moves to Trash and can be restored",
    ];
  }
  if (target.kind === "bulk") {
    return [
      `${target.items.length} ${target.items.length === 1 ? "product" : "products"}`,
      describeImpact(sumImpact(target.items.map((entry) => entry.impact))),
      "Each moves to Trash on its own, so one failure cannot hide the rest",
    ];
  }
  return [
    target.label,
    describeImpact(target.impact),
    "Dispensing history is snapshotted, so a restore is complete",
  ];
}

function titleFor(target: DeleteTarget | null): string {
  if (!target) {
    return "Delete";
  }
  if (target.kind === "batch") {
    return `Delete batch ${target.batchName}?`;
  }
  if (target.kind === "bulk") {
    return `Delete ${target.items.length} ${target.items.length === 1 ? "product" : "products"}?`;
  }
  return `Delete ${target.label}?`;
}

function purgeTitle(entries: TrashEntry[]): string {
  if (entries.length === 0) {
    return "Delete permanently";
  }
  if (entries.length === 1) {
    return `Permanently delete ${entries[0].label}?`;
  }
  return `Permanently delete ${entries.length} entries?`;
}

function purgeLines(entries: TrashEntry[]): string[] {
  if (entries.length === 0) {
    return [];
  }
  const products = entries.filter((entry) => entry.kind === "item");
  const batches = entries.reduce(
    (sum, entry) => sum + (entry.kind === "batch" ? 1 : entry.batchCount),
    0
  );
  const records = entries.reduce(
    (sum, entry) => sum + entry.dispensingCount,
    0
  );
  const lines: string[] = [];
  if (products.length > 0) {
    lines.push(
      `${products.length} ${products.length === 1 ? "product" : "products"}`
    );
  }
  lines.push(`${batches} ${batches === 1 ? "batch" : "batches"}`);
  lines.push(`${records} dispensing ${records === 1 ? "record" : "records"}`);
  if (products.length > 0) {
    lines.push("Report totals for those products change for good");
  }
  return lines;
}

export function useInventoryDeletion({
  filters,
  filtered,
  items,
}: {
  filters: InventoryFilters;
  filtered: InventoryItem[];
  items: InventoryItem[];
}) {
  const { data: trashData } = useTrash();
  const trash = trashData ?? [];
  const deleteItemMut = useDeleteItem();
  const deleteBatchMut = useDeleteBatch();
  const restoreMut = useRestoreTrash();
  const purgeMut = usePurgeTrash();

  // The selection is stored together with the filter signature it was made
  // under: changing a filter discards it, so a row the operator can no longer
  // see can never be swept into a delete (decision 37).
  const filterSignature = `${filters.search}|${filters.category}|${filters.status}`;
  const [selection, setSelection] = useState<{
    ids: Set<string>;
    signature: string;
  }>({ ids: new Set(), signature: filterSignature });
  const selectedIds =
    selection.signature === filterSignature ? selection.ids : EMPTY_SELECTION;
  const setSelectedIds = useCallback(
    (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setSelection((prev) => ({
        ids:
          typeof next === "function"
            ? next(
                prev.signature === filterSignature ? prev.ids : EMPTY_SELECTION
              )
            : next,
        signature: filterSignature,
      }));
    },
    [filterSignature]
  );
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(
    new Set()
  );
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [purgeTargets, setPurgeTargets] = useState<TrashEntry[]>([]);
  const [skuConflict, setSkuConflict] = useState<{
    entry: TrashEntry;
    message: string;
    suggestedSku: string;
  } | null>(null);

  const impactIds = useMemo(() => {
    if (pendingDelete === null) {
      return [];
    }
    return pendingDelete.kind === "item"
      ? [pendingDelete.id]
      : [...selectedIds];
  }, [pendingDelete, selectedIds]);
  const { data: impactMap } = useDeleteImpact(impactIds);

  const impactOf = useCallback(
    (item: InventoryItem | undefined): ItemImpact => {
      if (!item) {
        return { batchCount: 0, dispensingCount: 0, totalQty: 0 };
      }
      // Falls back to what the row already knows while the count is in flight.
      return (
        impactMap?.get(item.id) ?? {
          batchCount: item.batches.length,
          dispensingCount: 0,
          totalQty: item.batches.reduce((sum, batch) => sum + batch.qty, 0),
        }
      );
    },
    [impactMap]
  );

  // The modal cannot open until its counts exist, so the numbers it shows are
  // the real ones rather than a placeholder that fills in behind the user.
  useEffect(() => {
    if (!(pendingDelete && impactMap)) {
      return;
    }
    if (pendingDelete.kind === "item") {
      const item = items.find((row) => row.id === pendingDelete.id);
      setPendingDelete(null);
      if (item) {
        setDeleteTarget({
          impact: impactOf(item),
          itemId: item.id,
          kind: "item",
          label: item.displayName,
        });
      }
      return;
    }
    const ids = [...selectedIds];
    if (ids.some((id) => !impactMap.has(id))) {
      return;
    }
    setDeleteTarget({
      items: ids.map((id) => ({
        id,
        impact: impactOf(items.find((row) => row.id === id)),
        label: items.find((row) => row.id === id)?.name ?? id,
      })),
      kind: "bulk",
    });
    setPendingDelete(null);
  }, [impactMap, impactOf, items, pendingDelete, selectedIds]);

  const clearSelection = useCallback(
    () => setSelectedIds(new Set()),
    [setSelectedIds]
  );

  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [setSelectedIds]
  );

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      filtered.length > 0 && filtered.every((item) => prev.has(item.id))
        ? new Set()
        : new Set(filtered.map((item) => item.id))
    );
  }, [filtered, setSelectedIds]);

  const requestDeleteItem = useCallback((item: InventoryItem) => {
    setPendingDelete({ id: item.id, kind: "item" });
  }, []);

  const requestDeleteBulk = useCallback(() => {
    setPendingDelete((prev) =>
      selectedIds.size > 0 ? { kind: "bulk" } : prev
    );
  }, [selectedIds.size]);

  const requestDeleteBatch = useCallback(
    (item: InventoryItem, batchName: string) => {
      const batch = item.batches.find((row) => row.batch === batchName);
      if (!batch) {
        return;
      }
      setDeleteTarget({
        batchName,
        itemId: item.id,
        kind: "batch",
        productName: item.displayName,
        qtyAfter: Math.max(0, item.qty - batch.qty),
        qtyBefore: item.qty,
        totalQty: batch.qty,
      });
    },
    []
  );

  const closeDeleteTarget = useCallback(() => setDeleteTarget(null), []);

  const confirmDelete = useCallback(
    async (reason: string) => {
      const target = deleteTarget;
      setDeleteTarget(null);
      if (!target) {
        return;
      }
      try {
        if (target.kind === "batch") {
          const summary = await deleteBatchMut.mutateAsync({
            batchName: target.batchName,
            itemId: target.itemId,
            reason,
          });
          toast.success(
            `Deleted batch ${target.batchName} from ${summary.productName}`,
            {
              description: `Qty ${summary.qtyBefore} → ${summary.qtyAfter} · restorable from Trash`,
            }
          );
          return;
        }
        const ids =
          target.kind === "item"
            ? [target.itemId]
            : target.items.map((entry) => entry.id);
        let removed = 0;
        let skipped = 0;
        for (const id of ids) {
          try {
            // biome-ignore lint/performance/noAwaitInLoops: each write is independent and reported on individually
            await deleteItemMut.mutateAsync({ itemId: id, reason });
            removed += 1;
          } catch {
            skipped += 1;
          }
        }
        toast.success(
          `${removed} ${removed === 1 ? "product" : "products"} moved to Trash`,
          skipped > 0
            ? { description: `${skipped} was already in Trash` }
            : undefined
        );
        setSelectedIds(new Set());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [deleteBatchMut, deleteItemMut, deleteTarget, setSelectedIds]
  );

  const toggleTrash = useCallback((id: string) => {
    setSelectedTrashIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAllTrash = useCallback(() => {
    setSelectedTrashIds((prev) =>
      trash.length > 0 && trash.every((entry) => prev.has(entry.id))
        ? new Set()
        : new Set(trash.map((entry) => entry.id))
    );
  }, [trash]);

  const requestPurge = useCallback((entry: TrashEntry) => {
    setPurgeTargets([entry]);
  }, []);

  const requestPurgeSelected = useCallback(() => {
    setPurgeTargets(trash.filter((entry) => selectedTrashIds.has(entry.id)));
  }, [selectedTrashIds, trash]);

  const closePurge = useCallback(() => setPurgeTargets([]), []);

  const confirmPurge = useCallback(
    async (reason: string) => {
      const targets = purgeTargets;
      setPurgeTargets([]);
      if (targets.length === 0) {
        return;
      }
      try {
        const summary = await purgeMut.mutateAsync(targets.map((t) => t.id));
        toast.success(
          `${summary.products} ${summary.products === 1 ? "product" : "products"} deleted permanently`,
          {
            description: `${summary.batches} batches · ${summary.dispensingRecords} dispensing records removed${reason ? ` · ${reason}` : ""}`,
          }
        );
        setSelectedTrashIds(new Set());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Purge failed");
      }
    },
    [purgeMut, purgeTargets]
  );

  const restore = useCallback(
    async (entry: TrashEntry) => {
      try {
        const result = await restoreMut.mutateAsync({
          kind: entry.kind,
          trashId: entry.id,
        });
        if (result.ok) {
          toast.success(`Restored ${result.label}`);
          setSelectedTrashIds(new Set());
          return;
        }
        if (result.reason === "sku-taken") {
          setSkuConflict({
            entry,
            message: result.message,
            suggestedSku: result.suggestedSku,
          });
          return;
        }
        toast.error(result.message);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [restoreMut]
  );

  const closeSkuConflict = useCallback(() => setSkuConflict(null), []);

  const restoreWithSku = useCallback(async () => {
    const conflict = skuConflict;
    setSkuConflict(null);
    if (!conflict) {
      return;
    }
    try {
      const result = await restoreMut.mutateAsync({
        kind: conflict.entry.kind,
        skuOverride: conflict.suggestedSku,
        trashId: conflict.entry.id,
      });
      if (result.ok) {
        toast.success(`Restored as ${conflict.suggestedSku}`);
      } else {
        toast.error(result.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    }
  }, [restoreMut, skuConflict]);

  return {
    clearSelection,
    closeDeleteTarget,
    closePurge,
    closeSkuConflict,
    confirmDelete,
    confirmPurge,
    deleteConsequences: consequencesFor(deleteTarget),
    deleteLabel:
      deleteTarget?.kind === "bulk" ? "Delete selected" : "Move to Trash",
    deleteOpen: deleteTarget !== null,
    deleteTitle: titleFor(deleteTarget),
    purgeConsequences: purgeLines(purgeTargets),
    purgeOpen: purgeTargets.length > 0,
    purgeTitle: purgeTitle(purgeTargets),
    requestDeleteBatch,
    requestDeleteBulk,
    requestDeleteItem,
    requestPurge,
    requestPurgeSelected,
    restore,
    restoreWithSku,
    selectedIds,
    selectedTrashIds,
    skuConflict,
    toggleAll,
    toggleAllTrash,
    toggleSelect,
    toggleTrash,
    trash,
  } as const;
}
