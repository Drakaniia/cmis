import {
  type AnimationPlaybackControls,
  animate,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import * as React from "react";

import {
  dragHysteresisPx,
  dropIndexFor,
  flickSpring,
  resolveTargetColumn,
  rubberband,
  snapVelocityPxPerSec,
  velocityFromHistory,
} from "@/lib/motion";
import { canMove } from "../transitions";
import type { RequestItem, RequestStatus } from "../types";

/** Where a card would land if the pointer were released now. */
export interface DropTarget {
  index: number;
  status: RequestStatus;
  valid: boolean;
}

interface Rect {
  height: number;
  left: number;
  top: number;
  width: number;
}

/** What the board renders while a card is lifted or settling. */
export interface DragOverlay {
  fromStatus: RequestStatus;
  item: RequestItem;
  originRect: Rect;
  target: DropTarget | null;
}

interface Session {
  baseX: number;
  baseY: number;
  cardId: string;
  element: HTMLElement;
  fromStatus: RequestStatus;
  history: { t: number; x: number; y: number }[];
  item: RequestItem;
  originRect: Rect;
  pointerId: number;
  started: boolean;
  startPoint: { x: number; y: number };
  target: DropTarget | null;
}

const HISTORY_LIMIT = 6;
const EDGE_INSET = 8;

function toRect(rect: {
  height: number;
  left: number;
  top: number;
  width: number;
}): Rect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.index === b.index && a.status === b.status && a.valid === b.valid;
}

/**
 * CMIS-UI-05 §4.1 — the Kanban drag engine.
 *
 * Apple's fluid-interface rules throughout: the lift waits for 10px of
 * hysteresis so a tap stays a tap, tracking is 1:1 with the pointer (never
 * springed mid-gesture), release velocity is read from a short pointer history,
 * the destination comes from the momentum-projected endpoint rather than the
 * release point, edges rubber-band instead of stopping dead, and the settle can
 * be grabbed again mid-flight because it animates the same motion values the
 * pointer writes to.
 */
export function useCardDrag({
  boardRef,
  onCommit,
  onForbidden,
}: {
  boardRef: React.RefObject<HTMLDivElement | null>;
  onCommit: (id: string, status: RequestStatus, index: number) => void;
  onForbidden: (status: RequestStatus) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const prefersReducedMotion = useReducedMotion();

  const sessionRef = React.useRef<Session | null>(null);
  const settleRef = React.useRef<AnimationPlaybackControls[] | null>(null);
  const columnRefs = React.useRef(new Map<RequestStatus, HTMLElement>());
  const suppressClickRef = React.useRef(false);

  const [overlay, setOverlay] = React.useState<DragOverlay | null>(null);
  const [shake, setShake] = React.useState<RequestStatus | null>(null);

  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;
  const onForbiddenRef = React.useRef(onForbidden);
  onForbiddenRef.current = onForbidden;
  const reducedRef = React.useRef(prefersReducedMotion);
  reducedRef.current = prefersReducedMotion;

  /** Columns register themselves so hit-testing can use live geometry. */
  const registerColumn = React.useCallback(
    (status: RequestStatus, element: HTMLElement | null) => {
      if (element) {
        columnRefs.current.set(status, element);
      } else {
        columnRefs.current.delete(status);
      }
    },
    []
  );

  const stopSettle = React.useCallback(() => {
    for (const controls of settleRef.current ?? []) {
      controls.stop();
    }
    settleRef.current = null;
  }, []);

  const measureColumns = React.useCallback(
    () =>
      [...columnRefs.current.entries()]
        .map(([status, element]) => {
          const rect = element.getBoundingClientRect();
          return {
            id: status,
            rect: {
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              top: rect.top,
            },
          };
        })
        .sort((a, b) => a.rect.left - b.rect.left),
    []
  );

  /** Siblings inside a column body, excluding the card currently in flight. */
  const siblingsOf = React.useCallback(
    (status: RequestStatus, excludeId: string) => {
      const element = columnRefs.current.get(status);
      if (!element) {
        return [];
      }
      const cards = element.querySelectorAll<HTMLElement>("[data-request-id]");
      return [...cards]
        .filter((card) => card.dataset.requestId !== excludeId)
        .map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          };
        });
    },
    []
  );

  const targetFor = React.useCallback(
    (
      session: Session,
      pointerX: number,
      pointerY: number
    ): DropTarget | null => {
      const columns = measureColumns();
      const hit = columns.find(
        (column) =>
          pointerX >= column.rect.left &&
          pointerX <= column.rect.right &&
          pointerY >= column.rect.top &&
          pointerY <= column.rect.bottom
      );
      if (!hit) {
        return null;
      }
      const siblings = siblingsOf(hit.id, session.cardId);
      return {
        index: dropIndexFor(siblings, pointerY),
        status: hit.id,
        // Reordering inside the origin column is legal; the guards only govern
        // movement between columns.
        valid:
          hit.id === session.fromStatus || canMove(session.fromStatus, hit.id),
      };
    },
    [measureColumns, siblingsOf]
  );

  /** Where the card would sit visually once it lands. */
  const slotRectFor = React.useCallback(
    (status: RequestStatus, index: number, session: Session): Rect | null => {
      const column = columnRefs.current.get(status);
      const siblings = siblingsOf(status, session.cardId);
      if (!column) {
        return null;
      }
      if (siblings.length === 0) {
        const body = column.getBoundingClientRect();
        return {
          height: session.originRect.height,
          left: body.left + EDGE_INSET,
          top: body.top + 34,
          width: session.originRect.width,
        };
      }
      const clamped = Math.min(Math.max(index, 0), siblings.length);
      const anchor = siblings[clamped] ?? siblings.at(-1);
      return {
        height: anchor.height,
        left: anchor.left,
        top:
          clamped >= siblings.length
            ? anchor.top + anchor.height + 8
            : anchor.top,
        width: anchor.width,
      };
    },
    [siblingsOf]
  );

  const clearOverlay = React.useCallback(() => {
    x.set(0);
    y.set(0);
    setOverlay(null);
  }, [x, y]);

  /**
   * Apple §5/§6 — settle with the gesture's velocity. Reduced motion swaps the
   * spring for a static jump (Apple §14: gentler, not animated).
   */
  const settleTo = React.useCallback(
    (
      targetX: number,
      targetY: number,
      velocity: { x: number; y: number },
      hasVelocity: boolean,
      onDone: () => void
    ) => {
      stopSettle();
      if (reducedRef.current) {
        x.set(targetX);
        y.set(targetY);
        onDone();
        return;
      }
      const spring = flickSpring(hasVelocity);
      const controls = [
        animate(x, targetX, {
          ...spring,
          velocity: velocity.x,
        }),
        animate(y, targetY, {
          ...spring,
          velocity: velocity.y,
        }),
      ];
      settleRef.current = controls;
      Promise.all(
        controls.map((control) => control.finished.catch(() => undefined))
      )
        .then(() => {
          if (settleRef.current === controls) {
            settleRef.current = null;
          }
          onDone();
        })
        .catch(() => undefined);
    },
    [stopSettle, x, y]
  );

  const springBack = React.useCallback(
    (session: Session, velocity: { x: number; y: number }) => {
      const hasVelocity =
        Math.hypot(velocity.x, velocity.y) >= snapVelocityPxPerSec;
      settleTo(0, 0, velocity, hasVelocity, clearOverlay);
      void session;
    },
    [clearOverlay, settleTo]
  );

  const cancelDrag = React.useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    sessionRef.current = null;
    springBack(session, { x: 0, y: 0 });
  }, [springBack]);

  const startDrag = React.useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      item: RequestItem,
      fromOverlay: boolean
    ) => {
      if (event.button !== 0) {
        return;
      }
      const element = event.currentTarget;
      const current = sessionRef.current;
      // Grabbing a card mid-flight continues from its live position (§3).
      const baseX = fromOverlay ? x.get() : 0;
      const baseY = fromOverlay ? y.get() : 0;
      const originRect = fromOverlay
        ? (current?.originRect ?? toRect(element.getBoundingClientRect()))
        : toRect(element.getBoundingClientRect());

      stopSettle();
      suppressClickRef.current = false;

      sessionRef.current = {
        baseX,
        baseY,
        cardId: item.id,
        element,
        fromStatus: item.status,
        history: [],
        item,
        originRect,
        pointerId: event.pointerId,
        started: fromOverlay,
        startPoint: { x: event.clientX, y: event.clientY },
        target: current?.target ?? null,
      };

      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; window-level cancellation still applies.
      }

      if (fromOverlay) {
        x.set(baseX);
        y.set(baseY);
        setOverlay((prev) =>
          prev ? { ...prev, fromStatus: item.status, item } : prev
        );
      } else {
        x.set(0);
        y.set(0);
      }
    },
    [stopSettle, x, y]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      const dx = event.clientX - session.startPoint.x;
      const dy = event.clientY - session.startPoint.y;

      if (!session.started) {
        // Hysteresis: a small wobble stays a tap (Apple §10).
        if (Math.hypot(dx, dy) < dragHysteresisPx) {
          return;
        }
        session.started = true;
        suppressClickRef.current = true;
        setOverlay({
          fromStatus: session.fromStatus,
          item: session.item,
          originRect: session.originRect,
          target: null,
        });
      }

      const board = boardRef.current?.getBoundingClientRect();
      let nextX = session.baseX + dx;
      let nextY = session.baseY + dy;

      if (board && !reducedRef.current) {
        // Apple §9 — resist progressively past the board edges.
        const minX = board.left + EDGE_INSET - session.originRect.left;
        const maxX =
          board.right -
          session.originRect.width -
          EDGE_INSET -
          session.originRect.left;
        const renderedX = session.originRect.left + nextX;
        if (renderedX < minX + session.originRect.left) {
          const overshoot = renderedX - (minX + session.originRect.left);
          nextX += -overshoot + rubberband(overshoot, board.width);
        } else if (renderedX > maxX + session.originRect.left) {
          const bound = maxX + session.originRect.left;
          const overshoot = renderedX - bound;
          nextX += -overshoot + rubberband(overshoot, board.width);
        }

        const minY = board.top + EDGE_INSET - session.originRect.top;
        const maxY =
          board.bottom -
          session.originRect.height -
          EDGE_INSET -
          session.originRect.top;
        const renderedY = session.originRect.top + nextY;
        if (renderedY < minY + session.originRect.top) {
          const overshoot = renderedY - (minY + session.originRect.top);
          nextY += -overshoot + rubberband(overshoot, board.height);
        } else if (renderedY > maxY + session.originRect.top) {
          const bound = maxY + session.originRect.top;
          const overshoot = renderedY - bound;
          nextY += -overshoot + rubberband(overshoot, board.height);
        }
      }

      // 1:1 tracking — the pointer writes the motion value directly.
      x.set(nextX);
      y.set(nextY);

      session.history.push({ t: performance.now(), x: nextX, y: nextY });
      if (session.history.length > HISTORY_LIMIT) {
        session.history.shift();
      }

      const target = targetFor(session, event.clientX, event.clientY);
      if (!sameTarget(session.target, target)) {
        session.target = target;
        setOverlay((prev) => (prev ? { ...prev, target } : prev));
      }
    },
    [boardRef, targetFor, x, y]
  );

  const finishDrag = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      sessionRef.current = null;

      try {
        session.element.releasePointerCapture(event.pointerId);
      } catch {
        // Already released.
      }

      if (!session.started) {
        return;
      }

      const velocity = velocityFromHistory(session.history);
      const speed = Math.hypot(velocity.x, velocity.y);
      const hasVelocity = speed >= snapVelocityPxPerSec;

      const status = resolveTargetColumn(
        measureColumns(),
        event.clientX,
        velocity.x
      );

      if (!status) {
        springBack(session, velocity);
        return;
      }

      if (
        status !== session.fromStatus &&
        !canMove(session.fromStatus, status)
      ) {
        setShake(status);
        window.setTimeout(() => setShake(null), 600);
        onForbiddenRef.current(status);
        springBack(session, velocity);
        return;
      }

      const index =
        session.target?.status === status
          ? session.target.index
          : siblingsOf(status, session.cardId).length;
      const slot = slotRectFor(status, index, session);

      if (!slot) {
        springBack(session, velocity);
        return;
      }

      const targetX = slot.left - session.originRect.left;
      const targetY = slot.top - session.originRect.top;

      settleTo(targetX, targetY, velocity, hasVelocity, () => {
        onCommitRef.current(session.cardId, status, index);
        clearOverlay();
      });
    },
    [
      clearOverlay,
      measureColumns,
      settleTo,
      siblingsOf,
      slotRectFor,
      springBack,
    ]
  );

  /** Alt+←/→ — the same spring path as a drop, never an instant teleport (§4.3). */
  const animateMove = React.useCallback(
    (
      item: RequestItem,
      status: RequestStatus,
      originRect: Rect,
      index: number
    ) => {
      const session: Session = {
        baseX: 0,
        baseY: 0,
        cardId: item.id,
        element: boardRef.current ?? document.body,
        fromStatus: item.status,
        history: [],
        item,
        originRect,
        pointerId: -1,
        started: true,
        startPoint: { x: 0, y: 0 },
        target: { index, status, valid: true },
      };
      const slot = slotRectFor(status, index, session);
      x.set(0);
      y.set(0);
      setOverlay({
        fromStatus: item.status,
        item,
        originRect,
        target: { index, status, valid: true },
      });
      if (!slot) {
        onCommitRef.current(item.id, status, index);
        clearOverlay();
        return;
      }
      settleTo(
        slot.left - originRect.left,
        slot.top - originRect.top,
        { x: 0, y: 0 },
        false,
        () => {
          onCommitRef.current(item.id, status, index);
          clearOverlay();
        }
      );
    },
    [boardRef, clearOverlay, settleTo, slotRectFor, x, y]
  );

  // Escape cancels a gesture in flight and returns the card home (§4.1).
  React.useEffect(() => {
    if (!overlay) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sessionRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancelDrag();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelDrag, overlay]);

  React.useEffect(() => stopSettle, [stopSettle]);

  const consumeSuppressedClick = React.useCallback(() => {
    if (!suppressClickRef.current) {
      return false;
    }
    suppressClickRef.current = false;
    return true;
  }, []);

  const cardHandlers = React.useCallback(
    (item: RequestItem) => ({
      onLostPointerCapture: () => {
        if (sessionRef.current?.cardId === item.id) {
          cancelDrag();
        }
      },
      onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
        if (sessionRef.current?.cardId === item.id) {
          event.preventDefault();
          cancelDrag();
        }
      },
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        startDrag(event, item, false);
      },
      onPointerMove: handlePointerMove,
      onPointerUp: finishDrag,
    }),
    [cancelDrag, finishDrag, handlePointerMove, startDrag]
  );

  const overlayHandlers = React.useCallback(
    (item: RequestItem) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        event.preventDefault();
        startDrag(event, item, true);
      },
      onPointerMove: handlePointerMove,
      onPointerUp: finishDrag,
    }),
    [finishDrag, handlePointerMove, startDrag]
  );

  return {
    animateMove,
    cancelDrag,
    cardHandlers,
    consumeSuppressedClick,
    dragX: x,
    dragY: y,
    isDragging: overlay !== null,
    overlay,
    overlayHandlers,
    registerColumn,
    shake,
  } as const;
}
