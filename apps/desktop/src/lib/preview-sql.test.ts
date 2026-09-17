// @vitest-environment node

/**
 * The preview SQL bridge is what stands between the browser preview and a real
 * database, and its failure mode is silence: a dropped parameter binds NULL, the
 * row is simply not found, and the UI reports an empty result as if the data
 * were not there. These cases pin the binding down.
 *
 * The condition under test is `?`-style SQL — what the app actually writes. The
 * `$1` rewrite exists for sqlx-shaped statements, but it must not swallow the
 * caller's values when there is nothing to rewrite.
 */

import { describe, expect, it } from "vitest";

import { bindPlaceholders } from "../../dev/preview-sql";

describe("bindPlaceholders", () => {
  it("keeps the caller's values for ?-style SQL", () => {
    const bound = bindPlaceholders(
      "SELECT id FROM inventory_items WHERE lower(trim(display_name)) = lower(trim(?)) LIMIT 1",
      ["Atenolol 50 tab (100/box)"]
    );

    expect(bound.params).toEqual(["Atenolol 50 tab (100/box)"]);
  });

  it("keeps every value, in order, for several ?s", () => {
    const bound = bindPlaceholders("SELECT 1 FROM t WHERE a = ? AND b = ?", [
      "a",
      "b",
    ]);

    expect(bound.params).toEqual(["a", "b"]);
    expect(bound.sql).toBe("SELECT 1 FROM t WHERE a = ? AND b = ?");
  });

  it("rewrites $n placeholders positionally, repeating a value per occurrence", () => {
    const bound = bindPlaceholders("SELECT 1 FROM t WHERE (a = $1 OR c = $3)", [
      "one",
      "two",
      "three",
    ]);

    expect(bound.sql).toBe("SELECT 1 FROM t WHERE (a = ? OR c = ?)");
    expect(bound.params).toEqual(["one", "three"]);
  });

  it("leaves a placeholder inside a string literal alone", () => {
    const bound = bindPlaceholders("SELECT 'a ? b $1' AS lit, t.a FROM t WHERE t.a = ?", [
      "value",
    ]);

    expect(bound.sql).toBe("SELECT 'a ? b $1' AS lit, t.a FROM t WHERE t.a = ?");
    expect(bound.params).toEqual(["value"]);
  });
});
