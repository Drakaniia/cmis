import { Checkbox } from "@cmis/ui/components/checkbox";
import { cn } from "@cmis/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import type { Density } from "@/hooks/use-density";
import { boardReflowSpring, dragSpring } from "@/lib/motion";
import { relativeTimeLabel } from "../format";
import type { RequestAction } from "../transitions";
import type { RequestItem } from "../types";
import {
  isPartiallyDispensed,
  QUICK_DEDUCT_LABEL,
  requestorLabel,
  statusMetaOf,
} from "../types";
import { RequestCardMenu } from "./request-card-menu";
import { RequestStatusBadge } from "./request-status-badge";

/**
 * CMIS-UI-05 §3 — the card's four content rows, shared by the board card and
 * the lifted drag overlay so a dragged card is pixel-identical to a resting one.
 */
export function RequestCardContent({
  item,
  now,
  lifted = false,
}: {
  item: RequestItem;
  lifted?: boolean;
  now: number;
}) {
  const time = relativeTimeLabel(item.submittedAt, now);
  // Anonymous requests render as "Walk-in" rather than an empty gap (D23).
  const who = requestorLabel(item);
  const whoId = item.requestor.id.trim();
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1 p-2 pl-7 text-left",
        lifted ? "min-h-0" : "min-h-[68px]"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="min-w-0 flex-1 truncate font-semibold text-xs"
          title={whoId ? `${who} — ${whoId}` : who}
        >
          {who}
        </span>
        <span className="shrink-0 text-caption text-muted-foreground">
          {time}
        </span>
      </div>

      <span className="truncate text-muted-foreground text-xs">
        {item.medicine}
      </span>

      <span className="flex items-center gap-2 pr-7">
        <span className="text-caption text-muted-foreground">
          {item.qty} {item.unit}
        </span>
        <RequestStatusBadge status={item.status} />
        {item.source === "quick-deduct" ? (
          // D10 — how it got here, in the same colour-plus-text convention as
          // every other chip on the board. A quick deduction and a walk-in
          // request created through the queue both read "Walk-in" and both sit
          // in Claimed; this is what tells them apart.
          <span className="shrink-0 truncate rounded-sm border border-border bg-muted px-1 text-caption text-muted-foreground">
            {QUICK_DEDUCT_LABEL}
          </span>
        ) : null}
        {isPartiallyDispensed(item) ? (
          <span className="truncate text-[var(--warning)] text-caption">
            part dispensed
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * CMIS-UI-05 §3 / §4.1 — compact clinical card with an Apple touch.
 *
 * Anatomy (name+time · medicine · qty+badge · ⋯) needs four text rows, so the
 * card is sized by its content and the density token rather than the spec's
 * 48–52px figure, which would clip the medicine line.
 */
export function RequestCard({
  anySelected,
  density: _density,
  dragHandlers,
  dragging,
  item,
  now,
  onAction,
  onKeyboardMove,
  onOpen,
  onToggleSelect,
  selected,
}: {
  anySelected: boolean;
  density: Density;
  /** Pointer handlers from the drag engine — 1:1 tracking lives there. */
  dragHandlers?: HTMLAttributes<HTMLElement>;
  /** True while this card is the one in flight (its slot shows a ghost). */
  dragging?: boolean;
  item: RequestItem;
  now: number;
  onAction: (item: RequestItem, action: RequestAction) => void;
  /** Alt+←/→ — moves along the same animated path as a drop (§4.3). */
  onKeyboardMove?: (
    item: RequestItem,
    direction: -1 | 1,
    rect: DOMRect
  ) => void;
  onOpen: (item: RequestItem, rect: DOMRect | null) => void;
  onToggleSelect: (id: string) => void;
  selected: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const meta = statusMetaOf(item.status);
  const time = relativeTimeLabel(item.submittedAt, now);
  const who = requestorLabel(item);

  /**
   * Track when the pointer went down so we can ignore clicks that follow a
   * long hold — only a quick tap should open the detail modal.
   */
  const pointerDownTimeRef = useRef(0);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      // A long hold is not a tap — don't open the detail modal.
      const holdDuration = event.timeStamp - pointerDownTimeRef.current;
      if (holdDuration > 300) {
        return;
      }
      onOpen(item, event.currentTarget.getBoundingClientRect());
    },
    [item, onOpen]
  );

  const handlePointerDownCapture = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      pointerDownTimeRef.current = event.timeStamp;
    },
    []
  );

  const openDetail = useCallback(
    (element: HTMLElement) => {
      onOpen(item, element.getBoundingClientRect());
    },
    [item, onOpen]
  );

  const handleToggleSelect = useCallback(
    () => onToggleSelect(item.id),
    [item.id, onToggleSelect]
  );

  const handleStopPropagation = useCallback(
    (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
    []
  );

  const handleMenuAction = useCallback(
    (action: RequestAction) => onAction(item, action),
    [item, onAction]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        openDetail(event.currentTarget);
        return;
      }
      if (event.key === " ") {
        // Space selects (§4.3) — it must not fall through to the button click.
        event.preventDefault();
        onToggleSelect(item.id);
        return;
      }
      if (
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      ) {
        event.preventDefault();
        setMenuOpen(true);
        return;
      }
      if (
        event.altKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        event.stopPropagation();
        onKeyboardMove?.(
          item,
          event.key === "ArrowRight" ? 1 : -1,
          event.currentTarget.getBoundingClientRect()
        );
      }
    },
    [item, onKeyboardMove, onToggleSelect, openDetail]
  );

  return (
    <motion.li
      aria-roledescription="draggable request card"
      className={cn(
        "kanban-card group/card relative shrink-0 list-none rounded-xl border bg-card shadow-sm transition-colors",
        dragging
          ? "pointer-events-none border-ring/60 border-dashed bg-muted/20 opacity-40"
          : "border-border/60",
        selected && !dragging && "border-ring bg-accent"
      )}
      data-request-id={item.id}
      data-status={item.status}
      /*
       * The card in flight is already rendered in its destination slot, so when
       * the drop commits, the neighbouring cards are where the gesture put them
       * — no re-layout, no blink (CMIS-UI-05 §4.1).
       *
       * The ghost itself never layout-animates: its rect is measured to aim the
       * settle, and a transform in flight would aim the card at a position the
       * slot has already left.
       */
      layout={!(reduceMotion || dragging)}
      transition={reduceMotion ? { duration: 0 } : boardReflowSpring}
    >
      {dragging ? (
        <span className="sr-only" role="status">
          Dragging {item.medicine} from {meta.label}
        </span>
      ) : null}
      <button
        aria-label={`${who}, ${item.medicine}, ${item.qty} ${item.unit}, ${item.source === "quick-deduct" ? `${QUICK_DEDUCT_LABEL}, ` : ""}${meta.label}, requested ${time}. Alt+arrow keys move it between columns.`}
        className="press-feedback block w-full cursor-grab touch-none rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        data-drag-handle
        type="button"
        {...dragHandlers}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerDownCapture={handlePointerDownCapture}
      >
        <RequestCardContent item={item} now={now} />
      </button>

      {/* Progressive disclosure — checkbox appears on hover or when selecting */}
      <span
        className={cn(
          "absolute top-2 left-2 z-10",
          !(anySelected || selected) &&
            "opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100"
        )}
      >
        <motion.span
          animate={{ scale: selected ? [0.85, 1] : 1 }}
          className="block"
          transition={dragSpring}
        >
          <Checkbox
            aria-label={`Select request from ${who}`}
            checked={selected}
            className="size-[18px]"
            data-drag-exclude
            onCheckedChange={handleToggleSelect}
            onClick={handleStopPropagation}
          />
        </motion.span>
      </span>

      <span className="absolute right-1.5 bottom-1.5 z-10" data-drag-exclude>
        <RequestCardMenu
          onAction={handleMenuAction}
          onOpenChange={setMenuOpen}
          open={menuOpen}
          requestorName={who}
          status={item.status}
        />
      </span>
    </motion.li>
  );
}
