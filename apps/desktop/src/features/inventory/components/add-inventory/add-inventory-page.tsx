import { Button } from "@cmis/ui/components/button";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSettings } from "@/features/admin/settings/hooks/use-settings";
import {
  type BatchDraft,
  type CreationDraft,
  emptyDraft,
  newBatchDraftRow,
  newProductDraft,
  type ProductDraft,
} from "../../creation/draft";
import { groupsToDraft } from "../../creation/sheet";
import { emptySheetDefaults } from "../../creation/sheet-defaults";
import type { SheetDefaults, SheetGroup } from "../../creation/sheet-types";
import { validateSheet } from "../../creation/sheet-validation";
import type {
  DraftIssue,
  DraftValidation,
} from "../../creation/validate-draft";
import {
  type IdentityMatch,
  validateAddition,
  validateNewProduct,
} from "../../creation/validate-draft";
import {
  useCreateInventory,
  useInventoryIdentities,
} from "../../hooks/use-creation";
import { useInventoryItems } from "../../hooks/use-inventory-items";
import { AddBatchesForm } from "./add-batches-form";
import { ChoiceScreen } from "./choice-screen";
import { DeliverySheet } from "./delivery-sheet/delivery-sheet";
import { NewProductForm } from "./new-product-form";
import { ReviewStep } from "./review-step";
import { plural } from "./summary-text";

/**
 * Spec §7.1–§7.5 — `/admin/inventory/add`.
 *
 * The page is a composition root: which path is open, what the draft holds, and
 * when to commit. Validation is pure (`creation/validate-draft.ts`), the write is
 * atomic (`creation/commit-creation.ts`), and this file only connects them.
 */

type FormView = "new-product" | "add-batches" | "delivery-sheet";
type View = FormView | "choice" | "review";

interface AdditionDraft {
  batches: BatchDraft[];
  itemId: string | null;
}

function emptyAddition(): AdditionDraft {
  return { batches: [newBatchDraftRow()], itemId: null };
}

export function AddInventoryPage() {
  const navigate = useNavigate();
  const { state: settings } = useSettings();
  const { data: itemsData, isLoading: itemsLoading } = useInventoryItems();
  const {
    data: index,
    isError: indexError,
    isLoading: indexLoading,
  } = useInventoryIdentities();
  const create = useCreateInventory();

  const [view, setView] = useState<View>("choice");
  const [reviewFrom, setReviewFrom] = useState<FormView>("new-product");
  const [product, setProduct] = useState<ProductDraft>(newProductDraft);
  const [addition, setAddition] = useState<AdditionDraft>(emptyAddition);
  const [sheetDefaults, setSheetDefaults] =
    useState<SheetDefaults>(emptySheetDefaults);
  const [sheetGroups, setSheetGroups] = useState<SheetGroup[]>([]);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);
  const [highlightGroupId, setHighlightGroupId] = useState<string | null>(null);

  const items = itemsData ?? [];

  // The forms read the category list from its own query now, so nothing here
  // has to hand it down — the same list the Settings panel edits.
  const context = useMemo(
    () => ({
      identities: index?.identities ?? new Map<string, IdentityMatch>(),
      rawSkus: index?.rawSkus ?? new Set<string>(),
      skus: index?.skus ?? new Set<string>(),
      suppliers: settings.suppliers.map((supplier) => supplier.name),
    }),
    [index, settings.suppliers]
  );

  const selectedItem = useMemo(
    () => items.find((item) => item.id === addition.itemId) ?? null,
    [addition.itemId, items]
  );

  /** What the review step is judging — the same functions the forms used. */
  const validation = useMemo<DraftValidation>(() => {
    if (view !== "review") {
      return { errors: [], warnings: [] };
    }
    if (reviewFrom === "delivery-sheet") {
      return validateSheet(sheetGroups, {
        identities: context.identities,
        skus: context.skus,
      });
    }
    return reviewFrom === "new-product"
      ? validateNewProduct(product, {
          identities: context.identities,
          skus: context.skus,
        })
      : validateAddition(
          { batches: addition.batches, itemId: addition.itemId },
          {
            existingBatches:
              selectedItem?.batches.map((batch) => batch.batch) ?? [],
          }
        );
  }, [
    addition.batches,
    addition.itemId,
    context.identities,
    context.skus,
    product,
    reviewFrom,
    selectedItem,
    sheetGroups,
    view,
  ]);

  /** The draft the commit writes; only the active path contributes. */
  const draftForCommit = useMemo<CreationDraft>(() => {
    if (reviewFrom === "delivery-sheet") {
      return groupsToDraft(sheetGroups);
    }
    if (reviewFrom === "new-product") {
      return { ...emptyDraft(), newProducts: [product] };
    }
    return {
      ...emptyDraft(),
      additions: addition.itemId
        ? [{ batches: addition.batches, itemId: addition.itemId }]
        : [],
    };
  }, [addition, product, reviewFrom, sheetGroups]);

  const reset = useCallback(() => {
    setProduct(newProductDraft());
    setAddition(emptyAddition());
    setSheetGroups([]);
    setSheetDefaults(emptySheetDefaults());
    setHighlightGroupId(null);
    setHighlightRowId(null);
    setView("choice");
  }, []);

  const handleNewProduct = useCallback(() => {
    setProduct(newProductDraft());
    setHighlightRowId(null);
    setView("new-product");
  }, []);

  const handleAddBatches = useCallback((itemId: string | null = null) => {
    setAddition({ batches: [newBatchDraftRow()], itemId });
    setHighlightRowId(null);
    setView("add-batches");
  }, []);

  const handleAddBatchesInstead = useCallback(
    (match: IdentityMatch) => {
      handleAddBatches(match.id);
      toast.message(`Adding batches to ${match.name}`);
    },
    [handleAddBatches]
  );

  const handleDeliverySheet = useCallback(() => {
    setSheetGroups([]);
    setSheetDefaults(emptySheetDefaults());
    setHighlightGroupId(null);
    setView("delivery-sheet");
  }, []);

  const handleBackToStock = useCallback(() => {
    navigate({ to: "/admin/inventory" });
  }, [navigate]);

  const handleBatchesChange = useCallback((batches: BatchDraft[]) => {
    setAddition((prev) => ({ ...prev, batches }));
  }, []);

  const handleSelectItem = useCallback((itemId: string) => {
    setAddition((prev) => ({ ...prev, itemId }));
  }, []);

  const handleReview = useCallback((from: FormView) => {
    setReviewFrom(from);
    setHighlightGroupId(null);
    setHighlightRowId(null);
    setView("review");
  }, []);

  const handleReviewProduct = useCallback(
    () => handleReview("new-product"),
    [handleReview]
  );

  const handleReviewAddition = useCallback(
    () => handleReview("add-batches"),
    [handleReview]
  );

  const handleReviewSheet = useCallback(
    () => handleReview("delivery-sheet"),
    [handleReview]
  );

  const handleBackToForm = useCallback(() => setView(reviewFrom), [reviewFrom]);

  const handleFix = useCallback(
    (issue: DraftIssue) => {
      // Sheet issues carry the group that produced them, so the grid scrolls
      // back to the offending product instead of only re-rendering.
      const groupId = (issue as { groupId?: string }).groupId ?? null;
      setHighlightGroupId(groupId);
      setHighlightRowId(issue.rowId ?? null);
      setView(reviewFrom);
    },
    [reviewFrom]
  );

  const handleCreate = useCallback(() => {
    // `commitCreation` is atomic, so a failure here leaves the inventory as it
    // was; the message the operator sees is the write error, not a rollback.
    create.mutate(draftForCommit, {
      onError: (error: Error) => {
        toast.error(error.message);
      },
      onSuccess: (result) => {
        toast.success(
          `${plural(result.createdItems, "product", "products")} created · ${plural(result.batches, "batch", "batches")} · ${plural(result.units, "unit", "units")}`,
          {
            action: {
              label: "View in Stock Management",
              onClick: handleBackToStock,
            },
          }
        );
        reset();
      },
    });
  }, [create, draftForCommit, handleBackToStock, reset]);

  const loading = itemsLoading || indexLoading;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-border/50 border-b bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-lg">Add Inventory</h1>
          <p className="text-caption text-muted-foreground">
            Create a new medication, add batch lots to a product you already
            stock, or receive a whole delivery.
          </p>
        </div>
        <Button
          className="press-feedback shrink-0"
          onClick={handleBackToStock}
          size="sm"
          variant="ghost"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Back to Stock Management
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8">
        <div className="mx-auto max-w-5xl space-y-4">
          {indexError ? (
            <p
              className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-caption text-destructive"
              role="alert"
            >
              Could not read the existing inventory, so duplicate checks are
              unavailable. Reload the page and try again.
            </p>
          ) : null}

          {create.error ? (
            <p
              className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-caption text-destructive"
              role="alert"
            >
              {create.error.message}
            </p>
          ) : null}

          {loading ? (
            <p className="text-caption text-muted-foreground">
              Loading inventory…
            </p>
          ) : null}

          {!(loading || indexError) && view === "choice" ? (
            <ChoiceScreen
              hasItems={items.length > 0}
              onAddBatches={handleAddBatches}
              onDeliverySheet={handleDeliverySheet}
              onNewProduct={handleNewProduct}
            />
          ) : null}

          {!(loading || indexError) && view === "new-product" ? (
            <NewProductForm
              context={context}
              draft={product}
              highlightRowId={highlightRowId}
              onAddBatchesInstead={handleAddBatchesInstead}
              onCancel={reset}
              onChange={setProduct}
              onSubmit={handleReviewProduct}
            />
          ) : null}

          {!(loading || indexError) && view === "add-batches" ? (
            <AddBatchesForm
              batches={addition.batches}
              highlightRowId={highlightRowId}
              items={items}
              onCancel={reset}
              onChange={handleBatchesChange}
              onSelectItem={handleSelectItem}
              onSubmit={handleReviewAddition}
              selectedId={addition.itemId}
              suppliers={context.suppliers}
            />
          ) : null}

          {!(loading || indexError) && view === "delivery-sheet" ? (
            <DeliverySheet
              context={context}
              defaults={sheetDefaults}
              groups={sheetGroups}
              highlightGroupId={highlightGroupId}
              onCancel={reset}
              onChange={setSheetGroups}
              onDefaultsChange={setSheetDefaults}
              onSubmit={handleReviewSheet}
            />
          ) : null}

          {!(loading || indexError) && view === "review" ? (
            <ReviewStep
              draft={draftForCommit}
              items={items}
              onBack={handleBackToForm}
              onFix={handleFix}
              onSubmit={handleCreate}
              pending={create.isPending}
              validation={validation}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
