import { cn } from "@cmis/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
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
      className="flex shrink-0 items-center gap-2 rounded-t-[14px] border-b border-border/40 bg-card/70 px-3 py-2.5 backdrop-blur-[12px] backdrop-saturate-[160%]"
      id={headerId}
      style={{
        borderTop: "1px solid color-mix(in oklch, var(--card) 60%, transparent)",
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.35)",
      }}
      transition={
        shaking
          ? { bounce: 0.4, duration: 0.35, type: "spring" }
          : { duration: 0.15 }
      }
    >
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full shadow-[0_0_6px_currentColor] ring-1 ring-white/20",
          column.accent
        )}
        style={{ color: "inherit" }}
      />
      <h2 className="min-w-0 truncate font-semibold text-[12px] tracking-[-0.01em] text-foreground">
        {column.label}
      </h2>
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 font-semibold text-[10px] leading-none tracking-[0.02em] tabular-nums",
          column.badgeClass
        )}
      >
        {countLabel}
      </span>
      {refuseChip ? (
        <span className="shrink-0 truncate rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-medium text-[10px] tracking-[0.01em] text-amber-700 dark:text-amber-300">
          Can&apos;t place here
        </span>
      ) : null}
      {onClearClaimed ? (
        <button
          aria-label={`Clear ${total} claimed cards`}
          className="press-feedback ml-auto inline-flex shrink-0 items-center rounded-full border border-border/60 bg-card px-2.5 py-1 font-medium text-[11px] tracking-[0.01em] text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
          className="press-feedback ml-auto inline-flex shrink-0 items-center rounded-full border border-border/60 bg-card px-2 py-1 font-medium text-[11px] text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
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
 * drag affordances — valid-target highlight, the ghost of the card in flight
 * sitting in its destination slot, and the damped header shake when a forbidden
 * drop is attempted.
 */
export function RequestColumn({
  anySelected,
  cardHandlers,
  collapsed,
  column,
  count,
  density,
  draggedCardId,
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
  /** Committed filtered count — stable across a live drag preview. */
  count: number;
  density: Density;
  draggedCardId?: string | null;
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
          "flex h-full w-12 shrink-0 snap-start flex-col items-center rounded-[14px] border py-2 backdrop-blur-[10px] transition-all duration-200 ease-out",
          highlight
            ? "border-[var(--ring)] border-dashed bg-primary/10 shadow-[0_0_0_1px_var(--ring)]"
            : "border-border/40 bg-card/60",
          dimmed && "opacity-40 saturate-50"
        )}
        ref={columnRef}
      >
        <button
          aria-expanded={false}
          aria-label={`Expand ${column.label} column — ${total} requests`}
          className="press-feedback flex flex-1 flex-col items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-accent/60"
          onClick={onToggleCollapsed}
          type="button"
        >
          <span
            aria-hidden
            className={cn(
              "size-2.5 rounded-full shadow-[0_0_6px_currentColor]",
              column.accent
            )}
          />
          <span className="font-semibold text-[11px] tracking-[0.02em] text-muted-foreground [writing-mode:vertical-rl]">
            {column.label}
          </span>
          <span className="rounded-full border border-border bg-card px-1.5 py-0.5 font-semibold text-[10px] leading-none tabular-nums">
            {total}
          </span>
        </button>
      </section>
    );
  }

  const countLabel = count === total ? `${total}` : `${count} of ${total}`;

  return (
    <section
      aria-labelledby={headerId}
      className={cn(
        "flex h-full min-h-0 shrink-0 snap-start flex-col rounded-[14px] border backdrop-blur-[8px] transition-all duration-300 ease-out",
        "w-[228px] min-[1200px]:w-[268px]",
        highlight
          ? "border-[var(--ring)] border-dashed bg-primary/[0.06] shadow-[0_0_0_1px_var(--ring),0_8px_24px_oklch(0_0_0/0.06)]"
          : "border-border/40 bg-card/55 shadow-[0_1px_3px_oklch(0_0_0/0.04),0_8px_24px_oklch(0_0_0/0.03)]",
        dimmed && "opacity-40 saturate-50 blur-[0.2px]"
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
          className="flex h-full list-none flex-col gap-2.5 overflow-y-auto p-2"
          data-lane-scroll={column.status}
          onScroll={handleScroll}
          ref={bodyRef}
        >
          {items.length === 0 ? (
            <li className="shrink-0 list-none">
              <p className="rounded-xl border border-border/40 border-dashed bg-card/40 px-3 py-8 text-center text-[12px] leading-[1.4] tracking-[0.01em] text-muted-foreground backdrop-blur-sm">
                {total === 0
                  ? `No ${column.label.toLowerCase()} requests`
                  : "No matches for filters"}
              </p>
            </li>
          ) : null}

          {items.map((item) => (
            <RequestCard
              anySelected={anySelected}
              density={density}
              dragging={draggedCardId === item.id}
              dragHandlers={cardHandlers?.(item)}
              item={item}
              key={item.id}
              now={now}
              onAction={onAction}
              onKeyboardMove={onKeyboardMove}
              onOpen={onOpen}
              onToggleSelect={onToggleSelect}
              selected={selectedIds.has(item.id)}
            />
          ))}
        </ul>

        {showFade ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-[14px] bg-gradient-to-b from-transparent via-card/40 to-card/80 backdrop-blur-[1px]"
          />
        ) : null}
      </div>
    </section>
  );
}
