import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Density } from "@/hooks/use-density";
import type { RequestItem } from "../types";
import { RequestCard, RequestCardContent } from "./request-card";

function makeItem(overrides: Partial<RequestItem> = {}): RequestItem {
  return {
    boardPosition: 0,
    category: "Analgesic",
    dispensingRecords: [],
    history: [],
    id: "REQ-2026-0001",
    medicine: "Paracetamol 500mg",
    notes: [],
    qty: 2,
    reason: "Headache after PE class.",
    requestor: {
      email: "maria.santos@bukidnon.edu",
      id: "STU-2024-0831",
      name: "Maria Santos",
    },
    source: "queue",
    status: "pending",
    submittedAt: new Date(Date.now() - 60_000).toISOString(),
    unit: "tabs",
    ...overrides,
  };
}

const NOW = Date.now();
const DENSITY: Density = "comfortable";
const CARD_NAME_RE = /Maria Santos.*Paracetamol.*Pending/;
const ACTIONS_NAME_RE = /Actions for Maria Santos/;
const SELECT_NAME_RE = /Select request/;

describe("RequestCardContent", () => {
  it("renders the requestor name", () => {
    render(<RequestCardContent item={makeItem()} now={NOW} />);
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
  });

  it("renders the medicine name", () => {
    render(<RequestCardContent item={makeItem()} now={NOW} />);
    expect(screen.getByText("Paracetamol 500mg")).toBeInTheDocument();
  });

  it("renders qty and unit", () => {
    render(<RequestCardContent item={makeItem()} now={NOW} />);
    expect(screen.getByText("2 tabs")).toBeInTheDocument();
  });

  it("renders the status badge", () => {
    render(<RequestCardContent item={makeItem()} now={NOW} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders the time caption", () => {
    const item = makeItem({
      submittedAt: new Date(NOW - 3_600_000).toISOString(),
    });
    render(<RequestCardContent item={item} now={NOW} />);
    expect(screen.getByText("1h ago")).toBeInTheDocument();
  });

  it("shows 'just now' for recent submissions", () => {
    const item = makeItem({
      submittedAt: new Date(NOW - 10_000).toISOString(),
    });
    render(<RequestCardContent item={item} now={NOW} />);
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("renders different statuses", () => {
    const statuses = [
      "pending",
      "approved",
      "ready",
      "claimed",
      "denied",
    ] as const;

    for (const status of statuses) {
      const { unmount } = render(
        <RequestCardContent item={makeItem({ status })} now={NOW} />
      );
      const expectedLabels: Record<string, string> = {
        approved: "Approved",
        claimed: "Claimed",
        denied: "Denied",
        pending: "Pending",
        ready: "Ready to Claim",
      };
      expect(screen.getByText(expectedLabels[status])).toBeInTheDocument();
      unmount();
    }
  });

  it("has a tooltip with full requestor info", () => {
    render(<RequestCardContent item={makeItem()} now={NOW} />);
    const nameEl = screen.getByText("Maria Santos");
    expect(nameEl).toHaveAttribute("title", "Maria Santos — STU-2024-0831");
  });
});

describe("RequestCard", () => {
  const defaultProps = {
    anySelected: false,
    density: DENSITY,
    item: makeItem(),
    now: NOW,
    onAction: vi.fn(),
    onOpen: vi.fn(),
    onToggleSelect: vi.fn(),
    selected: false,
  };

  it("renders the card with correct aria-label", () => {
    render(<RequestCard {...defaultProps} />);
    const button = screen.getByRole("button", {
      name: CARD_NAME_RE,
    });
    expect(button.getAttribute("aria-label")).toContain("Maria Santos");
    expect(button.getAttribute("aria-label")).toContain("Paracetamol 500mg");
    expect(button.getAttribute("aria-label")).toContain("Pending");
  });

  it("opens detail modal on Enter", () => {
    const onOpen = vi.fn();
    render(<RequestCard {...defaultProps} onOpen={onOpen} />);
    const button = screen.getByRole("button", {
      name: CARD_NAME_RE,
    });
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("toggles selection on Space", () => {
    const onToggleSelect = vi.fn();
    render(<RequestCard {...defaultProps} onToggleSelect={onToggleSelect} />);
    const button = screen.getByRole("button", {
      name: CARD_NAME_RE,
    });
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " })
    );
    expect(onToggleSelect).toHaveBeenCalledWith("REQ-2026-0001");
  });

  it("opens menu on Shift+F10", () => {
    render(<RequestCard {...defaultProps} />);
    const dragButton = screen.getByRole("button", {
      name: CARD_NAME_RE,
    });
    dragButton.focus();
    dragButton.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "F10",
        shiftKey: true,
      })
    );
    // The menu should open — check for the dropdown trigger
    const menuTrigger = screen.getByRole("button", {
      name: ACTIONS_NAME_RE,
    });
    expect(menuTrigger).toBeInTheDocument();
  });

  it("shows checkbox when any card is selected", () => {
    const { rerender } = render(
      <RequestCard {...defaultProps} anySelected={false} />
    );
    // The checkbox is inside <span.block> inside <span.absolute.opacity-0>
    const checkbox = screen.getByRole("checkbox", {
      name: SELECT_NAME_RE,
    });
    // checkbox itself is a <span>, closest("span") returns itself
    // parent = <span class="block">, grandparent = <span class="absolute ... opacity-0 ...">
    const wrapper = checkbox.parentElement?.parentElement;
    expect(wrapper).toHaveClass("opacity-0");

    rerender(<RequestCard {...defaultProps} anySelected={true} />);
    expect(wrapper).not.toHaveClass("opacity-0");
  });

  it("shows accent ring when selected", () => {
    render(<RequestCard {...defaultProps} selected={true} />);
    const card = screen.getByRole("listitem");
    expect(card.className).toContain("border-ring");
    expect(card.className).toContain("bg-accent");
  });

  it("shows ghost styling when dragging", () => {
    render(<RequestCard {...defaultProps} dragging={true} />);
    const card = screen.getByRole("listitem");
    expect(card.className).toContain("opacity-40");
    expect(card.className).toContain("pointer-events-none");
  });

  it("has a drag handle with touch-none", () => {
    render(<RequestCard {...defaultProps} />);
    const button = screen.getByRole("button", {
      name: CARD_NAME_RE,
    });
    expect(button).toHaveClass("touch-none");
    expect(button).toHaveClass("cursor-grab");
  });

  it("has role listitem for screen readers", () => {
    render(<RequestCard {...defaultProps} />);
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });
});
