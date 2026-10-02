import { describe, expect, it } from "vitest";

import { MIN_THUMB_LENGTH, measureThumb } from "./geometry";

describe("measureThumb", () => {
  it("reports nothing to scroll when the content fits", () => {
    expect(measureThumb(500, 500, 500, 0)).toEqual({
      length: 0,
      offset: 0,
      scrollable: 0,
    });
  });

  it("reports nothing to scroll for a collapsed box", () => {
    expect(measureThumb(0, 0, 1200, 0).scrollable).toBe(0);
  });

  it("sizes the thumb to the viewport's share of the content", () => {
    const thumb = measureThumb(500, 1000, 2000, 0);

    expect(thumb.length).toBe(250);
    expect(thumb.scrollable).toBe(1000);
    expect(thumb.offset).toBe(0);
  });

  it("parks the thumb at the far end once scrolled to the bottom", () => {
    const thumb = measureThumb(500, 1000, 2000, 1000);

    expect(thumb.offset).toBe(250);
  });

  it("moves the thumb half the leftover track at the halfway point", () => {
    expect(measureThumb(500, 1000, 2000, 500).offset).toBe(125);
  });

  it("clamps a position past either end", () => {
    expect(measureThumb(500, 1000, 2000, -80).offset).toBe(0);
    expect(measureThumb(500, 1000, 2000, 99_000).offset).toBe(250);
  });

  it("keeps a barely-visible thumb grabbable", () => {
    const thumb = measureThumb(40, 100, 100_000, 99_900);

    expect(thumb.length).toBe(MIN_THUMB_LENGTH);
    expect(thumb.offset).toBe(16);
  });

  it("fills a track too short to hold a minimum thumb", () => {
    const thumb = measureThumb(10, 10, 1000, 500);

    expect(thumb.length).toBe(10);
    expect(thumb.offset).toBe(0);
  });
});
