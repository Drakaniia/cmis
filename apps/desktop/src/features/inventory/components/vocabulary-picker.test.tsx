import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTerm, pickTerm } from "@/test/pick-term";
import {
  createTermMutate,
  deleteTermMutate,
  renameTermMutate,
  resetTermFixtures,
  setTermFixtures,
} from "@/test/vocabulary-mock";
import { VocabularyPicker } from "./vocabulary-picker";

vi.mock(
  "../hooks/use-vocabulary-terms",
  () => import("@/test/vocabulary-mock")
);

// Base UI's positioner costs ~20s per open under jsdom; the shim keeps the panel
// on the fast path while still exercising the real open/close wiring.
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

// Top level, so a case is not compiling a fresh pattern on each assertion. The
// row names are exact strings, not `/^mg/` — the seeded list holds `mg`, `mg/ml`
// and `mg/5ml`, and a prefix pattern would match all three.
const STRENGTH_UNIT = /^Strength unit$/;
const PACK_UNIT = /^Pack unit$/;
const NEW_UNIT = "New strength unit";
const MG_ROW = "mg";
const RENAME_MG = "Rename mg";
const DELETE_MG = "Delete mg";

function renderPicker(
  props: Partial<Parameters<typeof VocabularyPicker>[0]> = {}
) {
  const onChange = vi.fn();
  render(
    <VocabularyPicker
      kind="strength_unit"
      onChange={onChange}
      value=""
      {...props}
    />
  );
  return { onChange };
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: STRENGTH_UNIT }));
}

/** Opens the panel and clicks the "New …" link, landing in the inline form. */
async function openCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await openPanel(user);
  await user.click(screen.getByRole("button", { name: NEW_UNIT }));
}

async function openRenameForm(user: ReturnType<typeof userEvent.setup>) {
  await openPanel(user);
  await user.click(screen.getByRole("button", { name: RENAME_MG }));
}

async function openDeleteConfirm(user: ReturnType<typeof userEvent.setup>) {
  await openPanel(user);
  await user.click(screen.getByRole("button", { name: DELETE_MG }));
}

beforeEach(() => {
  resetTermFixtures();
  createTermMutate.mockReset();
  renameTermMutate.mockReset();
  deleteTermMutate.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("VocabularyPicker", () => {
  it("shows the placeholder when nothing is picked", () => {
    renderPicker();
    expect(
      screen.getByRole("button", { name: STRENGTH_UNIT })
    ).toHaveTextContent(/— select/);
  });

  it("shows the current value instead of the placeholder", () => {
    renderPicker({ value: "mg" });
    expect(
      screen.getByRole("button", { name: STRENGTH_UNIT })
    ).toHaveTextContent("mg");
  });

  it("labels the field from its kind, so the caller does not repeat it", () => {
    renderPicker({ kind: "pack_unit" });
    expect(screen.getByRole("button", { name: PACK_UNIT })).toBeInTheDocument();
  });

  it("offers the shared list when opened", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPanel(user);
    expect(screen.getByRole("button", { name: MG_ROW })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mg/5ml" })).toBeInTheDocument();
  });

  it("reports the pick and closes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await pickTerm(user, STRENGTH_UNIT, "mg");
    expect(onChange).toHaveBeenCalledWith("mg");
    expect(
      screen.queryByRole("button", { name: MG_ROW })
    ).not.toBeInTheDocument();
  });

  it("speaks the kind's own noun in the panel", async () => {
    // A strength unit and a pack unit are the same component, so the wording is
    // the only thing telling the operator which list they are editing.
    const user = userEvent.setup();
    renderPicker({ kind: "pack_unit" });
    await user.click(screen.getByRole("button", { name: PACK_UNIT }));
    expect(
      screen.getByRole("button", { name: "New pack unit" })
    ).toBeInTheDocument();
  });

  describe("adding a term", () => {
    it("offers the inline form from the link under the list", async () => {
      const user = userEvent.setup();
      renderPicker();
      await openPanel(user);
      expect(
        screen.getByRole("button", { name: NEW_UNIT })
      ).toBeInTheDocument();
    });

    it("adds what was typed, selects it, and confirms", async () => {
      const user = userEvent.setup();
      const { onChange } = renderPicker();
      createTermMutate.mockImplementation((_variables, options) =>
        options?.onSuccess?.({
          id: "vt-strength-unit-new",
          kind: "strength_unit",
          name: "µg",
          usageCount: 0,
        })
      );

      await openCreateForm(user);
      await user.type(screen.getByRole("textbox"), "µg");
      await user.click(screen.getByRole("button", { name: "Add" }));

      expect(createTermMutate).toHaveBeenCalledWith(
        { kind: "strength_unit", name: "µg" },
        expect.anything()
      );
      expect(onChange).toHaveBeenCalledWith("µg");
      expect(toastSuccess).toHaveBeenCalledWith("Added µg");
    });

    it("refuses a duplicate before it reaches the database", async () => {
      const user = userEvent.setup();
      renderPicker();
      await openCreateForm(user);
      await user.type(screen.getByRole("textbox"), "mg");
      await user.click(screen.getByRole("button", { name: "Add" }));

      expect(createTermMutate).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith(
        "Could not add the strength unit",
        expect.objectContaining({ description: "mg already exists." })
      );
    });

    it("reports a failed write with the message the data layer gave", async () => {
      const user = userEvent.setup();
      renderPicker();
      createTermMutate.mockImplementation((_variables, options) =>
        options?.onError?.(new Error("database is locked"))
      );

      await openCreateForm(user);
      await user.type(screen.getByRole("textbox"), "µg");
      await user.click(screen.getByRole("button", { name: "Add" }));

      expect(toastError).toHaveBeenCalledWith(
        "Could not add the strength unit",
        expect.objectContaining({ description: "database is locked" })
      );
    });
  });

  describe("renaming a term", () => {
    it("carries the new name into the field, or the form would save a term that is gone", async () => {
      const user = userEvent.setup();
      const { onChange } = renderPicker({ value: "mg" });
      renameTermMutate.mockImplementation((_variables, options) =>
        options?.onSuccess?.({ itemsUpdated: 1, requestsUnresolved: 0 })
      );

      await openRenameForm(user);
      await user.clear(screen.getByRole("textbox"));
      await user.type(screen.getByRole("textbox"), "milligram");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(renameTermMutate).toHaveBeenCalledWith(
        { id: "vt-strength_unit-mg", name: "milligram" },
        expect.anything()
      );
      expect(onChange).toHaveBeenCalledWith("milligram");
    });

    it("leaves the field alone when a different term was the one selected", async () => {
      const user = userEvent.setup();
      const { onChange } = renderPicker({ value: "g" });
      renameTermMutate.mockImplementation((_variables, options) =>
        options?.onSuccess?.({ itemsUpdated: 1, requestsUnresolved: 0 })
      );

      await openRenameForm(user);
      await user.clear(screen.getByRole("textbox"));
      await user.type(screen.getByRole("textbox"), "milligram");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onChange).not.toHaveBeenCalled();
    });

    it("says how many items moved", async () => {
      const user = userEvent.setup();
      renderPicker({ value: "mg" });
      renameTermMutate.mockImplementation((_variables, options) =>
        options?.onSuccess?.({ itemsUpdated: 3, requestsUnresolved: 0 })
      );

      await openRenameForm(user);
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(toastSuccess).toHaveBeenCalledWith("Renamed to mg", {
        description: "3 items now use the new name.",
      });
    });

    it("warns when an older request could not be relinked", async () => {
      // A pre-0009 request row is matched by its copied text alone, so a rename
      // that cannot repair one leaves that history unreachable. The operator is
      // the only one who can re-link it, so the count has to reach them.
      const user = userEvent.setup();
      renderPicker({ value: "mg" });
      renameTermMutate.mockImplementation((_variables, options) =>
        options?.onSuccess?.({ itemsUpdated: 3, requestsUnresolved: 1 })
      );

      await openRenameForm(user);
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(toastSuccess).toHaveBeenCalledWith("Renamed to mg", {
        description:
          "3 items now use the new name. 1 older request could not be relinked — check their history.",
      });
    });
  });

  describe("deleting a term", () => {
    it("refuses a term items still use, and says how many", async () => {
      const user = userEvent.setup();
      // No fixture ships a usage count, because a fresh database has none.
      setTermFixtures("strength_unit", [
        {
          id: "vt-strength_unit-mg",
          kind: "strength_unit",
          name: "mg",
          usageCount: 2,
        },
      ]);
      renderPicker();
      await openPanel(user);
      await user.click(screen.getByRole("button", { name: DELETE_MG }));

      expect(deleteTermMutate).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith("Cannot delete mg", {
        description: "2 items use it. Reassign them first.",
      });
    });

    it("asks once before deleting an unused term", async () => {
      const user = userEvent.setup();
      renderPicker();
      await openDeleteConfirm(user);
      // The name sits in its own `<strong>`, so the sentence is only reachable
      // through a matcher that reads the paragraph's combined text.
      expect(
        screen.getByText(
          (_content, element) =>
            element?.tagName === "P" &&
            /Delete\s+mg\?\s+This cannot be undone\./.test(
              element.textContent ?? ""
            )
        )
      ).toBeInTheDocument();
      expect(deleteTermMutate).not.toHaveBeenCalled();
    });

    it("empties the field when the deleted term was the one selected", async () => {
      const user = userEvent.setup();
      const { onChange } = renderPicker({ value: "mg" });
      deleteTermMutate.mockImplementation((_id, options) =>
        options?.onSuccess?.()
      );

      await openDeleteConfirm(user);
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(deleteTermMutate).toHaveBeenCalledWith(
        "vt-strength_unit-mg",
        expect.anything()
      );
      expect(onChange).toHaveBeenCalledWith("");
      expect(toastSuccess).toHaveBeenCalledWith("mg deleted");
    });
  });

  describe("clearing", () => {
    it("offers a not-recorded row while a value is set", async () => {
      // A native `<select>` could be emptied by choosing its blank option. These
      // fields are documented as optional, so without this there would be no way
      // to record "not stated" once a term had been picked.
      const user = userEvent.setup();
      renderPicker({ value: "mg" });
      await openPanel(user);
      expect(
        screen.getByRole("button", { name: "— not recorded" })
      ).toBeInTheDocument();
    });

    it("does not offer it when nothing is set", async () => {
      const user = userEvent.setup();
      renderPicker();
      await openPanel(user);
      expect(
        screen.queryByRole("button", { name: "— not recorded" })
      ).not.toBeInTheDocument();
    });

    it("empties the field", async () => {
      const user = userEvent.setup();
      const { onChange } = renderPicker({ value: "mg" });
      await clearTerm(user, STRENGTH_UNIT);
      expect(onChange).toHaveBeenCalledWith("");
    });
  });

  it("marks itself invalid when the caller reports a validation error", () => {
    renderPicker({ error: "Choose a pack unit (box, strip, …)." });
    expect(screen.getByRole("button", { name: STRENGTH_UNIT })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(
      screen.getByText("Choose a pack unit (box, strip, …).")
    ).toBeInTheDocument();
  });
});
