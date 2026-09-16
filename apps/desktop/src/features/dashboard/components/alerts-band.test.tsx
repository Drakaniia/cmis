import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

import type { DashboardLinkKey, ExpiryAlert, LowStockAlert } from "../types";
import { AlertsBand } from "./alerts-band";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const LINKS: Record<DashboardLinkKey, string> = {
  audit: "/admin/audit",
  expiry: "/admin/inventory/expiry",
  health: "/admin/health",
  inventory: "/admin/inventory",
  lowStock: "/admin/inventory/low-stock",
  requests: "/admin/requests",
};

const EXPIRY_ALERT: ExpiryAlert = {
  batch: "B-1",
  daysUntilExpiry: 3,
  expiry: "2026-09-19",
  id: "B-1",
  medicine: "Paracetamol 500mg",
  qty: 10,
  unit: "units",
};

const LOW_STOCK_ALERT: LowStockAlert = {
  category: "Analgesic",
  id: "item-1",
  medicine: "Paracetamol 500mg",
  qty: 4,
  threshold: 20,
  unit: "left",
  updatedAt: "now",
};

/** The glyph sits on bare card material — no chip behind it. */
const NEUTRAL_GLYPH = /text-muted-foreground\/60/;
const RESERVED_HEIGHT = /min-h-80/;

function listAreas(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-slot="alerts-list"]'));
}

it("keeps both header icons unwashed and neutral", () => {
  const { container } = render(
    <AlertsBand
      expiry={[EXPIRY_ALERT]}
      links={LINKS}
      lowStock={[LOW_STOCK_ALERT]}
    />
  );

  for (const slot of ["expiring", "low-stock"]) {
    const chip = container.querySelector(`[data-icon="${slot}"]`);
    expect(chip?.className).not.toMatch(/bg-/);
    expect(chip?.querySelector("svg")?.getAttribute("class")).toMatch(
      NEUTRAL_GLYPH
    );
  }
});

it("renders both cards as All clear when neither list has anything", () => {
  render(<AlertsBand expiry={[]} links={LINKS} lowStock={[]} />);

  expect(screen.getAllByText("All clear")).toHaveLength(2);
  expect(screen.getByText("Expiring soon")).toBeInTheDocument();
  expect(screen.getByText("Low stock")).toBeInTheDocument();
});

it("reserves the same fixed height for a full card and an empty one", () => {
  const { container } = render(
    <AlertsBand expiry={[]} links={LINKS} lowStock={[LOW_STOCK_ALERT]} />
  );

  const areas = listAreas(container);
  expect(areas).toHaveLength(2);
  for (const area of areas) {
    expect(area.className).toMatch(RESERVED_HEIGHT);
  }
});

it("holds the height with skeletons instead of claiming All clear while loading", () => {
  const { container } = render(
    <AlertsBand expiry={[]} links={LINKS} loading lowStock={[]} />
  );

  expect(screen.queryByText("All clear")).not.toBeInTheDocument();
  const areas = listAreas(container);
  expect(areas).toHaveLength(2);
  for (const area of areas) {
    expect(area.className).toMatch(RESERVED_HEIGHT);
  }
});
