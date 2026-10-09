import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import {
  buildItemUpdate,
  draftFromItem,
  type ItemDraftErrors,
  type ItemEditDraft,
  isRename,
  validateItemDraft,
} from "../domain/item-update";
import { packSizeText } from "../domain/pack-size";
import { useItemUpdateMutation } from "../hooks/use-item-update";
import type { InventoryItem } from "../types";
import { CategoryPicker } from "./category-picker";
import { VocabularyPicker } from "./vocabulary-picker";

/**
 * The Edit form (spec §8.3, decision 16).
 *
 * "Full edit flow" means name, category and the four strength fields; SKU,
 * supplier and the low-stock alert level are exposed too because they are
 * already part of the draft the save computes from — hiding them would make
 * the payload opaque.
 *
 * Quantity is display-only on purpose: stock only moves through Stock In and
 * Stock Out, which record the movement and its audit trail, so a number typed
 * here would silently desync the ledger. Batch expiries are not edited here
 * either — expiry corrections live on the Expiry page, next to the movements
 * they describe.
 *
 * All four strength fields are optional and never block a save. A row saved with
 * a blank part is legal and simply keeps the "details incomplete" flag, which is
 * the point of that flag: the app records what it was told and marks the gap
 * rather than inventing a value.
 */

const PACK_SIZE_MAX = 40;

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

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
  onPackUnitChange: (value: string) => void;
  showErrors: boolean;
}) {
  const handlePackUnitChange = useCallback(
    (value: string) => onPackUnitChange(value),
    [onPackUnitChange]
  );

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
      {/* A picker, not a `<select>`: V6 refuses a pack unit that is not in the
          list, so a container the clinic uses but the list lacks needs
          somewhere to be added without abandoning the edit. */}
      <VocabularyPicker
        error={showErrors ? errors.packUnit : undefined}
        hint="The container one pack is counted in."
        kind="pack_unit"
        name="item-edit-pack-unit"
        onChange={handlePackUnitChange}
        value={draft.packUnit}
      />
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
  const update = useItemUpdateMutation();

  useEffect(() => {
    setDraft(draftFromItem(item));
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
  const dirty = useMemo(() => {
    const initial = draftFromItem(item);
    return (Object.keys(initial) as (keyof ItemEditDraft)[]).some(
      (key) => initial[key] !== draft[key]
    );
  }, [draft, item]);

  const patch = useCallback((values: Partial<ItemEditDraft>) => {
    setDraft((previous) => ({ ...previous, ...values }));
  }, []);

  const textHandler = useCallback(
    (key: keyof ItemEditDraft) => (event: ChangeEvent<HTMLInputElement>) =>
      patch({ [key]: event.target.value } as Partial<ItemEditDraft>),
    [patch]
  );
  /**
   * The pickers hand back the name itself rather than a change event — they are
   * popovers, not `<select>` elements, because the list behind each one is
   * editable and an `<option>` is not a place for buttons.
   */
  const termHandler = useCallback(
    (key: keyof ItemEditDraft) => (value: string) =>
      patch({ [key]: value } as Partial<ItemEditDraft>),
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
      toast.success(`Saved ${draft.name.trim()}`);
      onSaved?.();
    } catch (error) {
      toast.error("Could not save the item", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [draft, item, items, onSaved, update]);

  const handleCancel = useCallback(() => {
    // The dirty guard is local rather than a modal: the panel already owns the
    // draft, so asking here keeps the decision next to the data it discards.
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  }, [confirmDiscard, dirty, onCancel]);

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
            {/* Both lists are editable, so a row that was imported with a unit
                or form the shipped list lacks can be corrected to the right
                term here rather than left rendering as a bare `unit`. */}
            <VocabularyPicker
              kind="strength_unit"
              label="Strength unit"
              name="item-edit-strength-unit"
              onChange={termHandler("strengthUnit")}
              value={draft.strengthUnit}
            />
            <VocabularyPicker
              kind="form"
              label="Form"
              name="item-edit-form"
              onChange={termHandler("form")}
              value={draft.form}
            />
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
              onPackUnitChange={termHandler("packUnit")}
              showErrors={attempted}
            />
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            <input
              className={FIELD_CLASS}
              onChange={textHandler("supplier")}
              value={draft.supplier}
            />
          </Field>
          {/* Read-only by design: `<output>` is labelable, so the label still
              names the value for assistive tech, but nothing here can rewrite
              the count — Stock In / Stock Out own the ledger. */}
          <Field
            error={attempted ? errors.qty : undefined}
            hint="Read-only — stock moves through Stock In and Stock Out, which record each movement."
            label="Quantity"
          >
            <output className="mt-1 block rounded-md border border-border/50 bg-muted/40 px-3 py-2 font-medium text-foreground text-sm tabular-nums">
              {item.qty}
            </output>
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
