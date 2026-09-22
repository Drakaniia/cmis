import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";
import {
  batchQuantityTotal,
  buildItemUpdate,
  draftFromItem,
  type ItemDraftErrors,
  type ItemEditDraft,
  isRename,
  validateItemDraft,
} from "../domain/item-update";
import { packSizeText } from "../domain/pack-size";
import {
  MEDICINE_FORMS,
  PACK_UNITS,
  STRENGTH_UNITS,
} from "../domain/vocabulary";
import { useItemUpdateMutation } from "../hooks/use-item-update";
import type { InventoryItem } from "../types";
import { CategoryPicker } from "./category-picker";

/**
 * The Edit form (spec §8.3, decision 16).
 *
 * "Full edit flow" means name, category and the four strength fields; SKU, supplier,
 * quantity and threshold are exposed too because they are already part of the
 * draft the save computes from — hiding them would make the payload opaque.
 *
 * All four strength fields are optional and never block a save. A row saved with
 * a blank part is legal and simply keeps the "details incomplete" flag, which is
 * the point of that flag: the app records what it was told and marks the gap
 * rather than inventing a value.
 */

const PACK_SIZE_MAX = 40;

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const SELECT_CLASS = FIELD_CLASS;

/**
 * One labelled input. Module level so React never remounts the field (and never
 * drops focus) when the panel re-renders on each keystroke.
 */
function Field({
  children,
  error,
  hint,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  /** Explains what the field means when the label alone is not enough. */
  hint?: string;
  label: string;
}) {
  return (
    <label className="block font-medium text-caption text-foreground">
      {label}
      {children}
      {hint ? (
        <span className="mt-1 block text-caption text-muted-foreground">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="mt-1 block text-caption text-destructive">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/**
 * The structured pack pair (F3/D4), module level for two reasons: React must
 * not remount the inputs mid-edit, and keeping it out of `ItemEditPanel` keeps
 * that function's cognitive complexity inside the lint budget.
 */
function PackPairFields({
  draft,
  errors,
  onPackQtyChange,
  onPackUnitChange,
  showErrors,
}: {
  draft: ItemEditDraft;
  errors: ItemDraftErrors;
  onPackQtyChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPackUnitChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  showErrors: boolean;
}) {
  return (
    <>
      <Field
        error={showErrors ? errors.packQty : undefined}
        hint="How many base units one pack holds."
        label="Pack quantity"
      >
        <input
          className={cn(
            FIELD_CLASS,
            showErrors && errors.packQty && "border-destructive"
          )}
          onChange={onPackQtyChange}
          placeholder="10"
          type="number"
          value={draft.packQty === "" ? "" : draft.packQty}
        />
      </Field>
      <Field error={showErrors ? errors.packUnit : undefined} label="Pack unit">
        <select
          className={SELECT_CLASS}
          onChange={onPackUnitChange}
          value={draft.packUnit}
        >
          <option value="">—</option>
          {PACK_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export function ItemEditPanel({
  item,
  items,
  onSaved,
  onCancel,
}: {
  item: InventoryItem;
  /** The whole inventory, so the SKU uniqueness check sees every row. */
  items: InventoryItem[];
  onSaved?: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ItemEditDraft>(() => draftFromItem(item));
  const [attempted, setAttempted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const qc = useQueryClient();
  const update = useItemUpdateMutation();
  const [batchExpiries, setBatchExpiries] = useState<Record<string, string>>(
    () => Object.fromEntries(item.batches.map((b) => [b.batch, b.expiry]))
  );

  useEffect(() => {
    setDraft(draftFromItem(item));
    setBatchExpiries(
      Object.fromEntries(item.batches.map((b) => [b.batch, b.expiry]))
    );
    setAttempted(false);
    setConfirmDiscard(false);
  }, [item]);

  const errors = useMemo(
    () => validateItemDraft(draft, items, item.id),
    [draft, items, item.id]
  );
  const _invalid = Object.keys(errors).length > 0;
  // The structured pair, rendered (D24) — a hint rather than a second editable
  // copy, so the operator sees exactly what `pack_size` will read.
  const derivedPackText = packSizeText({
    packQty: draft.packQty,
    packUnit: draft.packUnit,
  });
  const batchDirty = useMemo(
    () => item.batches.some((b) => batchExpiries[b.batch] !== b.expiry),
    [batchExpiries, item.batches]
  );

  const dirty = useMemo(() => {
    const initial = draftFromItem(item);
    const draftDirty = (Object.keys(initial) as (keyof ItemEditDraft)[]).some(
      (key) => initial[key] !== draft[key]
    );
    return draftDirty || batchDirty;
  }, [draft, item, batchDirty]);

  const patch = useCallback((values: Partial<ItemEditDraft>) => {
    setDraft((previous) => ({ ...previous, ...values }));
  }, []);

  const textHandler = useCallback(
    (key: keyof ItemEditDraft) => (event: ChangeEvent<HTMLInputElement>) =>
      patch({ [key]: event.target.value } as Partial<ItemEditDraft>),
    [patch]
  );
  const selectHandler = useCallback(
    (key: keyof ItemEditDraft) => (event: ChangeEvent<HTMLSelectElement>) =>
      patch({ [key]: event.target.value } as Partial<ItemEditDraft>),
    [patch]
  );
  const handleCategoryChange = useCallback(
    (category: string) => patch({ category }),
    [patch]
  );
  const numberHandler = useCallback(
    (key: keyof ItemEditDraft) => (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      patch({
        [key]: raw === "" ? Number.NaN : Number(raw),
      } as Partial<ItemEditDraft>);
    },
    [patch]
  );

  /**
   * The pack multiple is `number | ""`, not a number: `""` is the draft's "no
   * pack recorded" (F2). The shared `numberHandler` writes `NaN` for a blank
   * field, which the insert would then store as a non-integer, so the pair gets
   * its own translation.
   */
  const packQtyHandler = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value.trim();
      const parsed = Number(raw);
      patch({ packQty: raw === "" || !Number.isFinite(parsed) ? "" : parsed });
    },
    [patch]
  );

  const handleBatchExpiryChange = useCallback(
    (batchName: string, value: string) => {
      setBatchExpiries((previous) => ({ ...previous, [batchName]: value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    setAttempted(true);
    if (Object.keys(validateItemDraft(draft, items, item.id)).length > 0) {
      return;
    }
    try {
      await update.mutateAsync({
        ...buildItemUpdate(item, draft),
        id: item.id,
      });
      const changedBatches = item.batches.filter(
        (b) => (batchExpiries[b.batch] ?? "") !== (b.expiry ?? "")
      );
      if (changedBatches.length > 0) {
        const db = await getDb();
        for (const batch of changedBatches) {
          const newExpiry = batchExpiries[batch.batch] ?? "";
          const rows = await db.select<{ id: string; expiry: string | null }[]>(
            "SELECT id, expiry FROM inventory_batches WHERE item_id = ? AND batch = ? LIMIT 1",
            [item.id, batch.batch]
          );
          const row = rows[0];
          if (!row) {
            continue;
          }
          const previousExpiry = row.expiry ?? "";
          await db.execute(
            "UPDATE inventory_batches SET expiry = ? WHERE id = ?",
            [newExpiry, row.id]
          );
          await recordAudit(
            db,
            {
              action: "correction",
              after: { batch: batch.batch, expiry: newExpiry },
              before: { batch: batch.batch, expiry: previousExpiry },
              detail: `Corrected batch expiry for ${batch.batch} from ${previousExpiry || "no date"} to ${newExpiry || "no date"}`,
              targetId: row.id,
              targetKind: "batch",
            },
            { bestEffort: true }
          );
          qc.invalidateQueries({ queryKey: ["inventory_items"] });
          qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        }
      }
      toast.success(`Saved ${draft.name.trim()}`);
      onSaved?.();
    } catch (error) {
      toast.error("Could not save the item", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [batchExpiries, draft, item, items, onSaved, update]);

  const handleCancel = useCallback(() => {
    // The dirty guard is local rather than a modal: the panel already owns the
    // draft, so asking here keeps the decision next to the data it discards.
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  }, [confirmDiscard, dirty, onCancel]);

  const stockDivergence = batchQuantityTotal(item) !== draft.qty;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
        <p className="text-caption text-muted-foreground">
          Editing {item.displayName}
        </p>
        {isRename(item, draft) ? (
          <p className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2 text-caption text-foreground">
            Renaming changes the medicine's display label. Requests recorded
            under the old name keep the old text — they are matched by label,
            not by a key.
          </p>
        ) : null}

        <Field error={attempted ? errors.name : undefined} label="Name">
          <input
            className={cn(
              FIELD_CLASS,
              attempted && errors.name && "border-destructive"
            )}
            onChange={textHandler("name")}
            value={draft.name}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {/* The picker owns the whole category, including the list behind it:
              a category the operator is missing can be added here rather than
              by abandoning the edit to visit Settings (§8.3). */}
          <CategoryPicker
            label="Category"
            name="item-edit-category"
            onChange={handleCategoryChange}
            placeholder="—"
            value={draft.category}
          />
          <Field error={attempted ? errors.sku : undefined} label="SKU">
            <input
              className={cn(
                FIELD_CLASS,
                attempted && errors.sku && "border-destructive"
              )}
              onChange={textHandler("sku")}
              value={draft.sku}
            />
          </Field>
        </div>

        <fieldset className="space-y-2 rounded-md border border-border/50 p-3">
          <legend className="px-1 text-caption text-muted-foreground">
            Strength &amp; form
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Strength value">
              <input
                className={FIELD_CLASS}
                onChange={textHandler("strengthValue")}
                placeholder="500 or 200/200/5"
                value={draft.strengthValue}
              />
            </Field>
            <Field label="Strength unit">
              <select
                className={SELECT_CLASS}
                onChange={selectHandler("strengthUnit")}
                value={draft.strengthUnit}
              >
                <option value="">—</option>
                {STRENGTH_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Form">
              <select
                className={SELECT_CLASS}
                onChange={selectHandler("form")}
                value={draft.form}
              >
                <option value="">—</option>
                {MEDICINE_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              error={attempted ? errors.packSize : undefined}
              hint={
                derivedPackText === ""
                  ? "Legacy text — kept as typed while the pair below is blank."
                  : `Reads as ${derivedPackText}, derived from the pair.`
              }
              label="Pack size"
            >
              <input
                className={cn(
                  FIELD_CLASS,
                  attempted && errors.packSize && "border-destructive"
                )}
                maxLength={PACK_SIZE_MAX}
                onChange={textHandler("packSize")}
                placeholder="(100/box)"
                value={draft.packSize}
              />
            </Field>

            {/* F3/D4 — the structured multiple. The text above is derived from
                this pair on save (D24); the pair is what arithmetic reads. */}
            <PackPairFields
              draft={draft}
              errors={errors}
              onPackQtyChange={packQtyHandler}
              onPackUnitChange={selectHandler("packUnit")}
              showErrors={attempted}
            />
          </div>
        </fieldset>

        {item.batches.length > 0 ? (
          <fieldset className="space-y-2 rounded-md border border-border/50 p-3">
            <legend className="px-1 text-caption text-muted-foreground">
              Batch expiries — edit expiry dates (past dates warn, not block)
            </legend>
            <div className="space-y-2">
              {[...item.batches]
                .sort(
                  (a, b) =>
                    new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
                )
                .map((batch) => {
                  const current = batchExpiries[batch.batch] ?? "";
                  const isPast =
                    current !== "" &&
                    new Date(current) <=
                      new Date(new Date().setHours(0, 0, 0, 0));
                  const isChanged = current !== batch.expiry;
                  return (
                    <div
                      className="flex flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-2"
                      key={batch.batch}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-caption">
                          {batch.batch}
                        </span>
                        <span className="text-caption text-muted-foreground">
                          Qty {batch.qty}
                        </span>
                        {isChanged ? (
                          <span className="font-medium text-[10px] text-[var(--warning)]">
                            modified
                          </span>
                        ) : null}
                      </div>
                      <AppleDatePicker
                        onChange={(value) =>
                          handleBatchExpiryChange(batch.batch, value)
                        }
                        placeholder="Select expiry date"
                        value={current}
                      />
                      {isPast ? (
                        <span className="text-[var(--warning)] text-caption">
                          Warning: expiry is in the past (not blocked).
                        </span>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </fieldset>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            <input
              className={FIELD_CLASS}
              onChange={textHandler("supplier")}
              value={draft.supplier}
            />
          </Field>
          <Field error={attempted ? errors.qty : undefined} label="Quantity">
            <input
              className={cn(
                FIELD_CLASS,
                attempted && errors.qty && "border-destructive"
              )}
              onChange={numberHandler("qty")}
              type="number"
              value={Number.isNaN(draft.qty) ? "" : draft.qty}
            />
          </Field>
          <Field
            error={attempted ? errors.threshold : undefined}
            hint="App-only alert level — not a column in the import file. Derived from this item's dispensing usage; edit to override."
            label="Low-stock alert level"
          >
            <input
              className={cn(
                FIELD_CLASS,
                attempted && errors.threshold && "border-destructive"
              )}
              onChange={numberHandler("threshold")}
              type="number"
              value={Number.isNaN(draft.threshold) ? "" : draft.threshold}
            />
          </Field>
        </div>

        {stockDivergence ? (
          <p className="text-caption text-muted-foreground">
            Quantity is not the sum of this item's batches (
            {batchQuantityTotal(item)} across {item.batches.length}). Saving
            keeps the batches as they are — only the quantity changes.
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-border/40 border-t bg-card/50 px-4 py-2 backdrop-blur-md">
        {confirmDiscard ? (
          <span className="text-[var(--warning)] text-caption">
            Discard unsaved changes?
          </span>
        ) : null}
        <Button
          className="press-feedback ml-auto"
          onClick={handleCancel}
          size="sm"
          type="button"
          variant={confirmDiscard ? "destructive" : "ghost"}
        >
          {confirmDiscard ? "Discard" : "Cancel"}
        </Button>
        <Button
          className="press-feedback"
          disabled={update.isPending}
          size="sm"
          type="submit"
          variant="confirm"
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
