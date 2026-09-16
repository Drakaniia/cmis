import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ChoiceScreen } from "./choice-screen";

const ADD_BATCHES = /add batches/i;
const DELIVERY_SHEET = /delivery sheet/i;
const NEW_PRODUCT = /new product/i;

function renderScreen(hasItems: boolean) {
  const handlers = {
    onAddBatches: vi.fn(),
    onDeliverySheet: vi.fn(),
    onNewProduct: vi.fn(),
  };
  render(<ChoiceScreen hasItems={hasItems} {...handlers} />);
  return handlers;
}

it("offers the three creation paths, delivery sheet included on an empty database", () => {
  renderScreen(false);

  expect(screen.getByRole("button", { name: NEW_PRODUCT })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: DELIVERY_SHEET })).toBeEnabled();
  expect(screen.getByRole("button", { name: ADD_BATCHES })).toBeDisabled();
  expect(screen.getByText("No inventory items to add to.")).toBeInTheDocument();
});

it("enables adding batches once inventory exists", async () => {
  const handlers = renderScreen(true);

  const card = screen.getByRole("button", { name: ADD_BATCHES });
  expect(card).toBeEnabled();
  await userEvent.click(card);

  expect(handlers.onAddBatches).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByText("No inventory items to add to.")
  ).not.toBeInTheDocument();
});

it("leads each card to its own path", async () => {
  const handlers = renderScreen(true);

  await userEvent.click(screen.getByRole("button", { name: NEW_PRODUCT }));
  await userEvent.click(screen.getByRole("button", { name: DELIVERY_SHEET }));

  expect(handlers.onNewProduct).toHaveBeenCalledTimes(1);
  expect(handlers.onDeliverySheet).toHaveBeenCalledTimes(1);
});
