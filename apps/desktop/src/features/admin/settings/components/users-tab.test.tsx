import { Toaster } from "@cmis/ui/components/sonner";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { UsersTab } from "./users-tab";

const CREATE_USER = /Create User/i;
const CONFIRM_DEACTIVATE = /^Deactivate$/i;

describe("UsersTab", () => {
  it("renders the seeded accounts instead of an empty roster", () => {
    render(
      <>
        <Toaster position="bottom-right" richColors />
        <UsersTab />
      </>
    );

    // Seed data must show without any user action — the tab opens functional.
    expect(screen.getByText("A. Lim")).toBeInTheDocument();
    expect(screen.getByText("admin@cmis.app")).toBeInTheDocument();
    expect(screen.getByText("R. Dizon")).toBeInTheDocument();
    expect(screen.getByText("staff@cmis.app")).toBeInTheDocument();
  });

  it("creates a user through the form and lists it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster position="bottom-right" richColors />
        <UsersTab />
      </>
    );

    await user.click(screen.getByRole("button", { name: CREATE_USER }));

    const dialog = await screen.findByRole("dialog", { name: CREATE_USER });
    const nameInput = dialog.querySelectorAll("input")[0] as HTMLInputElement;
    const emailInput = dialog.querySelectorAll("input")[1] as HTMLInputElement;
    const passwordInput = dialog.querySelectorAll(
      "input"
    )[2] as HTMLInputElement;
    await user.type(nameInput, "J. Cruz");
    await user.type(emailInput, "jcruz@cmis.app");
    await user.type(passwordInput, "temp-password-1");

    // Scope to the dialog: the card's own "Create User" button is still mounted.
    await user.click(within(dialog).getByRole("button", { name: CREATE_USER }));

    expect(await screen.findByText("J. Cruz")).toBeInTheDocument();
    expect(screen.getByText("jcruz@cmis.app")).toBeInTheDocument();
  });

  it("deactivates an active user after confirming", () => {
    render(
      <>
        <Toaster position="bottom-right" richColors />
        <UsersTab />
      </>
    );

    // The dropdown runs on fireEvent rather than user-event: jsdom never fires
    // the transition Base UI waits for when a menu closes, so user-event's
    // pointer sequence (and its keyboard equivalent) stalls for the rest of the
    // test. What this asserts is the handler behind the item, all the same.
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for R. Dizon" })
    );
    fireEvent.click(screen.getByText("Deactivate"));

    expect(screen.getByText("Deactivate user?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: CONFIRM_DEACTIVATE }));

    // Row status flips to Inactive.
    const row = screen.getByText("R. Dizon").closest("div.grid");
    expect(row).toHaveTextContent("Inactive");
  }, 30_000);
});
