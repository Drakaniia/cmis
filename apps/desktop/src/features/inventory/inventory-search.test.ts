import { describe, expect, it } from "vitest";
import {
  inventorySearchEquals,
  inventorySearchFromTab,
  validateInventorySearch,
} from "./inventory-search";

describe("inventory tab search params", () => {
  it("accepts ?tab=trash and ignores the default", () => {
    expect(validateInventorySearch({ tab: "trash" })).toEqual({ tab: "trash" });
    expect(validateInventorySearch({ tab: "stock" })).toEqual({});
    expect(validateInventorySearch({})).toEqual({});
  });

  it("rejects anything that is not a real tab", () => {
    expect(validateInventorySearch({ tab: "recycle" })).toEqual({});
    expect(validateInventorySearch({ tab: 42 })).toEqual({});
    expect(validateInventorySearch({ tab: null })).toEqual({});
  });

  it("round-trips through the URL without a redundant ?tab=stock", () => {
    expect(inventorySearchFromTab("stock")).toEqual({});
    expect(inventorySearchFromTab("trash")).toEqual({ tab: "trash" });
    expect(inventorySearchEquals({}, { tab: "stock" })).toBe(true);
    expect(inventorySearchEquals({ tab: "trash" }, {})).toBe(false);
  });

  it("carries ?item= so an alert page can preselect a product", () => {
    expect(validateInventorySearch({ item: "item-1" })).toEqual({
      item: "item-1",
    });
    expect(
      validateInventorySearch({ item: "  item-1  ", tab: "trash" })
    ).toEqual({ item: "item-1", tab: "trash" });
  });

  it("ignores a blank, missing or non-string ?item=", () => {
    expect(validateInventorySearch({ item: "   " })).toEqual({});
    expect(validateInventorySearch({ item: 42 })).toEqual({});
    expect(validateInventorySearch({})).toEqual({});
  });

  it("treats a differing ?item= as a different URL state", () => {
    expect(inventorySearchEquals({ item: "a" }, { item: "b" })).toBe(false);
    expect(inventorySearchEquals({ item: "a" }, {})).toBe(false);
    expect(inventorySearchEquals({}, { item: "" })).toBe(true);
  });
});
