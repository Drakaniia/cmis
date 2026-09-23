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
  requestQuantityLabel,
  statusMetaOf,
} from "../types";
import { RequestCardMenu } from "./request-card-menu";
import { RequestStatusBadge } from "./request-status-badge";

/**
 * CMIS-UI-05 §3 — Apple-refined card content. Hierarchy: who (SF 590, -0.01em) /
 * medicine (caption with 0.01em tracking) / meta row (pill chips + qty).
 * Shared by the board card and the drag overlay so a lifted card is
 * pixel-identical to a resting one (Apple §7 symmetric paths).
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
  const who = requestorLabel(item);
  const whoId = item.requestor.id.trim();
  const partial = isPartiallyDispensed(item);
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5 p-3 pl-8 text-left",
        lifted ? "min-h-0" : "min-h-[84px]"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="min-w-0 flex-1 truncate font-semibold text-[13px] leading-[1.25] tracking-[-0.01em] text-foreground"
          title={whoId ? `${who} — ${whoId}` : who}
        >
          {who}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] leading-none tracking-[0.02em] text-muted-foreground tabular-nums">
          {time}
        </span>
      </div>

      <span className="truncate text-[12.5px] leading-[1.35] tracking-[0.01em] text-muted-foreground">
        {item.medicine}
      </span>

      <span className="flex flex-wrap items-center gap-1.5 pr-6">
        <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/80 px-2 py-0.5 font-medium text-[11px] leading-none tracking-[0.01em] text-foreground tabular-nums">
          {requestQuantityLabel(item)}
        </span>
        <RequestStatusBadge status={item.status} />
        {item.source === "quick-deduct" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-medium text-[10px] leading-none tracking-[0.02em] text-amber-700 dark:text-amber-300">
            <span className="size-1 rounded-full bg-amber-500" />
            {QUICK_DEDUCT_LABEL}
          </span>
        ) : null}
        {partial ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--warning)]/25 bg-[var(--warning)]/10 px-2 py-0.5 font-medium text-[10px] leading-none tracking-[0.02em] text-[var(--warning)]">
            <span className="size-1 animate-pulse rounded-full bg-[var(--warning)]" />
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
        "kanban-card group/card relative shrink-0 list-none rounded-[14px] border transition-all duration-200 ease-out",
        dragging
          ? "pointer-events-none border-ring/60 border-dashed bg-muted/20 opacity-40"
          : "border-border/50 bg-card shadow-[0_1px_2px_oklch(0_0_0/0.04),0_4px_12px_oklch(0_0_0/0.03),inset_0_1px_0_oklch(1_0_0/0.6)] hover:-translate-y-[1px] hover:shadow-[0_2px_8px_oklch(0_0_0/0.06),0_8px_20px_oklch(0_0_0/0.05),inset_0_1px_0_oklch(1_0_0/0.7)] dark:shadow-[0_1px_2px_oklch(0_0_0/0.2),0_4px_12px_oklch(0_0_0/0.15)] dark:hover:shadow-[0_2px_8px_oklch(0_0_0/0.25),0_8px_20px_oklch(0_0_0/0.2)]",
        selected &&
          !dragging &&
          "border-ring bg-accent shadow-[0_0_0_1px_var(--ring),0_4px_16px_oklch(0_0_0/0.08)]"
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
        aria-label={`${who}, ${item.medicine}, ${requestQuantityLabel(item)}, ${item.source === "quick-deduct" ? `${QUICK_DEDUCT_LABEL}, ` : ""}${meta.label}, requested ${time}. Alt+arrow keys move it between columns.`}
        className="press-feedback block w-full cursor-grab touch-none rounded-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        data-drag-handle
        type="button"
        {...dragHandlers}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerDownCapture={handlePointerDownCapture}
      >
        <RequestCardContent item={item} now={now} />
      </button>

      <span
        className={cn(
          "absolute top-2.5 left-2.5 z-10",
          !(anySelected || selected) &&
            "opacity-0 transition-opacity duration-150 group-focus-within/card:opacity-100 group-hover/card:opacity-100"
        )}
      >
        <motion.span
          animate={{ scale: selected ? [0.85, 1] : 1 }}
          className="block rounded-full shadow-sm"
          transition={dragSpring}
        >
          <Checkbox
            aria-label={`Select request from ${who}`}
            checked={selected}
            className="size-[18px] rounded-full data-[state=checked]:bg-foreground data-[state=checked]:text-background"
            data-drag-exclude
            onCheckedChange={handleToggleSelect}
            onClick={handleStopPropagation}
          />
        </motion.span>
      </span>

      <span className="absolute right-2 bottom-2 z-10" data-drag-exclude>
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
