import { Button } from "@cmis/ui/components/button";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback } from "react";

import { sheetSpring } from "@/lib/motion";
import type { BatchAction } from "../transitions";

function BatchActionButton({
  action,
  onAction,
}: {
  action: BatchAction;
  onAction: (action: BatchAction) => void;
}) {
  const handleClick = useCallback(() => onAction(action), [action, onAction]);

  return (
    <Button
      className="press-feedback rounded-full"
      onClick={handleClick}
      size="sm"
      variant={action.destructive ? "destructive" : "secondary"}
    >
      {action.label}
    </Button>
  );
}

/**
 * CMIS-UI-05 §4.4 — the batch toolbar.
 *
 * A frosted floating layer, not a docked bar (Apple §12): the board keeps its
 * full height and the toolbar reads as a functional layer above it. Actions are
 * column-aware and arrive pre-derived from `transitions.ts`, so a mixed
 * selection can only ever offer what is actually legal.
 */
export function RequestsBatchToolbar({
  actions,
  count,
  onAction,
  onClearSelection,
}: {
  actions: BatchAction[];
  count: number;
  onAction: (action: BatchAction) => void;
  onClearSelection: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          aria-label="Batch actions"
          className="surface-frosted pointer-events-auto fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border/60 px-1.5 py-1.5 shadow-xl"
          exit={{ opacity: 0, y: 12 }}
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          role="toolbar"
          transition={sheetSpring}
        >
          <div className="flex items-center gap-1.5">
            <span className="pl-2 font-semibold text-xs tabular-nums">
              {count} selected
            </span>
            <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
            {actions.map((action) => (
              <BatchActionButton
                action={action}
                key={action.id}
                onAction={onAction}
              />
            ))}
            <Button
              className="press-feedback rounded-full text-muted-foreground"
              onClick={onClearSelection}
              size="sm"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
