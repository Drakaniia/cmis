import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { type FormEvent, useCallback, useMemo, useState } from "react";
import type { BatchDraft } from "../../creation/draft";
import { validateAddition } from "../../creation/validate-draft";
import type { InventoryItem } from "../../types";
import { BatchRowsEditor } from "./batch-rows-editor";
import { CARD_CLASS } from "./field-styles";
import { ProductPicker } from "./product-picker";

/**
 * Spec §7.3 — Path 2: add batches to a product that already exists.
 *
 * The picker and the row editor are the same pieces Path 1 uses, so a lot row
 * cannot mean one thing here and another there. What differs is the duplicate
 * rule: lots already on the product are **blocked** rather than warned, because
 * the read-only list above makes the collision plain.
 */

interface AddBatchesFormProps {
  batches: BatchDraft[];
  highlightRowId?: string | null;
  items: InventoryItem[];
  onCancel: () => void;
  onChange: (batches: BatchDraft[]) => void;
  onSelectItem: (itemId: string) => void;
  onSubmit: () => void;
  selectedId: string | null;
  suppliers: string[];
}

export function AddBatchesForm({
  batches,
  highlightRowId,
  items,
  onChange,
  onCancel,
  onSelectItem,
  onSubmit,
  selectedId,
  suppliers,
}: AddBatchesFormProps) {
  const item = useMemo(
    () => items.find((entry) => entry.id === selectedId) ?? null,
    [items, selectedId]
  );

  const validation = useMemo(
    () =>
      validateAddition(
        { batches, itemId: item?.id ?? null },
        { existingBatches: item?.batches.map((batch) => batch.batch) ?? [] }
      ),
    [batches, item]
  );

  const [submitAttempted, setSubmitAttempted] = useState(false);
  const showBatchesErrors = submitAttempted;

  const handleSelectItemWrapped = useCallback(
    (itemId: string) => {
      onSelectItem(itemId);
    },
    [onSelectItem]
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (validation.errors.length === 0) {
        onSubmit();
        return;
      }
      setSubmitAttempted(true);
    },
    [onSubmit, validation.errors.length]
  );

  return (
    <form className={cn(CARD_CLASS, "space-y-4")} onSubmit={handleSubmit}>
      <h2 className="font-semibold text-sm">Add batches</h2>

      <ProductPicker
        items={items}
        onSelect={handleSelectItemWrapped}
        selectedId={selectedId}
      />
      {submitAttempted &&
      validation.errors.some((e) => e.field === "itemId") ? (
        <p className="text-caption text-destructive" role="alert">
          {validation.errors.find((e) => e.field === "itemId")?.message}
        </p>
      ) : null}

      {item ? (
        <BatchRowsEditor
          allowEmpty
          batches={batches}
          highlightRowId={highlightRowId}
          inheritedSupplier={item.supplier}
          onChange={onChange}
          showErrors={showBatchesErrors}
          suppliers={suppliers}
          validation={validation}
        />
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          Back
        </Button>
        <Button className="press-feedback" type="submit">
          Review
        </Button>
      </div>
    </form>
  );
}
