import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CATEGORY_FIXTURES,
  createCategoryMutate,
  deleteCategoryMutate,
  renameCategoryMutate,
} from "@/test/categories-mock";
import { CategoryPicker } from "./category-picker";

vi.mock("../hooks/use-categories", () => import("@/test/categories-mock"));

// Base UI's positioner costs ~20s per open under jsdom; the shim keeps the
// panel on the fast path while still exercising the real open/close wiring.
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));

// Top level, so a case is not compiling a fresh pattern on each assertion.
const CATEGORY_LABEL = /^Category$/;
const ALL_CATEGORIES = /All categories/;
const NEW_CATEGORY = /New category/;
const ANALGESIC_ROW = /^Analgesic/;
const ANTIBIOTIC_ROW = /^Antibiotic/;
const GASTRO_ROW = /^Gastro/;

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

function renderPicker(
  props: Partial<Parameters<typeof CategoryPicker>[0]> = {}
) {
  const onChange = vi.fn();
  render(
    <CategoryPicker label="Category" onChange={onChange} value="" {...props} />
  );
  return { onChange };
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: CATEGORY_LABEL }));
}

beforeEach(() => {
  createCategoryMutate.mockReset();
  renameCategoryMutate.mockReset();
  deleteCategoryMutate.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("CategoryPicker", () => {
  it("shows the placeholder until a category is chosen", () => {
    renderPicker();

    expect(
      screen.getByRole("button", { name: CATEGORY_LABEL })
    ).toHaveTextContent("Choose a category");
  });

  it("shows the stored value, even one the list does not hold", () => {
    renderPicker({ value: "Ophthalmic" });

    expect(
      screen.getByRole("button", { name: CATEGORY_LABEL })
    ).toHaveTextContent("Ophthalmic");
  });

  it("lists every category with the number of items using it", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    // Anchored: "Rename Gastro" and "Delete Gastro" sit beside each row.
    expect(
      screen.getByRole("button", { name: ANALGESIC_ROW })
    ).toHaveTextContent("2");
    expect(
      screen.getByRole("button", { name: GASTRO_ROW })
    ).toBeInTheDocument();
  });

  it("reports the category the operator picks", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: ANTIBIOTIC_ROW }));

    expect(onChange).toHaveBeenCalledWith("Antibiotic");
  });

  it("offers an All row only when the caller asked for one", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ allLabel: "All categories" });
    await openPicker(user);
    await user.click(screen.getByRole("button", { name: ALL_CATEGORIES }));

    expect(onChange).toHaveBeenCalledWith("All");
  });

  it("creates a category from inside the dropdown and selects it", async () => {
    const user = userEvent.setup();
    createCategoryMutate.mockImplementation((name, options) =>
      options?.onSuccess?.({ id: "cat-new", itemCount: 0, name })
    );
    const { onChange } = renderPicker();
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: NEW_CATEGORY }));
    await user.type(screen.getByLabelText("New category"), "  Ophthalmic  ");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(createCategoryMutate).toHaveBeenCalledWith(
      "Ophthalmic",
      expect.anything()
    );
    expect(onChange).toHaveBeenCalledWith("Ophthalmic");
  });

  it("refuses a duplicate name before it reaches the database", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: NEW_CATEGORY }));
    await user.type(screen.getByLabelText("New category"), "analgesic");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(createCategoryMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "Could not add the category",
      expect.objectContaining({ description: "Analgesic already exists." })
    );
  });

  it("refuses a blank name before it reaches the database", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: NEW_CATEGORY }));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(createCategoryMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "Could not add the category",
      expect.objectContaining({ description: "Name is required." })
    );
  });

  it("renames a category inline", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: "Rename Gastro" }));
    const input = screen.getByLabelText("Rename category");
    await user.clear(input);
    await user.type(input, "Digestive");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(renameCategoryMutate).toHaveBeenCalledWith(
      { id: "cat-gastro", name: "Digestive" },
      expect.anything()
    );
  });

  it("carries a rename through to the field holding that category", async () => {
    const user = userEvent.setup();
    renameCategoryMutate.mockImplementation((_values, options) =>
      options?.onSuccess?.({ itemsUpdated: 3 })
    );
    const { onChange } = renderPicker({ value: "Gastro" });
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: "Rename Gastro" }));
    const input = screen.getByLabelText("Rename category");
    await user.clear(input);
    await user.type(input, "Digestive");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onChange).toHaveBeenCalledWith("Digestive");
  });

  it("refuses to delete a category items still use, and says how many", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: "Delete Analgesic" }));

    expect(deleteCategoryMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "Cannot delete Analgesic",
      expect.objectContaining({
        description: "2 items use it. Reassign them first.",
      })
    );
  });

  it("asks once more before deleting an unused category", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: "Delete Gastro" }));

    // Nothing is deleted until the confirmation is answered.
    expect(deleteCategoryMutate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Gastro", { selector: "strong" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteCategoryMutate).toHaveBeenCalledWith(
      "cat-gastro",
      expect.anything()
    );
  });

  it("clears the field when the category it holds is deleted", async () => {
    const user = userEvent.setup();
    deleteCategoryMutate.mockImplementation((_id, options) =>
      options?.onSuccess?.()
    );
    const { onChange } = renderPicker({ value: "Gastro" });
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: "Delete Gastro" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("marks the field invalid when the form reports an error", () => {
    renderPicker({ error: "Choose a category." });

    expect(
      screen.getByRole("button", { name: CATEGORY_LABEL })
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose a category.")).toBeInTheDocument();
  });

  it("counts the shipped taxonomy when nothing has been read yet", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    for (const category of CATEGORY_FIXTURES) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^${category.name}`),
        })
      ).toBeInTheDocument();
    }

    expect(
      screen.getByRole("button", { name: ANALGESIC_ROW })
    ).toHaveTextContent("2");
  });
});
