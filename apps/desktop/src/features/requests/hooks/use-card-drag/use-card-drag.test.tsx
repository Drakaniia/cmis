import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useMotionValueEvent } from "motion/react";
import { useCallback, useRef, useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import { STATUS_ORDER } from "../../transitions";
import type { RequestItem, RequestStatus } from "../../types";
import { useCardDrag } from "./use-card-drag";

/**
 * D21 — simulated pointer events for the refusal path.
 *
 * The engine is driven the way the board drives it: real `pointerdown` /
 * `pointermove` / `pointerup` events over columns whose geometry is stubbed, so
 * a refusal is proved end to end — the lane it resolved to, the callbacks it
 * fired, and the phase and overlay it left behind.
 */

function rect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  } as DOMRect;
}

const BOARD = rect(0, 0, 900, 600);
const CARD = rect(120, 80, 220, 84);

/** Lanes do not cover the board: `x = 880` is the board's own dead space. */
const LANE_RECTS: Record<RequestStatus, DOMRect> = {
  approved: rect(180, 0, 180, 600),
  claimed: rect(540, 0, 160, 600),
  denied: rect(700, 0, 160, 600),
  pending: rect(0, 0, 180, 600),
  ready: rect(360, 0, 180, 600),
};

const DEAD_SPACE = { x: 880, y: 300 };
const READY_LANE = { x: 450, y: 300 };
const APPROVED_LANE = { x: 270, y: 300 };

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
    reason: "test",
    requestor: { email: "a@b.c", id: "STU-1", name: "Test Viewer" },
    source: "queue",
    status: "pending",
    submittedAt: new Date().toISOString(),
    unit: "tabs",
    ...overrides,
  };
}

function Lane({
  onRegisterColumn,
  status,
}: {
  onRegisterColumn: (
    status: RequestStatus,
    element: HTMLElement | null
  ) => void;
  status: RequestStatus;
}) {
  // The stub lives on the ref so every hit-test sees the lane's real geometry.
  const laneRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        element.getBoundingClientRect = () => LANE_RECTS[status];
      }
      onRegisterColumn(status, element);
    },
    [onRegisterColumn, status]
  );
  return <div data-testid={`lane-${status}`} ref={laneRef} />;
}

function Harness({
  item,
  onCancel,
  onCommit,
  onForbidden,
}: {
  item: RequestItem;
  onCancel: (reason: string) => void;
  onCommit: (id: string, status: RequestStatus, index: number) => void;
  onForbidden: (item: RequestItem, status: RequestStatus) => void;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const drag = useCardDrag({ boardRef, onCancel, onCommit, onForbidden });
  // Test-only readout of the tracked offset, so a test can prove the pointer
  // stops owning the card once a slot pulls it (motion values do not render).
  const [trackedX, setTrackedX] = useState("0");
  useMotionValueEvent(drag.dragX, "change", (value) =>
    setTrackedX(String(Math.round(value)))
  );
  const boardNodeRef = useCallback((element: HTMLDivElement | null) => {
    boardRef.current = element;
    if (element) {
      element.getBoundingClientRect = () => BOARD;
    }
  }, []);
  const cardRef = useCallback((element: HTMLButtonElement | null) => {
    if (element) {
      element.getBoundingClientRect = () => CARD;
    }
  }, []);
  return (
    <div>
      <div data-testid="board" ref={boardNodeRef} />
      {STATUS_ORDER.map((status) => (
        <Lane
          key={status}
          onRegisterColumn={drag.registerColumn}
          status={status}
        />
      ))}
      <button
        data-testid="card"
        ref={cardRef}
        type="button"
        {...drag.cardHandlers(item)}
      >
        card
      </button>
      <span data-testid="phase">{drag.phase}</span>
      <span data-testid="overlay">{drag.overlay ? "in-flight" : "clear"}</span>
      <span data-testid="dragx">{trackedX}</span>
    </div>
  );
}

/** Lifts the card past the hysteresis threshold and carries it to a point. */
function liftTo(card: HTMLElement, target: { x: number; y: number }) {
  fireEvent.pointerDown(card, {
    button: 0,
    clientX: 200,
    clientY: 100,
    pointerId: 1,
  });
  fireEvent.pointerMove(card, { clientX: 240, clientY: 200, pointerId: 1 });
  fireEvent.pointerMove(card, {
    clientX: target.x,
    clientY: target.y,
    pointerId: 1,
  });
}

function release(target: { x: number; y: number }) {
  // Bubbles to the window, which is the authoritative end of a gesture.
  fireEvent.pointerUp(document.body, {
    clientX: target.x,
    clientY: target.y,
    pointerId: 1,
  });
}

type CancelHandler = (reason: string) => void;
type CommitHandler = (id: string, status: RequestStatus, index: number) => void;
type ForbiddenHandler = (item: RequestItem, status: RequestStatus) => void;

interface Handlers {
  onCancel: Mock<CancelHandler>;
  onCommit: Mock<CommitHandler>;
  onForbidden: Mock<ForbiddenHandler>;
}

function mount(item: RequestItem, handlers: Partial<Handlers> = {}) {
  const onCancel = handlers.onCancel ?? vi.fn<CancelHandler>();
  const onCommit = handlers.onCommit ?? vi.fn<CommitHandler>();
  const onForbidden = handlers.onForbidden ?? vi.fn<ForbiddenHandler>();
  render(
    <Harness
      item={item}
      onCancel={onCancel}
      onCommit={onCommit}
      onForbidden={onForbidden}
    />
  );
  return {
    card: screen.getByTestId("card"),
    dragX: () => screen.getByTestId("dragx").textContent,
    onCancel,
    onCommit,
    onForbidden,
    overlay: () => screen.getByTestId("overlay").textContent,
    phase: () => screen.getByTestId("phase").textContent,
  };
}

beforeAll(() => {
  // Reduced motion makes every settle a static jump, so the phase and the
  // overlay can be asserted synchronously instead of waiting out a spring
  // (F11/E21).
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
    writable: true,
  });
});

beforeEach(() => {
  // A frozen clock gives every pointer history sample the same timestamp, so
  // `velocityFromHistory` refuses it (dt < 8ms) and the destination is decided
  // by position — the same as a slow, deliberate release.
  vi.useFakeTimers({
    toFake: [
      "Date",
      "cancelAnimationFrame",
      "clearTimeout",
      "performance",
      "requestAnimationFrame",
      "setTimeout",
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useCardDrag — lift and tracking", () => {
  it("lifts only after the hysteresis threshold, then follows the pointer", () => {
    const { card, phase, overlay } = mount(makeItem());
    expect(phase()).toBe("idle");
    expect(overlay()).toBe("clear");

    fireEvent.pointerDown(card, {
      button: 0,
      clientX: 200,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(card, { clientX: 204, clientY: 102, pointerId: 1 });
    expect(phase()).toBe("idle");

    fireEvent.pointerMove(card, { clientX: 240, clientY: 200, pointerId: 1 });
    expect(phase()).toBe("dragging");
    expect(overlay()).toBe("in-flight");
  });

  it("shows a grabbing cursor over a lane that can take the card", () => {
    const { card } = mount(makeItem({ status: "pending" }));
    liftTo(card, APPROVED_LANE);
    expect(document.body.dataset.dragPhase).toBe("grabbing");
  });

  it("shows a not-allowed cursor over a lane that cannot", () => {
    const { card } = mount(makeItem({ status: "claimed" }));
    liftTo(card, READY_LANE);
    expect(document.body.dataset.dragPhase).toBe("not-allowed");
  });
});

describe("useCardDrag — refusal path", () => {
  it("refuses a Claimed card on another lane and writes nothing", () => {
    const item = makeItem({ status: "claimed" });
    const { card, onCancel, onCommit, onForbidden, phase, overlay } =
      mount(item);

    liftTo(card, READY_LANE);
    expect(phase()).toBe("dragging");
    expect(document.body.dataset.dragPhase).toBe("not-allowed");

    release(READY_LANE);

    expect(onForbidden).toHaveBeenCalledTimes(1);
    expect(onForbidden.mock.calls[0][0]).toBe(item);
    expect(onForbidden.mock.calls[0][1]).toBe("ready");
    expect(onCancel).not.toHaveBeenCalled();
    // The refusal is pure feedback: no commit, so no status change and no write.
    expect(onCommit).not.toHaveBeenCalled();

    // F1/F4.1 — the board is unstyled and interactive again on release, even
    // though the card is still animating home.
    expect(phase()).toBe("idle");
    expect(overlay()).toBe("clear");
    expect(document.body.dataset.dragPhase).toBeUndefined();
  });

  it("refuses every lane for a Claimed card, one at a time", () => {
    const { card, onForbidden } = mount(makeItem({ status: "claimed" }));
    for (const lane of [APPROVED_LANE, READY_LANE]) {
      liftTo(card, lane);
      release(lane);
    }
    // One callback per attempt, each resolving to a different destination lane —
    // the page keys the toast on that lane, so repeats replace, never stack.
    expect(onForbidden).toHaveBeenCalledTimes(2);
    expect(onForbidden.mock.calls[0][1]).toBe("approved");
    expect(onForbidden.mock.calls[1][1]).toBe("ready");
  });
});

describe("useCardDrag — cancel path", () => {
  it("cancels a release that lands outside every lane", () => {
    const item = makeItem({ status: "pending" });
    const { card, onCancel, onCommit, onForbidden, phase } = mount(item);

    liftTo(card, DEAD_SPACE);
    // Nothing under the pointer, but the card is still in the air.
    expect(document.body.dataset.dragPhase).toBe("not-allowed");
    release(DEAD_SPACE);

    expect(onCancel).toHaveBeenCalledWith("cancel");
    expect(onCommit).not.toHaveBeenCalled();
    expect(onForbidden).not.toHaveBeenCalled();
    expect(phase()).toBe("idle");
  });

  it("cancels a release over the board's chrome", () => {
    const { card, onCancel, onForbidden } = mount(makeItem());
    liftTo(card, READY_LANE);
    // Below the board: the filter bar / batch toolbar region.
    fireEvent.pointerUp(document.body, {
      clientX: 450,
      clientY: 700,
      pointerId: 1,
    });
    expect(onCancel).toHaveBeenCalledWith("cancel");
    expect(onForbidden).not.toHaveBeenCalled();
  });

  it("cancels on Escape", () => {
    const { card, onCancel, phase, overlay } = mount(makeItem());
    liftTo(card, READY_LANE);
    expect(phase()).toBe("dragging");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledWith("escape");
    expect(phase()).toBe("idle");
    expect(overlay()).toBe("clear");
  });

  it("clears a gesture whose pointerup never arrives (watchdog)", () => {
    const item = makeItem({ status: "claimed" });
    const { card, onCancel, onForbidden, phase, overlay } = mount(item);
    liftTo(card, READY_LANE);
    expect(phase()).toBe("dragging");

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(onCancel).toHaveBeenCalledWith("watchdog");
    expect(onForbidden).not.toHaveBeenCalled();
    expect(phase()).toBe("idle");
    expect(overlay()).toBe("clear");
    expect(document.body.dataset.dragPhase).toBeUndefined();
  });
});

describe("useCardDrag — magnet", () => {
  it("holds the card on the slot instead of tracking the pointer", () => {
    const { card, dragX } = mount(makeItem({ status: "pending" }));
    liftTo(card, APPROVED_LANE);
    const locked = dragX();
    // The pull has already placed it — not at the gesture's origin.
    expect(locked).not.toBe("0");

    fireEvent.pointerMove(card, { clientX: 300, clientY: 340, pointerId: 1 });

    // Approved still takes the card, so the cursor must not drag it off the
    // slot it is being pulled onto (F1).
    expect(dragX()).toBe(locked);
  });

  it("resumes 1:1 tracking where no lane can take the card", () => {
    const { card, dragX } = mount(makeItem({ status: "pending" }));
    liftTo(card, APPROVED_LANE);
    expect(dragX()).not.toBe("0");

    // The board's own padding is not a lane, so the card follows the cursor
    // again rather than being pinned to the last slot.
    fireEvent.pointerMove(card, { clientX: 880, clientY: 300, pointerId: 1 });
    expect(dragX()).not.toBe("0");
    expect(Number(dragX())).toBeGreaterThan(0);
  });

  it("drops without release momentum while magnetised", () => {
    const item = makeItem({ status: "pending" });
    const { card, onCommit } = mount(item);
    liftTo(card, APPROVED_LANE);
    release(APPROVED_LANE);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][1]).toBe("approved");
  });
});

describe("useCardDrag — legal drop", () => {
  it("commits a legal drop and clears the overlay", () => {
    const item = makeItem({ status: "pending" });
    const { card, onCancel, onCommit, onForbidden, phase, overlay } =
      mount(item);

    liftTo(card, APPROVED_LANE);
    release(APPROVED_LANE);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toBe(item.id);
    expect(onCommit.mock.calls[0][1]).toBe("approved");
    expect(onForbidden).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(phase()).toBe("idle");
    expect(overlay()).toBe("clear");
  });
});
