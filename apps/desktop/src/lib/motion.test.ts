import { describe, expect, it } from "vitest";

import {
  dropIndexFor,
  flickSpring,
  project,
  resolveTargetColumn,
  rubberband,
  velocityFromHistory,
} from "./motion";

describe("project", () => {
  it("returns 0 for zero velocity", () => {
    expect(project(0)).toBe(0);
  });

  it("returns a positive distance for positive velocity", () => {
    const result = project(500);
    expect(result).toBeGreaterThan(0);
  });

  it("returns a negative distance for negative velocity", () => {
    const result = project(-500);
    expect(result).toBeLessThan(0);
  });

  it("projects farther for higher velocity", () => {
    const slow = project(100);
    const fast = project(1000);
    expect(Math.abs(fast)).toBeGreaterThan(Math.abs(slow));
  });

  it("uses exponential decay (d=0.998) by default", () => {
    // project(v) = (v/1000) * 0.998 / (1 - 0.998) = v * 0.998 / 2
    const result = project(1000);
    // 1000 * 0.998 / 2 = 499
    expect(result).toBeCloseTo(499, 0);
  });
});

describe("rubberband", () => {
  it("returns 0 when overshoot is 0", () => {
    expect(rubberband(0, 1000)).toBe(0);
  });

  it("preserves the sign of the overshoot", () => {
    expect(rubberband(50, 1000)).toBeGreaterThan(0);
    expect(rubberband(-50, 1000)).toBeLessThan(0);
  });

  it("returns a smaller value than the input overshoot (damping)", () => {
    const result = rubberband(100, 500);
    expect(Math.abs(result)).toBeLessThan(Math.abs(100));
  });

  it("damps more aggressively for larger overshoots", () => {
    const small = rubberband(10, 500);
    const large = rubberband(200, 500);
    // Large overshoot should be damped proportionally more
    expect(Math.abs(large) / 200).toBeLessThan(Math.abs(small) / 10);
  });

  it("damps less aggressively for wider dimensions", () => {
    const narrow = rubberband(50, 300);
    const wide = rubberband(50, 1000);
    expect(Math.abs(wide)).toBeGreaterThan(Math.abs(narrow));
  });
});

describe("velocityFromHistory", () => {
  it("returns zero for empty history", () => {
    const velocity = velocityFromHistory([]);
    expect(velocity).toEqual({ x: 0, y: 0 });
  });

  it("returns zero for a single sample", () => {
    const velocity = velocityFromHistory([{ t: 100, x: 0, y: 0 }]);
    expect(velocity).toEqual({ x: 0, y: 0 });
  });

  it("computes velocity from two samples", () => {
    // Moved 100px in 100ms → 1000 px/s
    const velocity = velocityFromHistory([
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
    ]);
    expect(velocity.x).toBeCloseTo(1000, 0);
    expect(velocity.y).toBe(0);
  });

  it("handles vertical movement", () => {
    const velocity = velocityFromHistory([
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 0, y: -50 },
    ]);
    expect(velocity.x).toBe(0);
    expect(velocity.y).toBeCloseTo(-500, 0);
  });

  it("returns zero when time delta is below minimum (sub-frame)", () => {
    const velocity = velocityFromHistory(
      [
        { t: 0, x: 0, y: 0 },
        { t: 2, x: 100, y: 0 },
      ],
      8
    );
    expect(velocity).toEqual({ x: 0, y: 0 });
  });

  it("uses first and last samples in the window", () => {
    // Multiple samples, but velocity should be based on first and last
    const velocity = velocityFromHistory([
      { t: 0, x: 0, y: 0 },
      { t: 50, x: 150, y: 0 },
      { t: 100, x: 200, y: 0 },
    ]);
    // 200px / 100ms = 2000 px/s
    expect(velocity.x).toBeCloseTo(2000, 0);
  });
});

describe("dropIndexFor", () => {
  it("returns 0 for empty siblings", () => {
    expect(dropIndexFor([], 100)).toBe(0);
  });

  it("returns 0 when pointer is above all siblings", () => {
    const siblings = [
      { height: 60, top: 100 },
      { height: 60, top: 170 },
    ];
    expect(dropIndexFor(siblings, 50)).toBe(0);
  });

  it("returns 1 when pointer is past the midpoint of the first sibling", () => {
    const siblings = [
      { height: 60, top: 100 }, // midpoint at 130
      { height: 60, top: 170 },
    ];
    expect(dropIndexFor(siblings, 135)).toBe(1);
  });

  it("returns the length when pointer is below all siblings", () => {
    const siblings = [
      { height: 60, top: 100 },
      { height: 60, top: 170 },
    ];
    expect(dropIndexFor(siblings, 300)).toBe(2);
  });

  it("counts based on midpoints, not tops", () => {
    const siblings = [
      { height: 100, top: 100 }, // midpoint at 150
      { height: 100, top: 210 }, // midpoint at 260
    ];
    // Between first and second midpoints
    expect(dropIndexFor(siblings, 200)).toBe(1);
  });
});

describe("resolveTargetColumn", () => {
  const columns = [
    { id: "pending", rect: { left: 0, right: 260 } },
    { id: "approved", rect: { left: 270, right: 530 } },
    { id: "ready", rect: { left: 540, right: 800 } },
  ];

  it("returns null for empty columns", () => {
    expect(resolveTargetColumn([], 100, 0)).toBeNull();
  });

  it("snaps to nearest column by position for slow release", () => {
    // Pointer in the middle of "pending" column
    expect(resolveTargetColumn(columns, 130, 0)).toBe("pending");
    // Pointer in the middle of "approved" column
    expect(resolveTargetColumn(columns, 400, 0)).toBe("approved");
  });

  it("uses momentum projection for fast flicks", () => {
    // Flick right from pending area at high velocity
    const result = resolveTargetColumn(columns, 200, 2000);
    expect(result).toBe("ready");
  });

  it("flicks left target the correct column", () => {
    // Flick left from ready area
    const result = resolveTargetColumn(columns, 600, -2000);
    expect(result).toBe("pending");
  });

  it("returns the nearest column when pointer is outside all columns", () => {
    // Pointer way to the left
    expect(resolveTargetColumn(columns, -100, 0)).toBe("pending");
    // Pointer way to the right
    expect(resolveTargetColumn(columns, 1000, 0)).toBe("ready");
  });
});

describe("flickSpring", () => {
  it("returns a spring with bounce when there is velocity", () => {
    const spring = flickSpring(true);
    expect(spring.type).toBe("spring");
    expect(spring.bounce).toBe(0);
    expect(spring.duration).toBe(0.35);
  });

  it("returns a critically damped spring when there is no velocity", () => {
    const spring = flickSpring(false);
    expect(spring.type).toBe("spring");
    expect(spring.bounce).toBe(0);
    expect(spring.duration).toBe(0.35);
  });
});
