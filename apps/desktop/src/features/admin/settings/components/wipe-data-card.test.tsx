import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WipeDataCard } from "./wipe-data-card";

const WIPE_ALL_DATA = /wipe all data/i;
const WIPE_DATA = /^wipe data$/i;
const COPY_WIPE = /copy wipe/i;
const TYPE_WIPE = /type wipe to confirm/i;

function renderCard(
  onWipe: (opts?: { resetSettings?: boolean }) => Promise<void>
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <WipeDataCard onWipe={onWipe} />
    </QueryClientProvider>
  );
  return { invalidate };
}

describe("WipeDataCard", () => {
  it("keeps confirm disabled until WIPE is typed", async () => {
    const user = userEvent.setup();
    const onWipe = vi.fn();
    renderCard(onWipe);

    await user.click(screen.getByRole("button", { name: WIPE_ALL_DATA }));

    const confirm = screen.getByRole("button", { name: WIPE_DATA });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(TYPE_WIPE), "wipe");
    expect(confirm).toBeDisabled();

    await user.clear(screen.getByLabelText(TYPE_WIPE));
    await user.type(screen.getByLabelText(TYPE_WIPE), "WIPE");
    expect(confirm).toBeEnabled();
    expect(onWipe).not.toHaveBeenCalled();
  });

  it("fills the field from the copy button", async () => {
    const user = userEvent.setup();
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    renderCard(vi.fn());

    await user.click(screen.getByRole("button", { name: WIPE_ALL_DATA }));
    await user.click(screen.getByRole("button", { name: COPY_WIPE }));

    expect(clipboard.writeText).toHaveBeenCalledWith("WIPE");
  });

  it("wipes with the reset opt-in and drops every cached query", async () => {
    const user = userEvent.setup();
    const onWipe = vi.fn().mockResolvedValue(undefined);
    const { invalidate } = renderCard(onWipe);

    await user.click(screen.getByRole("button", { name: WIPE_ALL_DATA }));
    await user.type(screen.getByLabelText(TYPE_WIPE), "WIPE");
    await user.click(screen.getByRole("button", { name: WIPE_DATA }));

    expect(onWipe).toHaveBeenCalledWith({ resetSettings: true });
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it("reports a failed wipe without invalidating caches", async () => {
    const user = userEvent.setup();
    const onWipe = vi.fn().mockRejectedValue(new Error("disk is locked"));
    const { invalidate } = renderCard(onWipe);

    await user.click(screen.getByRole("button", { name: WIPE_ALL_DATA }));
    await user.type(screen.getByLabelText(TYPE_WIPE), "WIPE");
    await user.click(screen.getByRole("button", { name: WIPE_DATA }));

    await vi.waitFor(() => expect(onWipe).toHaveBeenCalled());
    expect(invalidate).not.toHaveBeenCalled();
  });
});
