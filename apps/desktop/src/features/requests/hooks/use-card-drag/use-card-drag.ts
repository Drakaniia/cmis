import {
  type AnimationPlaybackControls,
  animate,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  dragHysteresisPx,
  dropIndexFor,
  magnetSpring,
  smoothSettleSpring,
  snapVelocityPxPerSec,
  velocityFromHistory,
} from "@/lib/motion";
import { laneEligibility } from "../../drag-rules";
import type { RequestItem, RequestStatus } from "../../types";
import {
  correctedOffset,
  EDGE_INSET,
  sameTarget,
  toRect,
} from "./drag-geometry";
import { scrollToEdge } from "./edge-autoscroll";
import {
  HISTORY_LIMIT,
  type PointerSample,
  toPointerSample,
} from "./pointer-sampling";
import type {
  DragCancelReason,
  DragOverlay,
  DragPhase,
  DropTarget,
  Rect,
  Session,
} from "./types";

/**
 * A gesture that receives no pointer event for this long is treated as lost
 * (E10). Deliberately long: a slow finger drag on a touch device must never be
 * cancelled out from under the user (§12).
 */
const WATCHDOG_MS = 20_000;

/**
 * How long a landed card takes to dissolve into the board (E10 mirrors the
 * overlay's `duration-150`, with a frame of slack so the element is not removed
 * mid-transition).
 */
const RELEASE_FADE_MS = 160;

/**
 * The card's own box — the `<li data-request-id>`, not the `<button>` that
 * actually owns the gesture (it sits inside the card's 1px border). Measuring
 * the card is what makes the overlay land flush on the slot the board renders.
 */
function cardRectOf(element: HTMLElement): Rect {
  const card = element.closest<HTMLElement>("[data-request-id]");
  return toRect((card ?? element).getBoundingClientRect());
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
 *
 * The engine also owns the board's interactivity guarantees (§F5): five
 * independent fail-safes return every incomplete gesture to `idle`, so a faded,
 * unclickable board is not a reachable state.
 */
export function useCardDrag({
  boardRef,
  deferredStatuses,
  onCancel,
  onCommit,
  onDeferred,
  onForbidden,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  /**
   * Statuses a drop must not commit to on its own. Dropping into Claimed hands
   * a product over, which deducts stock, so the card springs back and the
   * confirmation takes over instead (F10/D13).
   */
  deferredStatuses?: RequestStatus[];
  /** A gesture ended with no move: announce it, never toast it (F10). */
  onCancel?: (reason: DragCancelReason) => void;
  onCommit: (id: string, status: RequestStatus, index: number) => void;
  onDeferred?: (id: string, status: RequestStatus) => void;
  onForbidden: (item: RequestItem, status: RequestStatus) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const prefersReducedMotion = useReducedMotion();

  const sessionRef = useRef<Session | null>(null);
  const settleRef = useRef<AnimationPlaybackControls[] | null>(null);
  const columnRefs = useRef(new Map<RequestStatus, HTMLElement>());
  const suppressClickRef = useRef(false);
  const overlayRef = useRef<DragOverlay | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const releasingRef = useRef(false);
  /**
   * A committed move whose settle is still animating. Every teardown path
   * flushes it, so a click-away, a watchdog timeout or an Escape can end the
   * animation without ever losing the move the user already made.
   */
  const pendingCommitRef = useRef<(() => void) | null>(null);

  const [overlay, setOverlay] = useState<DragOverlay | null>(null);
  const [phase, setPhase] = useState<DragPhase>("idle");
  const [releasing, setReleasing] = useState(false);
  const [shake, setShake] = useState<RequestStatus | null>(null);

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onForbiddenRef = useRef(onForbidden);
  onForbiddenRef.current = onForbidden;
  const onDeferredRef = useRef(onDeferred);
  onDeferredRef.current = onDeferred;
  const deferredRef = useRef(new Set(deferredStatuses ?? []));
  deferredRef.current = new Set(deferredStatuses ?? []);
  const reducedRef = useRef(prefersReducedMotion);
  reducedRef.current = prefersReducedMotion;

  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  /** Columns register themselves so hit-testing can use live geometry. */
  const registerColumn = useCallback(
    (status: RequestStatus, element: HTMLElement | null) => {
      if (element) {
        columnRefs.current.set(status, element);
      } else {
        columnRefs.current.delete(status);
      }
    },
    []
  );

  const stopSettle = useCallback(() => {
    for (const controls of settleRef.current ?? []) {
      controls.stop();
    }
    settleRef.current = null;
  }, []);

  /** The pending commit, if any — run once, never twice. */
  const flushCommit = useCallback(() => {
    const commit = pendingCommitRef.current;
    pendingCommitRef.current = null;
    commit?.();
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const measureColumns = useCallback(
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
  const siblingsOf = useCallback((status: RequestStatus, excludeId: string) => {
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
  }, []);

  const targetFor = useCallback(
    (
      session: Session,
      pointerX: number,
      pointerY: number
    ): DropTarget | null => {
      const columns = measureColumns().filter(
        (column) =>
          pointerY >= column.rect.top && pointerY <= column.rect.bottom
      );
      if (columns.length === 0) {
        return null;
      }
      // The 8px gutter between two lanes is board space, not a dead zone. A
      // strict hit test drops to `null` the instant the pointer crosses one, so
      // the preview snaps home and back again — the flicker. Each lane's hit
      // area therefore extends to the midpoint of the gutter it shares with its
      // neighbour; the board's own outer padding belongs to nobody, so a
      // deliberate release there still means *never mind* (F1).
      const hit = columns.find((column, index) => {
        const previous = columns[index - 1];
        const next = columns[index + 1];
        const left = previous
          ? (previous.rect.right + column.rect.left) / 2
          : column.rect.left;
        const right = next
          ? (column.rect.right + next.rect.left) / 2
          : column.rect.right;
        return pointerX >= left && pointerX <= right;
      });
      if (!hit) {
        return null;
      }
      const siblings = siblingsOf(hit.id, session.cardId);
      return {
        index: dropIndexFor(siblings, pointerY),
        status: hit.id,
        // `laneEligibility` is the single authority: same-lane reorders are
        // legal, everything else defers to the transition table (F2).
        valid: laneEligibility(session.fromStatus, hit.id) === "legal",
      };
    },
    [measureColumns, siblingsOf]
  );

  /**
   * Where the card has *already* been promised to land.
   *
   * The board renders the in-flight card in its destination slot for the whole
   * gesture, so measuring that node is the only geometry that matches what the
   * user is looking at. Anything else re-introduces the correction jump the
   * preview exists to remove (CMIS-UI-05 §4.1).
   */
  const previewRectFor = useCallback(
    (status: RequestStatus, session: Session): Rect | null => {
      const column = columnRefs.current.get(status);
      if (!column) {
        return null;
      }
      const ghost = column.querySelector<HTMLElement>(
        `[data-request-id="${session.cardId}"]`
      );
      return ghost ? toRect(ghost.getBoundingClientRect()) : null;
    },
    []
  );

  /**
   * Where a slot that has not rendered yet will sit — a keyboard move, or a
   * release that resolved to a lane the preview had not reached. Derived from
   * the lane's live cards, in the order the board commits them.
   */
  const slotRectAt = useCallback(
    (status: RequestStatus, index: number, session: Session): Rect | null => {
      const column = columnRefs.current.get(status);
      if (!column) {
        return null;
      }
      const siblings = siblingsOf(status, session.cardId);
      if (siblings.length === 0) {
        const body = column.getBoundingClientRect();
        return {
          height: session.originRect.height,
          left: body.left + EDGE_INSET,
          top: body.top + EDGE_INSET,
          width: session.originRect.width,
        };
      }
      const clamped = Math.min(Math.max(index, 0), siblings.length);
      const anchor = siblings[clamped] ?? siblings.at(-1);
      if (!anchor) {
        return null;
      }
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

  /**
   * The one exit (F1). Idempotent: reaching it twice is a no-op, and reaching
   * it at all means the board is unstyled and interactive again.
   *
   * It deliberately leaves the motion values alone. On a committed drop the
   * overlay is sitting exactly on the slot the board has already rendered, so
   * rewinding `x`/`y` to the gesture's origin would flash the card back to where
   * the drag began for the frame before React unmounts it — that flash is the
   * blink. The next gesture re-anchors the values itself (startDrag).
   */
  const clearOverlay = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    releasingRef.current = false;
    setReleasing(false);
    setOverlay(null);
    setPhase("idle");
  }, []);

  /**
   * The landing (CMIS-UI-05 §4.1). The move is committed *first*, so the real
   * card is already solid in the slot; the lifted overlay then dissolves onto
   * it. Committing and clearing in one tick would trade two identical-looking
   * boxes in a single frame — this gives the drop its beat, and because the
   * card underneath never moves, there is nothing to correct afterwards.
   */
  const releaseOverlay = useCallback(() => {
    setPhase("idle");
    if (reducedRef.current) {
      // Reduced motion gets no dissolve — the card is simply there (§14).
      clearOverlay();
      return;
    }
    releasingRef.current = true;
    setReleasing(true);
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      releasingRef.current = false;
      setReleasing(false);
      setOverlay(null);
    }, RELEASE_FADE_MS);
  }, [clearOverlay]);

  /**
   * Apple §5/§6 — settle with the gesture's velocity. Reduced motion swaps the
   * spring for a static jump (Apple §14: gentler, not animated).
   */
  const settleTo = useCallback(
    (
      targetX: number,
      targetY: number,
      velocity: { x: number; y: number },
      _hasVelocity: boolean,
      onDone: () => void
    ) => {
      stopSettle();
      if (reducedRef.current) {
        x.set(targetX);
        y.set(targetY);
        onDone();
        return;
      }
      // Critically damped, no bounce — smooth glide to slot or home, no magnet overshoot.
      // Velocity is clamped to avoid a flick-induced snap-jump on low-friction drags.
      const clampVel = (v: number) => Math.max(-1200, Math.min(1200, v));
      const spring = smoothSettleSpring;
      const controls = [
        animate(x, targetX, {
          ...spring,
          velocity: clampVel(velocity.x),
        }),
        animate(y, targetY, {
          ...spring,
          velocity: clampVel(velocity.y),
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

  /**
   * The magnet (F1/§4.1) — a short pull onto the slot the board has already
   * opened. The pointer stops owning the position while this is in flight.
   */
  const magnetTo = useCallback(
    (targetX: number, targetY: number) => {
      stopSettle();
      if (reducedRef.current) {
        x.set(targetX);
        y.set(targetY);
        return;
      }
      const controls = [
        animate(x, targetX, magnetSpring),
        animate(y, targetY, magnetSpring),
      ];
      settleRef.current = controls;
      Promise.all(
        controls.map((control) => control.finished.catch(() => undefined))
      )
        .then(() => {
          if (settleRef.current === controls) {
            settleRef.current = null;
          }
        })
        .catch(() => undefined);
    },
    [stopSettle, x, y]
  );

  /** The card's un-magnetised position: where it sits under the pointer. */
  const followPosition = useCallback(
    (session: Session): { x: number; y: number } => {
      const dx = session.pointerX - session.startPoint.x;
      const dy = session.pointerY - session.startPoint.y;
      let nextX = session.baseX + dx;
      let nextY = session.baseY + dy;
      const board = boardRef.current?.getBoundingClientRect();
      if (board && !reducedRef.current) {
        const { originRect } = session;
        nextX = correctedOffset(
          nextX,
          originRect.left,
          originRect.width,
          board.left,
          board.right,
          board.width
        );
        nextY = correctedOffset(
          nextY,
          originRect.top,
          originRect.height,
          board.top,
          board.bottom,
          board.height
        );
      }
      return { x: nextX, y: nextY };
    },
    [boardRef]
  );

  const clearSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    clearWatchdog();
    // biome-ignore lint/suspicious/noUnnecessaryConditions: ref is assigned by startDrag
    if (session) {
      try {
        session.element.releasePointerCapture(session.pointerId);
      } catch {
        // Already released, or never captured.
      }
    }
    return session;
  }, [clearWatchdog]);

  /**
   * Refusal / cancel / deferred: the board is unstyled and interactive on the
   * same frame the pointer came up, and the card springs home behind it (F4.1).
   */
  const springBack = useCallback(
    (velocity: { x: number; y: number }) => {
      setPhase("idle");
      const hasVelocity =
        Math.hypot(velocity.x, velocity.y) >= snapVelocityPxPerSec;
      settleTo(0, 0, velocity, hasVelocity, clearOverlay);
    },
    [clearOverlay, settleTo]
  );

  /**
   * Ends a gesture with no move. It never returns early on a null session: a
   * pointer that was lost after `finishDrag` nulled it still has an overlay to
   * clear (AF4), and a settle that is still in flight is flushed, not dropped.
   */
  const cancelDrag = useCallback(
    (reason: DragCancelReason = "cancel") => {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: ref is assigned by releaseOverlay
      if (releasingRef.current) {
        // The move is already committed and the overlay is mid-dissolve; there
        // is nothing left to spring home, so the next interruption just ends it.
        clearOverlay();
        return;
      }
      const hadSession = sessionRef.current !== null;
      const hadCommit = pendingCommitRef.current !== null;
      clearSession();
      stopSettle();
      flushCommit();
      setPhase("idle");
      if (overlayRef.current !== null || hadSession) {
        onCancelRef.current?.(reason);
      }
      if (hadCommit) {
        // A committed move's flight was interrupted — the card is already in its
        // new lane, so there is nothing to spring home; the overlay just goes.
        clearOverlay();
        return;
      }
      springBack({ x: 0, y: 0 });
    },
    [clearOverlay, clearSession, flushCommit, springBack, stopSettle]
  );

  /** Arm the watchdog for the current gesture; every pointermove re-arms it. */
  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      cancelDrag("watchdog");
    }, WATCHDOG_MS);
  }, [cancelDrag, clearWatchdog]);

  const startDrag = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      item: RequestItem,
      fromOverlay: boolean
    ) => {
      if (event.button !== 0) {
        return;
      }
      const element = event.currentTarget;
      const { current } = sessionRef;
      const lingering = overlayRef.current;
      // Grabbing a card mid-flight continues from its live position (§3) — and
      // that includes a card the same pointer is already carrying, which is how
      // a click on a settling card becomes a re-grab rather than a lost overlay.
      const continues =
        fromOverlay || (lingering !== null && lingering.item.id === item.id);
      if (lingering !== null && !continues) {
        stopSettle();
        flushCommit();
        clearOverlay();
      }
      const cardRect = cardRectOf(element);
      const baseX = continues ? x.get() : 0;
      const baseY = continues ? y.get() : 0;
      const originRect = continues
        ? (current?.originRect ?? lingering?.originRect ?? cardRect)
        : cardRect;

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
        magnetized: false,
        originRect,
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        started: continues,
        startPoint: { x: event.clientX, y: event.clientY },
        target: current?.target ?? lingering?.target ?? null,
      };
      armWatchdog();

      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; window-level cancellation still applies.
      }

      if (continues) {
        x.set(baseX);
        y.set(baseY);
        setPhase("dragging");
        setOverlay((prev) =>
          prev ? { ...prev, fromStatus: item.status, item } : prev
        );
      } else {
        x.set(0);
        y.set(0);
      }
    },
    [armWatchdog, clearOverlay, flushCommit, stopSettle, x, y]
  );

  /**
   * Tracking runs at the window, not on the card: the preview moves the card
   * between lanes mid-gesture, which unmounts the node that owns the pointer
   * capture. A window listener keeps the gesture alive across that move (F1).
   */
  const handlePointerMove = useCallback(
    (sample: PointerSample) => {
      const session = sessionRef.current;
      if (session === null || sample.pointerId !== session.pointerId) {
        return;
      }
      armWatchdog();
      session.pointerX = sample.clientX;
      session.pointerY = sample.clientY;

      const dx = sample.clientX - session.startPoint.x;
      const dy = sample.clientY - session.startPoint.y;

      if (!session.started) {
        // Hysteresis: a small wobble stays a tap (Apple §10).
        if (Math.hypot(dx, dy) < dragHysteresisPx) {
          return;
        }
        session.started = true;
        suppressClickRef.current = true;
        setPhase("dragging");
        setOverlay({
          fromStatus: session.fromStatus,
          item: session.item,
          originRect: session.originRect,
          target: null,
        });
      }

      const target = targetFor(session, sample.clientX, sample.clientY);
      if (!sameTarget(session.target, target)) {
        session.target = target;
        setOverlay((prev) => (prev ? { ...prev, target } : prev));
      }

      // A legal slot owns the card, so this move does not move it: the magnet
      // effect eases it onto the slot once the preview has committed the ghost.
      // Easing here would aim at the *previous* seat — the new one is not in the
      // DOM yet — which is what makes a magnet feel one step behind.
      if (target?.valid) {
        session.magnetized = true;
        return;
      }

      // Nothing to join: the card tracks the pointer 1:1 again, and any pull
      // still in flight is abandoned so the two never fight (Apple §3).
      session.magnetized = false;
      stopSettle();
      const follow = followPosition(session);
      x.set(follow.x);
      y.set(follow.y);
      session.history.push({ t: performance.now(), x: follow.x, y: follow.y });
      if (session.history.length > HISTORY_LIMIT) {
        session.history.shift();
      }
    },
    [armWatchdog, followPosition, stopSettle, targetFor, x, y]
  );

  const finishDrag = useCallback(
    (event: PointerSample) => {
      const session = sessionRef.current;
      if (session === null || event.pointerId !== session.pointerId) {
        // Idempotent: the second `pointerup` for a gesture is a no-op (F5).
        return;
      }
      clearSession();

      if (!session.started) {
        return;
      }

      // A magnetised card is already sitting on its seat, so it carries no
      // release momentum — settling it with the pointer's velocity would only
      // bounce it off the slot it never left.
      const velocity = session.magnetized
        ? { x: 0, y: 0 }
        : velocityFromHistory(session.history);
      const speed = Math.hypot(velocity.x, velocity.y);
      const hasVelocity = speed >= snapVelocityPxPerSec;

      // The release must land *on* a lane under the pointer — no magnet
      // projection. Using momentum projection caused the card to commit to a
      // different lane than the one highlighted (the "magnet blink"). The lane
      // under the pointer is the only valid target; flick velocity only
      // influences the settle spring, not the destination.
      const onLane = targetFor(session, event.clientX, event.clientY);
      if (!onLane) {
        // A deliberate *never mind*: announced, never toasted (F10/E2).
        onCancelRef.current?.("cancel");
        springBack(velocity);
        return;
      }
      const { index, status } = onLane;

      if (laneEligibility(session.fromStatus, status) === "illegal") {
        setShake(status);
        window.setTimeout(() => setShake(null), 600);
        onForbiddenRef.current(session.item, status);
        springBack(velocity);
        return;
      }

      // A deferred drop is legal but not yet agreed: the card goes home and the
      // confirmation takes over, so nothing moves before the plan is accepted.
      if (status !== session.fromStatus && deferredRef.current.has(status)) {
        onDeferredRef.current?.(session.cardId, status);
        springBack(velocity);
        return;
      }

      // The release can resolve to a different lane than the last pointermove
      // previewed (a fast flick, or a pointerup with no final move). Point the
      // preview at the destination before measuring so the settle and the
      // commit agree (F1). Measuring the *rendered* ghost is preferred, but the
      // geometric fallback is exact here: the new lane has no ghost yet.
      if (!sameTarget(session.target, onLane)) {
        session.target = onLane;
        setOverlay((prev) => (prev ? { ...prev, target: onLane } : prev));
      }
      const slot =
        previewRectFor(status, session) ?? slotRectAt(status, index, session);

      if (!slot) {
        springBack(velocity);
        return;
      }

      const targetX = slot.left - session.originRect.left;
      const targetY = slot.top - session.originRect.top;

      pendingCommitRef.current = () =>
        onCommitRef.current(session.cardId, status, index);
      setPhase("settling");
      settleTo(targetX, targetY, velocity, hasVelocity, () => {
        flushCommit();
        releaseOverlay();
      });
    },
    [
      clearSession,
      flushCommit,
      previewRectFor,
      releaseOverlay,
      settleTo,
      slotRectAt,
      springBack,
      targetFor,
    ]
  );

  /** Alt+←/→ — the same spring path as a drop, never an instant teleport (§4.3). */
  const animateMove = useCallback(
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
        magnetized: false,
        originRect,
        pointerId: -1,
        pointerX: 0,
        pointerY: 0,
        started: true,
        startPoint: { x: 0, y: 0 },
        target: { index, status, valid: true },
      };
      const slot = slotRectAt(status, index, session);
      x.set(0);
      y.set(0);
      setOverlay({
        fromStatus: item.status,
        item,
        originRect,
        target: { index, status, valid: true },
      });
      pendingCommitRef.current = () =>
        onCommitRef.current(item.id, status, index);
      if (!slot) {
        flushCommit();
        clearOverlay();
        return;
      }
      setPhase("settling");
      settleTo(
        slot.left - originRect.left,
        slot.top - originRect.top,
        { x: 0, y: 0 },
        false,
        () => {
          flushCommit();
          releaseOverlay();
        }
      );
    },
    [
      boardRef,
      clearOverlay,
      flushCommit,
      releaseOverlay,
      settleTo,
      slotRectAt,
      x,
      y,
    ]
  );

  // ─── Fail-safes (§F5). Every one of them ends at `clearOverlay` ────────────

  // 1. Escape — cancels a gesture in flight, and also stops a settle.
  useEffect(() => {
    if (phase === "idle" && overlay === null) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        // biome-ignore lint/suspicious/noUnnecessaryConditions: refs are assigned by startDrag
        (sessionRef.current || overlayRef.current)
      ) {
        event.preventDefault();
        event.stopPropagation();
        cancelDrag("escape");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelDrag, overlay, phase]);

  // 2. The authoritative end of a gesture. An element can lose its pointer up
  //    (AF4); the window cannot.
  useEffect(() => {
    // The window hands these over as plain DOM events; the engine only reads the
    // three fields that identify a pointer, so the listener stays an `EventListener`.
    const onUp = (event: Event) => {
      finishDrag(toPointerSample(event));
    };
    const onPointerCancel = (event: Event) => {
      const sample = toPointerSample(event);
      const session = sessionRef.current;
      // biome-ignore lint/suspicious/noUnnecessaryConditions: ref is assigned by startDrag
      if (session && sample.pointerId === session.pointerId) {
        event.preventDefault();
        cancelDrag("pointer-lost");
      }
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [cancelDrag, finishDrag]);

  // 2b. Tracking, likewise at the window. Listening unconditionally keeps the
  //     hand-off between a card and the overlay seamless: neither node owns the
  //     gesture, so neither can lose it when the preview re-parents the card.
  useEffect(() => {
    const onMove = (event: Event) => handlePointerMove(toPointerSample(event));
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [handlePointerMove]);

  // 3. Focus and visibility loss — alt-tabbing or locking the screen must not
  //    leave a card in the air (E9).
  useEffect(() => {
    const onBlur = () => cancelDrag("focus-lost");
    const onVisibility = () => {
      if (document.hidden) {
        cancelDrag("visibility");
      }
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cancelDrag]);

  // 5. Click-anywhere — a lingering settle is cleared immediately rather than
  //    waited out (E11). A pointerdown on a card or on the overlay itself is
  //    part of a gesture, so it is left alone (that is the mid-settle re-grab).
  useEffect(() => {
    const onDown = (event: Event) => {
      if (sessionRef.current !== null || overlayRef.current === null) {
        return;
      }
      const { target } = event;
      if (
        target instanceof Element &&
        target.closest("[data-drag-handle],[data-drag-overlay]")
      ) {
        return;
      }
      cancelDrag("click-away");
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [cancelDrag]);

  // 6. The cursor is owned by the phase, so no ghost cursor can outlive the
  //    gesture (AF6/F3.4).
  useEffect(() => {
    if (phase !== "dragging") {
      return;
    }
    const target = overlay?.target ?? null;
    const blocked = target === null || !target.valid;
    document.body.dataset.dragPhase = blocked ? "not-allowed" : "grabbing";
    return () => {
      delete document.body.dataset.dragPhase;
    };
  }, [overlay, phase]);

  /**
   * One auto-scroll frame: pan the board and the hovered lane toward the edges,
   * then re-resolve the target so the chip, the cursor and the preview follow
   * the new geometry (F6.3).
   *
   * The card is deliberately *not* moved. The pointer has not moved, so the card
   * stays under it while the content slides beneath (AF15) — the card's geometry
   * is only ever the pointer's. Rewriting the anchor here as well made the
   * landing depend on whether a render had happened since the last scroll tick,
   * which is exactly the drift that lands the card beside its slot.
   */
  const autoScrollFrame = useCallback(
    (dt: number) => {
      const session = sessionRef.current;
      if (!session?.started) {
        return;
      }
      scrollToEdge(boardRef.current, session.pointerX, dt, "x");

      const laneStatus = session.target?.status;
      const lane = laneStatus
        ? columnRefs.current
            .get(laneStatus)
            ?.querySelector<HTMLElement>("[data-lane-scroll]")
        : null;
      scrollToEdge(lane, session.pointerY, dt, "y");

      const target = targetFor(session, session.pointerX, session.pointerY);
      if (!sameTarget(session.target, target)) {
        session.target = target;
        setOverlay((prev) => (prev ? { ...prev, target } : prev));
      }

      // A magnetised card rides the slot: as the lane (or the board) scrolls the
      // seat moves, and the card has to move with it. Skipped while a pull is
      // still in flight, because that pull already owns the position.
      if (session.magnetized && target?.valid && settleRef.current === null) {
        const slot = previewRectFor(target.status, session);
        if (slot) {
          x.set(slot.left - session.originRect.left);
          y.set(slot.top - session.originRect.top);
        }
      }
    },
    [boardRef, previewRectFor, targetFor, x, y]
  );

  // 7. Auto-scroll (§F6) — a single rAF loop, alive only while dragging and torn
  //    down with the phase, never left running.
  useEffect(() => {
    if (phase !== "dragging") {
      return;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      autoScrollFrame(dt);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [autoScrollFrame, phase]);

  // 8. The magnet (§4.1) — a legal slot pulls the card onto it. It runs after
  //    React has committed the preview, which is the only moment the ghost sits
  //    in the DOM at its new seat, so the pull always aims at the seat the user
  //    can actually see. Tracking is paused for the same reason (pointermove).
  useEffect(() => {
    if (phase !== "dragging") {
      return;
    }
    const session = sessionRef.current;
    if (!(session?.started && session.magnetized)) {
      return;
    }
    const target = overlay?.target;
    if (!target?.valid) {
      return;
    }
    const slot =
      previewRectFor(target.status, session) ??
      slotRectAt(target.status, target.index, session);
    if (!slot) {
      return;
    }
    magnetTo(
      slot.left - session.originRect.left,
      slot.top - session.originRect.top
    );
  }, [magnetTo, overlay?.target, phase, previewRectFor, slotRectAt]);

  useEffect(() => stopSettle, [stopSettle]);

  // The dissolve timer is owned by the hook, so it goes with it.
  useEffect(
    () => () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
      }
    },
    []
  );

  // Watchdog (4) — force-clears a gesture whose pointerup never arrived (E10).
  useEffect(() => clearWatchdog, [clearWatchdog]);

  const consumeSuppressedClick = useCallback(() => {
    if (suppressClickRef.current === false) {
      return false;
    }
    suppressClickRef.current = false;
    return true;
  }, []);

  const cardHandlers = useCallback(
    (item: RequestItem) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        startDrag(event, item, false);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => finishDrag(event),
    }),
    [finishDrag, startDrag]
  );

  const overlayHandlers = useCallback(
    (item: RequestItem) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        event.preventDefault();
        startDrag(event, item, true);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => finishDrag(event),
    }),
    [finishDrag, startDrag]
  );

  return {
    animateMove,
    cancelDrag,
    cardHandlers,
    consumeSuppressedClick,
    dragX: x,
    dragY: y,
    /** Only a live gesture fades lanes or suspends snap (D18). */
    isDragging: phase === "dragging",
    overlay,
    overlayHandlers,
    phase,
    registerColumn,
    /** The committed card is dissolving onto the board (CMIS-UI-05 §4.1). */
    releasing,
    shake,
  } as const;
}
