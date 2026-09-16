import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteConfirmModal } from "./delete-confirm-modal";

const MOVE_TO_TRASH_RE = /move to trash/i;
const DELETE_PERMANENTLY_RE = /delete permanently/i;
const REASON_LABEL_RE = /reason for deleting/i;
const TYPE_DELETE_RE = /type DELETE to confirm/i;
const TYPE_PURGE_RE = /type PURGE to confirm/i;
const CANCEL_RE = /cancel/i;

describe("DeleteConfirmModal", () => {
  it("shows the real consequence numbers and gates on the typed word", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmModal
        consequences={["3 batches · 450 units · 42 dispensing records"]}
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        title="Delete Paracetamol 500mg?"
      />
    );

    expect(
      screen.getByText("3 batches · 450 units · 42 dispensing records")
    ).toBeInTheDocument();
    expect(
      screen.getByText("This can be restored from Trash.")
    ).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: MOVE_TO_TRASH_RE });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(TYPE_DELETE_RE), "DELETE");
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("passes the optional reason through, and blank is valid", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmModal
        consequences={["1 batch · 200 units"]}
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        title="Delete batch B-2027-01?"
      />
    );

    await user.click(screen.getByRole("button", { name: "Entered in error" }));
    expect(screen.getByLabelText(REASON_LABEL_RE)).toHaveValue(
      "Entered in error"
    );
    await user.type(screen.getByLabelText(TYPE_DELETE_RE), "DELETE");
    await user.click(screen.getByRole("button", { name: MOVE_TO_TRASH_RE }));

    expect(onConfirm).toHaveBeenCalledWith("Entered in error");
  });

  it("asks for PURGE and drops the reversibility promise when it is permanent", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmModal
        confirmWord="PURGE"
        consequences={["1 product", "3 batches", "42 dispensing records"]}
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        reversible={false}
        title="Permanently delete Paracetamol 500mg?"
      />
    );

    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.queryByText("This can be restored from Trash.")).toBeNull();

    const confirm = screen.getByRole("button", { name: DELETE_PERMANENTLY_RE });
    await user.type(screen.getByLabelText(TYPE_PURGE_RE), "DELETE");
    expect(confirm).toBeDisabled();
    await user.clear(screen.getByLabelText(TYPE_PURGE_RE));
    await user.type(screen.getByLabelText(TYPE_PURGE_RE), "PURGE");
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes without confirming when cancelled", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <DeleteConfirmModal
        consequences={["1 batch"]}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open
        title="Delete batch B-1?"
      />
    );

    await user.click(screen.getByRole("button", { name: CANCEL_RE }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
