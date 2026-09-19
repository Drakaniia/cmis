import type { BatchDraft, ProductDraft } from "../../../creation/draft";
import type { SheetGroup } from "../../../creation/sheet-types";

interface SheetRowBase {
  group: SheetGroup;
  groupIndex: number;
}

export type SheetRow =
  | (SheetRowBase & { kind: "group" })
  | (SheetRowBase & {
      batchRow: BatchDraft;
      indexInGroup: number;
      kind: "batch";
      lastInGroup: boolean;
    });

export interface SheetHandlers {
  onAddBatch: (groupId: string) => void;
  onBatchChange: (
    groupId: string,
    rowId: string,
    patch: Partial<BatchDraft>
  ) => void;
  onDragStart: (groupId: string) => void;
  onDropOn: (groupId: string) => void;
  onDuplicateBatch: (groupId: string, rowId: string) => void;
  onDuplicateGroup: (groupId: string) => void;
  onGroupPatch: (groupId: string, patch: Partial<ProductDraft>) => void;
  onMoveBatch: (groupId: string, rowId: string, delta: -1 | 1) => void;
  onMoveGroup: (groupId: string, delta: -1 | 1) => void;
  onNameBlur: (groupId: string) => void;
  onRemoveBatch: (groupId: string, rowId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onSkuChange: (groupId: string, sku: string) => void;
  onToggleSelect: (groupId: string) => void;
}
