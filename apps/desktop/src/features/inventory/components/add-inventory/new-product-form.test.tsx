import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { newProductDraft, type ProductDraft } from "../../creation/draft";
import type { IdentityMatch } from "../../creation/validate-draft";
import { NewProductForm, type ProductFormContext } from "./new-product-form";

// The category dropdown owns its own list; this form only has to render it.
vi.mock("../../hooks/use-categories", () => import("@/test/categories-mock"));
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));

const ADD_BATCHES = /add batches/i;
const ALREADY_EXISTS = /already exists/i;
const MEDICATION_NAME = /medication name/i;
const NEEDS_BATCH = /Add at least one batch/i;
const REVIEW_BUTTON = /^review$/i;
const STOCK_CODE = /stock code/i;

const MATCH: IdentityMatch = {
  id: "item-1",
  name: "Paracetamol 500 mg",
  sku: "SKU-PARA-500",
};

function context(
  overrides: Partial<ProductFormContext> = {}
): ProductFormContext {
  return {
    identities: new Map(),
    rawSkus: new Set(),
    skus: new Set(),
    suppliers: ["MedSupply"],
    ...overrides,
  };
}

/**
 * The form is controlled — a stateless render would never see the name it just
 * typed, which is exactly what the SKU prefill depends on.
 */
function Harness({
  context: formContext,
  initial,
  onAddBatchesInstead = vi.fn(),
  onChange,
  onSubmit = vi.fn(),
}: {
  context: ProductFormContext;
  initial: ProductDraft;
  onAddBatchesInstead?: (match: IdentityMatch) => void;
  onChange?: (draft: ProductDraft) => void;
  onSubmit?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const handleChange = useCallback(
    (next: ProductDraft) => {
      onChange?.(next);
      setDraft(next);
    },
    [onChange]
  );
  return (
    <NewProductForm
      context={formContext}
      draft={draft}
      onAddBatchesInstead={onAddBatchesInstead}
      onCancel={vi.fn()}
      onChange={handleChange}
      onSubmit={onSubmit}
    />
  );
}

function renderForm(
  draft: ProductDraft,
  overrides: {
    context?: Partial<ProductFormContext>;
    onAddBatchesInstead?: (match: IdentityMatch) => void;
  } = {}
) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  render(
    <Harness
      context={context(overrides.context)}
      initial={draft}
      onAddBatchesInstead={overrides.onAddBatchesInstead ?? vi.fn()}
      onChange={onChange}
      onSubmit={onSubmit}
    />
  );
  return { onChange, onSubmit };
}

describe("NewProductForm", () => {
  it("prefills the SKU from the name and dosage until the operator edits it", () => {
    const draft: ProductDraft = {
      ...newProductDraft(),
      batches: [],
      strengthUnit: "mg",
      strengthValue: "500",
    };
    const { onChange } = renderForm(draft);

    const name = screen.getByLabelText(MEDICATION_NAME);
    fireEvent.change(name, { target: { value: "Paracetamol" } });
    // The change handler patches the name, then the blur derives the SKU.
    onChange.mockClear();
    fireEvent.blur(name);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Paracetamol", sku: "SKU-PARA-500" })
    );
    expect(screen.getByLabelText(STOCK_CODE)).toHaveValue("SKU-PARA-500");
  });

  it("leaves a hand-typed SKU alone", () => {
    const draft: ProductDraft = {
      ...newProductDraft(),
      batches: [],
      name: "Paracetamol",
      sku: "CUSTOM-1",
    };
    const { onChange } = renderForm(draft);

    fireEvent.blur(screen.getByLabelText(MEDICATION_NAME));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers to add batches when the medicine already exists", async () => {
    const onAddBatchesInstead = vi.fn();
    const draft: ProductDraft = {
      ...newProductDraft(),
      batches: [],
      name: "Paracetamol",
      sku: "SKU-PARA-999",
      strengthUnit: "mg",
      strengthValue: "500",
    };
    renderForm(draft, {
      context: {
        // `name|strength_value|strength_unit|form|pack_size` — decision 9.
        identities: new Map([["paracetamol|500|mg||", MATCH]]),
      },
      onAddBatchesInstead,
    });

    expect(screen.getByText(ALREADY_EXISTS)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: ADD_BATCHES }));
    expect(onAddBatchesInstead).toHaveBeenCalledWith(MATCH);
  });

  it("blocks Review until a batch exists", async () => {
    const draft: ProductDraft = {
      ...newProductDraft(),
      batches: [],
      category: "Analgesic",
      name: "Paracetamol",
      sku: "SKU-PARA-500",
    };
    const { onSubmit } = renderForm(draft);

    const review = screen.getByRole("button", { name: REVIEW_BUTTON });
    // Deferred validation: no red errors on initial load, Review is enabled to allow validation trigger
    expect(review).not.toBeDisabled();
    expect(screen.queryByText(NEEDS_BATCH)).not.toBeInTheDocument();

    await userEvent.click(review);
    expect(screen.getByText(NEEDS_BATCH)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
