import { cn } from "@cmis/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
  Fragment,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Density } from "@/hooks/use-density";
import type { RequestAction } from "../transitions";
import type { RequestColumnMeta, RequestItem } from "../types";
import { RequestCard } from "./request-card";

/** A column body clips once its cards no longer fit the scroll box. */
function overflowsBottom(element: HTMLElement | null): boolean {
  return (
    (element?.scrollHeight ?? 0) -
      (element?.scrollTop ?? 0) -
      (element?.clientHeight ?? 0) >
    4
  );
}

function DropIndicator() {
  return (
    <li aria-hidden className="list-none">
      <div
        className="h-0.5 shrink-0 rounded-full bg-[var(--ring)]"
        style={{ borderTop: "2px dashed var(--ring)" }}
      />
    </li>
  );
}

/**
 * F9/F3.3 — the header: dot, label, count chip, the hovered illegal lane's
 * refusal chip, and the optional lane action (Claimed's Clear, Denied's
 * Collapse). Split out of `RequestColumn` so the column body stays readable.
 */
function ColumnHeader({
  column,
  countLabel,
  headerId,
  onClearClaimed,
  onToggleCollapsed,
  reduceMotion,
  refuseChip,
  shake,
  total,
}: {
  column: RequestColumnMeta;
  countLabel: string;
  headerId: string;
  onClearClaimed?: () => void;
  onToggleCollapsed: () => void;
  reduceMotion: boolean | null;
  refuseChip: boolean;
  shake?: boolean;
  total: number;
}) {
  const shaking = Boolean(shake) && !reduceMotion;
  return (
    <motion.header
      animate={shaking ? { x: [0, -4, 4, -4, 0] } : { x: 0 }}
      className="flex shrink-0 items-center gap-2 rounded-t-xl border-border/50 border-b px-2 py-1.5"
      id={headerId}
      transition={
        shaking
          ? { bounce: 0.4, duration: 0.35, type: "spring" }
          : { duration: 0.15 }
      }
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", column.accent)}
      />
      <h2 className="min-w-0 truncate font-semibold text-xs">{column.label}</h2>
      <span
        className={cn(
          "shrink-0 rounded-full border px-1.5 py-px font-semibold text-[10px] leading-none",
          column.badgeClass
        )}
      >
        {countLabel}
      </span>
      {refuseChip ? (
        <span className="shrink-0 truncate rounded-sm border border-border bg-muted px-1 text-caption text-muted-foreground">
          Can&apos;t place here
        </span>
      ) : null}
      {onClearClaimed ? (
        <button
          aria-label={`Clear ${total} claimed cards`}
          className="press-feedback ml-auto shrink-0 rounded px-1 text-caption text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={total === 0}
          onClick={onClearClaimed}
          type="button"
        >
          Clear
        </button>
      ) : null}
      {column.isOffFlow ? (
        <button
          aria-expanded
          aria-label={`Collapse ${column.label} column`}
          className="press-feedback ml-auto rounded px-1 text-caption text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onToggleCollapsed}
          type="button"
        >
          Collapse
        </button>
      ) : null}
    </motion.header>
  );
}

/**
 * CMIS-UI-05 §2 / §9 / §4.1 — one column: header with filtered count, an
 * independently scrolling card list with a bottom fade mask (Apple §12: scroll
 * edge effects, not hard dividers), a dashed placeholder when empty, and the
 * drag affordances — valid-target highlight, insertion line, and the damped
 * header shake when a forbidden drop is attempted.
 */
export function RequestColumn({
  anySelected,
  cardHandlers,
  collapsed,
  column,
  density,
  draggedCardId,
  dropIndex,
  dropValid,
  illegal,
  items,
  isTarget,
  now,
  onAction,
  onClearClaimed,
  onKeyboardMove,
  onOpen,
  onRegisterColumn,
  onToggleCollapsed,
  onToggleSelect,
  selectedIds,
  shake,
  total,
}: {
  anySelected: boolean;
  cardHandlers?: (item: RequestItem) => HTMLAttributes<HTMLElement>;
  collapsed: boolean;
  column: RequestColumnMeta;
  density: Density;
  draggedCardId?: string | null;
  dropIndex?: number | null;
  dropValid?: boolean;
  /** This lane cannot accept the card in flight (F3.2). */
  illegal?: boolean;
  items: RequestItem[];
  isTarget?: boolean;
  now: number;
  onAction: (item: RequestItem, action: RequestAction) => void;
  /** F9 — present only on Claimed; opens the clear confirmation. */
  onClearClaimed?: () => void;
  /** Alt+←/→ — the Card lifts and springs into the adjacent legal column. */
  onKeyboardMove?: (
    item: RequestItem,
    direction: -1 | 1,
    rect: DOMRect
  ) => void;
  onOpen: (item: RequestItem, rect: DOMRect | null) => void;
  onRegisterColumn: (
    status: RequestColumnMeta["status"],
    element: HTMLElement | null
  ) => void;
  onToggleCollapsed: () => void;
  onToggleSelect: (id: string) => void;
  selectedIds: ReadonlySet<string>;
  /** Forbidden drop just attempted here. */
  shake?: boolean;
  total: number;
}) {
  const bodyRef = useRef<HTMLUListElement>(null);
  const [showFade, setShowFade] = useState(false);
  const reduceMotion = useReducedMotion();
  const headerId = `request-column-${column.status}`;

  const columnRef = useCallback(
    (element: HTMLElement | null) => onRegisterColumn(column.status, element),
    [column.status, onRegisterColumn]
  );

  // The scroll box keeps its own height as cards are added, so re-measure on
  // list change rather than watching the element's box.
  useEffect(() => {
    if (items.length === 0) {
      setShowFade(false);
      return;
    }
    setShowFade(overflowsBottom(bodyRef.current));
  }, [items.length]);

  const handleScroll = useCallback(() => {
    setShowFade(overflowsBottom(bodyRef.current));
  }, []);

  // Only lanes that cannot take the card in flight fade, and only while a
  // gesture is live — never because "an overlay exists" (D6/F3.2).
  const dimmed = Boolean(illegal);
  const highlight = isTarget && dropValid;
  // The hovered illegal lane says no in words while the drag is still in hand.
  const refuseChip = Boolean(isTarget) && !dropValid;

  if (collapsed) {
    return (
      <section
        aria-label={`${column.label} column, collapsed`}
        className={cn(
          "flex h-full w-12 shrink-0 snap-start flex-col items-center rounded-xl border border-border/50 bg-muted/20 py-2 transition-all duration-200 ease-out",
          highlight && "border-[var(--ring)] border-dashed bg-primary/10",
          dimmed && "opacity-45"
        )}
        ref={columnRef}
      >
        <button
          aria-expanded={false}
          aria-label={`Expand ${column.label} column — ${total} requests`}
          className="press-feedback flex flex-1 flex-col items-center gap-2 rounded-lg px-1.5 hover:bg-muted"
          onClick={onToggleCollapsed}
          type="button"
        >
          <span
            aria-hidden
            className={cn("size-2 rounded-full", column.accent)}
          />
          <span className="font-medium text-caption text-muted-foreground [writing-mode:vertical-rl]">
            {column.label}
          </span>
          <span className="rounded-full border border-border bg-card px-1.5 py-0.5 font-semibold text-[10px] leading-none">
            {total}
          </span>
        </button>
      </section>
    );
  }

  const countLabel =
    items.length === total ? `${total}` : `${items.length} of ${total}`;
  const showIndicator = Boolean(highlight) && dropIndex !== null;

  return (
    <section
      aria-labelledby={headerId}
      className={cn(
        "flex h-full min-h-0 shrink-0 snap-start flex-col rounded-xl border bg-muted/20 transition-all duration-200 ease-out",
        // CMIS-UI-05 §2 — 260px at ≥1200, 220px at 800–1199 (48px when collapsed)
        "w-[220px] min-[1200px]:w-[260px]",
        highlight
          ? "border-[var(--ring)] border-dashed bg-primary/10"
          : "border-border/50",
        dimmed && "opacity-45"
      )}
      ref={columnRef}
      title={column.description}
    >
      <ColumnHeader
        column={column}
        countLabel={countLabel}
        headerId={headerId}
        onClearClaimed={onClearClaimed}
        onToggleCollapsed={onToggleCollapsed}
        reduceMotion={reduceMotion}
        refuseChip={refuseChip}
        shake={shake}
        total={total}
      />

      <div className="relative min-h-0 flex-1">
        <ul
          className="h-full list-none space-y-2 overflow-y-auto p-1.5"
          data-lane-scroll={column.status}
          onScroll={handleScroll}
          ref={bodyRef}
        >
          {items.length === 0 ? (
            <li className="list-none">
              <p className="rounded-lg border border-border/70 border-dashed px-2 py-6 text-center text-caption text-muted-foreground">
                {total === 0
                  ? `No ${column.label.toLowerCase()} requests`
                  : "No matches for filters"}
              </p>
            </li>
          ) : null}

          {items.map((item, index) => (
            <Fragment key={item.id}>
              {showIndicator && dropIndex === index ? <DropIndicator /> : null}
              <RequestCard
                anySelected={anySelected}
                density={density}
                dragging={draggedCardId === item.id}
                dragHandlers={cardHandlers?.(item)}
                item={item}
                now={now}
                onAction={onAction}
                onKeyboardMove={onKeyboardMove}
                onOpen={onOpen}
                onToggleSelect={onToggleSelect}
                selected={selectedIds.has(item.id)}
              />
            </Fragment>
          ))}

          {showIndicator && (dropIndex ?? 0) >= items.length ? (
            <DropIndicator />
          ) : null}
        </ul>

        {showFade ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-xl bg-gradient-to-b from-transparent to-muted/60"
          />
        ) : null}
      </div>
    </section>
  );
}
