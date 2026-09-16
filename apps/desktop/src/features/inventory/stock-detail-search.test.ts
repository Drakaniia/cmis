import { describe, expect, it } from "vitest";
import {
  resolveStockDetailLink,
  validateStockDetailSearch,
} from "./stock-detail-search";

const ROWS = [
  { batch: { batch: "LOT-1" }, item: { id: "item-1" } },
  { batch: { batch: "LOT-2" }, item: { id: "item-1" } },
  { batch: { batch: "LOT-3" }, item: { id: "item-2" } },
];
const KNOWN_ITEMS = ["item-1", "item-2"];

describe("validateStockDetailSearch", () => {
  it("keeps the item and batch a deep link asks for", () => {
    expect(
      validateStockDetailSearch({ batch: "LOT-8842", item: "item-1" })
    ).toEqual({ batch: "LOT-8842", item: "item-1" });
  });

  it("trims surrounding whitespace", () => {
    expect(validateStockDetailSearch({ item: "  item-1  " })).toEqual({
      item: "item-1",
    });
  });

  it("drops blank values so the URL can be cleared with an empty param", () => {
    expect(validateStockDetailSearch({ batch: "", item: "   " })).toEqual({});
  });

  it("ignores non-string and unknown params", () => {
    expect(
      validateStockDetailSearch({
        batch: null,
        extra: "nope",
        item: 42,
        tab: "stock",
      })
    ).toEqual({});
  });

  it("returns an empty object for no search at all", () => {
    expect(validateStockDetailSearch({})).toEqual({});
  });
});

describe("resolveStockDetailLink", () => {
  it("stays idle when no item was asked for", () => {
    expect(resolveStockDetailLink({}, ROWS, KNOWN_ITEMS)).toEqual({
      status: "idle",
    });
  });

  it("ignores a batch with no item to anchor it to", () => {
    expect(
      resolveStockDetailLink({ batch: "LOT-1" }, ROWS, KNOWN_ITEMS)
    ).toEqual({ status: "idle" });
  });

  it("opens the row the link names", () => {
    expect(
      resolveStockDetailLink({ item: "item-1" }, ROWS, KNOWN_ITEMS)
    ).toEqual({ index: 0, status: "open" });
  });

  it("opens the exact batch the link names, not just its item", () => {
    expect(
      resolveStockDetailLink(
        { batch: "LOT-2", item: "item-1" },
        ROWS,
        KNOWN_ITEMS
      )
    ).toEqual({ index: 1, status: "open" });
  });

  it("reports a disposed batch rather than opening a partial modal", () => {
    expect(
      resolveStockDetailLink(
        { batch: "LOT-GONE", item: "item-1" },
        ROWS,
        KNOWN_ITEMS
      )
    ).toEqual({
      message: "That batch is no longer available",
      status: "stale",
    });
  });

  it("reports a deleted item, batch or not", () => {
    expect(
      resolveStockDetailLink(
        { batch: "LOT-9", item: "item-9" },
        ROWS,
        KNOWN_ITEMS
      )
    ).toEqual({
      message: "That item is no longer available",
      status: "stale",
    });
  });
});
