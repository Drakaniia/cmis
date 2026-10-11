/**
 * CMIS-UI-00 — the scroll indicator layer.
 *
 * globals.css hides every native scrollbar, so nothing on screen says a
 * surface scrolls. This renders one indicator per scrollable element: a slim
 * pill that is always visible, which widens to the Apple overlay pill under
 * the pointer (or keyboard focus) and then behaves like the native bar —
 * drag the thumb, click the track to page, arrow keys to nudge.
 *
 * Every indicator lives in one fixed layer and is positioned from its
 * target's client rect, so nothing is rendered inside the scroller it
 * describes and no scroller needs to be marked up to get an indicator.
 */

import { cn } from "@cmis/ui/lib/utils";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { clamp, measureThumb } from "./geometry";

type Axis = "x" | "y";

interface ScrollTarget {
  axes: Axis[];
  element: HTMLElement;
  id: string;
}

/** Hit strip around the pill — wide enough to hover without aiming. */
const STRIP = 14;
/** Quiet period before re-scanning, so a burst of mutations costs one scan. */
const RESCAN_DELAY = 150;
const KEY_STEP = 40;
/** Opt-out for a scroller that should keep no indicator, and for our own layer. */
const OPT_OUT = "[data-no-scrollbar], [data-scrollbar-ui]";
const SCROLLABLE_OVERFLOW = new Set(["auto", "overlay", "scroll"]);

/**
 * A modal surface. Every app modal marks itself with `aria-modal`; the shared
 * `DialogContent` marks itself with a `data-slot`. Both are detected because
 * either alone would miss a whole family of dialogs.
 */
const MODAL_SELECTOR =
  '[aria-modal="true"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]';

/**
 * A portalled popup that sits above a modal: a term/category picker, a menu.
 * Its own scrollers must keep an indicator even though it is rendered beside
 * the dialog rather than inside it.
 */
const POPUP_SELECTOR =
  '[data-slot="popover-popup"], [data-slot="dropdown-menu-content"]';

/**
 * The scrollers that may keep an indicator while an overlay is open.
 *
 * Native scrollbars are painted inside their own scroller and therefore sit
 * behind whatever overlay is above them, so opening a modal hides the page's
 * bars. Our indicator layer is one global fixed layer drawn above the modal
 * (it has to be, or an in-modal scroller could not show its bar), so without
 * this filter every background bar would float on top of the dialog. Returning
 * an empty list means "no overlay is open — describe everything", which keeps
 * the ordinary page behavior untouched.
 */
function foregroundRoots(): HTMLElement[] {
  const modals = Array.from(
    document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)
  );
  if (modals.length === 0) {
    return [];
  }
  const popups = document.querySelectorAll<HTMLElement>(POPUP_SELECTOR);
  return [...modals, ...popups];
}

const assignedIds = new WeakMap<Element, string>();
let idSequence = 0;

/** Every scroll axis of `element` that can actually scroll. */
function scrollAxes(element: HTMLElement): Axis[] {
  const style = getComputedStyle(element);
  const axes: Axis[] = [];
  if (
    element.scrollHeight > element.clientHeight + 1 &&
    SCROLLABLE_OVERFLOW.has(style.overflowY)
  ) {
    axes.push("y");
  }
  if (
    element.scrollWidth > element.clientWidth + 1 &&
    SCROLLABLE_OVERFLOW.has(style.overflowX)
  ) {
    axes.push("x");
  }
  return axes;
}

/** `aria-controls` needs an id on the scroller; mint one only if it has none. */
function targetId(element: HTMLElement): string {
  const known = assignedIds.get(element);
  if (known !== undefined) {
    return known;
  }
  idSequence += 1;
  const id = element.id || `cmis-scroll-${idSequence}`;
  if (!element.id) {
    element.id = id;
  }
  assignedIds.set(element, id);
  return id;
}

/** The layout reads are cheap and run only after mutations settle. */
function findScrollTargets(): ScrollTarget[] {
  const roots = foregroundRoots();
  const found: ScrollTarget[] = [];
  for (const element of document.querySelectorAll<HTMLElement>("*")) {
    if (element.closest(OPT_OUT) !== null) {
      continue;
    }
    // While an overlay is open, only scrollers inside it (or inside one of its
    // portalled popups) keep a bar — the background's native-equivalent bars
    // are behind the overlay and must not paint over it.
    if (roots.length > 0 && !roots.some((root) => root.contains(element))) {
      continue;
    }
    const axes = scrollAxes(element);
    if (axes.length > 0) {
      found.push({ axes, element, id: targetId(element) });
    }
  }
  return found;
}

type FrameTask = () => void;

const frameTasks = new Set<FrameTask>();
let frame = 0;

function runFrame() {
  frame = 0;
  for (const task of frameTasks) {
    task();
  }
}

/** One layout pass per batch: a burst of scroll events still reads once. */
function scheduleFrame() {
  if (frame === 0) {
    frame = requestAnimationFrame(runFrame);
  }
}

interface DragSession {
  /** Scroll offset when the drag started. */
  origin: number;
  /** Pointer coordinate when the drag started. */
  pointer: number;
}

interface IndicatorProps {
  axis: Axis;
  target: HTMLElement;
  targetId: string;
}

function Indicator({ axis, target, targetId: controlledId }: IndicatorProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const announcedRef = useRef({ max: -1, now: -1 });
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);

  const geometry = useCallback(() => {
    const rect = target.getBoundingClientRect();
    const track = axis === "y" ? rect.height : rect.width;
    const viewport = axis === "y" ? target.clientHeight : target.clientWidth;
    const content = axis === "y" ? target.scrollHeight : target.scrollWidth;
    const position = axis === "y" ? target.scrollTop : target.scrollLeft;
    return {
      ...measureThumb(track, viewport, content, position),
      position,
      rect,
      track,
      viewport,
    };
  }, [axis, target]);

  const paint = useCallback(() => {
    const strip = stripRef.current;
    const thumb = thumbRef.current;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: both refs are null until the layer mounts
    if (!(strip && thumb)) {
      return;
    }
    const { length, offset, position, rect, scrollable, track } = geometry();
    const offscreen =
      scrollable === 0 ||
      rect.width === 0 ||
      rect.height === 0 ||
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= window.innerHeight ||
      rect.left >= window.innerWidth;
    if (offscreen) {
      strip.style.visibility = "hidden";
      return;
    }
    strip.style.visibility = "visible";
    if (axis === "y") {
      strip.style.height = `${track}px`;
      strip.style.transform = `translate3d(${rect.right - STRIP}px, ${rect.top}px, 0)`;
      thumb.style.height = `${length}px`;
      thumb.style.top = `${offset}px`;
    } else {
      strip.style.width = `${track}px`;
      strip.style.transform = `translate3d(${rect.left}px, ${rect.bottom - STRIP}px, 0)`;
      thumb.style.width = `${length}px`;
      thumb.style.left = `${offset}px`;
    }
    const announced = announcedRef.current;
    const now = Math.round(position);
    const max = Math.round(scrollable);
    if (now !== announced.now) {
      strip.setAttribute("aria-valuenow", String(now));
    }
    if (max !== announced.max) {
      strip.setAttribute("aria-valuemax", String(max));
    }
    announcedRef.current = { max, now };
  }, [axis, geometry]);

  useEffect(() => {
    frameTasks.add(paint);
    scheduleFrame();
    return () => {
      frameTasks.delete(paint);
    };
  }, [paint]);

  const scrollBy = useCallback(
    (delta: number, smooth = false) => {
      const behavior = smooth ? "smooth" : "auto";
      if (axis === "y") {
        target.scrollBy({ behavior, top: delta });
      } else {
        target.scrollBy({ behavior, left: delta });
      }
      scheduleFrame();
    },
    [axis, target]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const { scrollable, viewport } = geometry();
      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          scrollBy(KEY_STEP);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          scrollBy(-KEY_STEP);
          break;
        case "PageDown":
          scrollBy(viewport * 0.9, true);
          break;
        case "PageUp":
          scrollBy(-viewport * 0.9, true);
          break;
        case "Home":
          scrollBy(-scrollable, true);
          break;
        case "End":
          scrollBy(scrollable, true);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [geometry, scrollBy]
  );

  const expand = useCallback(() => {
    setExpanded(true);
  }, []);

  const collapse = useCallback(() => {
    setExpanded(false);
  }, []);

  /** A click on the track pages towards it, as the native bar does. */
  const onTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      const { length, offset, rect, track, viewport } = geometry();
      const pointer =
        axis === "y" ? event.clientY - rect.top : event.clientX - rect.left;
      const direction = pointer < offset + length / 2 ? -1 : 1;
      scrollBy(direction * Math.min(track, viewport) * 0.9, true);
    },
    [axis, geometry, scrollBy]
  );

  const onThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; the drag still works inside the strip.
      }
      dragRef.current = {
        origin: axis === "y" ? target.scrollTop : target.scrollLeft,
        pointer: axis === "y" ? event.clientY : event.clientX,
      };
      setDragging(true);
    },
    [axis, target]
  );

  const onThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = dragRef.current;
      // biome-ignore lint/suspicious/noUnnecessaryConditions: a session exists only between pointerdown and pointerup
      if (!session) {
        return;
      }
      const { length, scrollable, track } = geometry();
      const pointer = axis === "y" ? event.clientY : event.clientX;
      // The thumb's travel maps onto the content's, exactly as macOS does.
      const travel = track - length;
      const delta =
        travel > 0 ? ((pointer - session.pointer) * scrollable) / travel : 0;
      const next = clamp(session.origin + delta, 0, scrollable);
      if (axis === "y") {
        target.scrollTop = next;
      } else {
        target.scrollLeft = next;
      }
      scheduleFrame();
    },
    [axis, geometry, target]
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: a session exists only between pointerdown and pointerup
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Never captured.
    }
    setDragging(false);
  }, []);

  // 4px at rest, the native 8px pill under the pointer or keyboard focus.
  const thickness = axis === "y" ? "w-1" : "h-1";
  const expandedThickness = axis === "y" ? "w-2" : "h-2";
  let tone = "bg-[var(--apple-scrollbar-thumb)]";
  if (expanded) {
    tone = "bg-[var(--apple-scrollbar-thumb-hover)]";
  }
  if (dragging) {
    tone = "bg-[var(--apple-scrollbar-thumb-active)]";
  }

  return (
    <div
      aria-controls={controlledId}
      aria-label="Scroll"
      aria-orientation={axis === "y" ? "vertical" : "horizontal"}
      aria-valuemin={0}
      aria-valuenow={0}
      className={cn(
        "pointer-events-auto absolute top-0 left-0 outline-none focus-visible:outline-1",
        axis === "y" ? "w-3.5" : "h-3.5"
      )}
      onBlur={collapse}
      onFocus={expand}
      onKeyDown={onKeyDown}
      onPointerDown={onTrackPointerDown}
      onPointerEnter={expand}
      onPointerLeave={collapse}
      ref={stripRef}
      role="scrollbar"
      style={{ touchAction: "none" }}
      tabIndex={0}
    >
      <div
        className={cn(
          "absolute rounded-full transition-[width,height,background-color] duration-150 ease-out",
          axis === "y"
            ? "top-0 left-1/2 -translate-x-1/2"
            : "top-1/2 left-0 -translate-y-1/2",
          expanded ? expandedThickness : thickness,
          tone
        )}
        onPointerCancel={endDrag}
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={endDrag}
        ref={thumbRef}
      />
    </div>
  );
}

/**
 * Mounted once, app-wide. Discovers every scrollable element and keeps one
 * indicator per scroll axis alive above them.
 */
export default function ScrollIndicators() {
  const [targets, setTargets] = useState<ScrollTarget[]>([]);

  useEffect(() => {
    // Capture phase, because a scroll on an inner element does not bubble —
    // this is the one listener that catches every scroller in the app.
    const invalidate = () => {
      scheduleFrame();
    };
    window.addEventListener("scroll", invalidate, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", invalidate, { passive: true });
    return () => {
      window.removeEventListener("scroll", invalidate, { capture: true });
      window.removeEventListener("resize", invalidate);
    };
  }, []);

  useEffect(() => {
    let timer = 0;
    const rescan = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setTargets(findScrollTargets());
        scheduleFrame();
      }, RESCAN_DELAY);
    };
    const observer = new MutationObserver(rescan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", rescan);
    rescan();
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener("resize", rescan);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] print:hidden"
      data-scrollbar-ui=""
    >
      {targets.map((target) =>
        target.axes.map((axis) => (
          <Indicator
            axis={axis}
            key={`${target.id}:${axis}`}
            target={target.element}
            targetId={target.id}
          />
        ))
      )}
    </div>
  );
}
