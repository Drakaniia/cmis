import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RequestorDirectory } from "../requestors";
import { RequestorsPopover } from "./requestors-popover";

// Base UI's positioner costs ~20s per open under jsdom; the shim keeps the panel
// on the fast path while still exercising the real open/close wiring.
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));

const DIRECTORY: RequestorDirectory = {
  anonymousCount: 3,
  requestors: [
    {
      count: 2,
      email: "ana@bukidnon.edu",
      filterValue: "STU-0001",
      id: "STU-0001",
      key: "id:stu-0001",
      lastSubmittedAt: "2026-02-01T00:00:00.000Z",
      name: "Ana Reyes",
    },
    {
      count: 1,
      email: "",
      filterValue: "Ben Cruz",
      id: "",
      key: "name:ben cruz",
      lastSubmittedAt: "2026-01-01T00:00:00.000Z",
      name: "Ben Cruz",
    },
  ],
};

const TRIGGER = /^Requestors/;
const ANA_ROW = /^Ana Reyes/;
const BEN_ROW = /^Ben Cruz/;

function renderPopover(
  overrides: Partial<RequestorDirectory> = {},
  selected?: string
) {
  const onSelect = vi.fn();
  render(
    <RequestorsPopover
      directory={{ ...DIRECTORY, ...overrides }}
      onSelect={onSelect}
      selected={selected}
    />
  );
  return { onSelect };
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: TRIGGER }));
}

describe("RequestorsPopover", () => {
  it("counts the known requestors on the trigger", () => {
    renderPopover();
    expect(screen.getByRole("button", { name: TRIGGER })).toHaveTextContent(
      "2"
    );
  });

  it("lists every requestor with their request count", async () => {
    const user = userEvent.setup();
    renderPopover();
    await open(user);

    expect(screen.getByRole("button", { name: ANA_ROW })).toHaveTextContent(
      "2 requests"
    );
    expect(screen.getByRole("button", { name: BEN_ROW })).toHaveTextContent(
      "1 request"
    );
  });

  it("filters the list by name, ID or email", async () => {
    const user = userEvent.setup();
    renderPopover();
    await open(user);

    await user.type(screen.getByLabelText("Search requestors"), "ana@");

    expect(screen.getByRole("button", { name: ANA_ROW })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: BEN_ROW })).toBeNull();
  });

  it("reports the requestor's filter value when picked", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPopover();
    await open(user);

    await user.click(screen.getByRole("button", { name: BEN_ROW }));

    expect(onSelect).toHaveBeenCalledWith("Ben Cruz");
  });

  it("marks the requestor the board is already filtered to", async () => {
    const user = userEvent.setup();
    renderPopover({}, "STU-0001");
    await open(user);

    expect(screen.getByRole("button", { name: ANA_ROW })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: BEN_ROW })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("summarises anonymous walk-ins instead of listing them", async () => {
    const user = userEvent.setup();
    renderPopover();
    await open(user);

    expect(screen.getByText(/3 walk-in requests/)).toBeInTheDocument();
  });

  it("says so when the queue holds no requestors yet", async () => {
    const user = userEvent.setup();
    renderPopover({ anonymousCount: 0, requestors: [] });
    await open(user);

    expect(screen.getByText("No requestors yet.")).toBeInTheDocument();
  });
});
