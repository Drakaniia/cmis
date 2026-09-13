/**
 * CMIS-UI-01 §7 — Quick actions (reimagined).
 *
 * 2×2 grid of action cards: Stock In, Scan Barcode, Go to Requests,
 * Go to Inventory. Each action fires onAction(id, rect) so the parent
 * can open a sheet (materialize from the trigger rect) or navigate
 * to a list page.
 *
 * Apple Design — staggered entrance: cards fade up one-by-one so the
 * grid "blossoms" on first paint. Each card has a subtle accent stripe
 * and hover lift for direct-manipulation feedback.
 */

import {
  ArrowRightLeft,
  ClipboardList,
  Package,
  ScanBarcode,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback } from "react";

import { densitySpring } from "@/lib/motion";

export type QuickActionId = "inventory" | "requests" | "scan" | "stock-in";

interface QuickActionDef {
  description: string;
  icon: React.ElementType;
  id: QuickActionId;
  label: string;
}

const ACTIONS: QuickActionDef[] = [
  {
    description: "Add new stock or receive deliveries",
    icon: Package,
    id: "stock-in",
    label: "Stock In",
  },
  {
    description: "Look up an item by barcode",
    icon: ScanBarcode,
    id: "scan",
    label: "Scan Barcode",
  },
  {
    description: "Review and process the queue",
    icon: ClipboardList,
    id: "requests",
    label: "Request Queue",
  },
  {
    description: "Browse full inventory list",
    icon: ArrowRightLeft,
    id: "inventory",
    label: "Inventory",
  },
];

const SECTION = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 12 },
} as const;

function QuickActionButton({
  action,
  onAction,
}: {
  action: QuickActionDef;
  onAction: (id: QuickActionId, rect: DOMRect | null) => void;
}) {
  const Icon = action.icon;
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onAction(action.id, rect);
    },
    [action.id, onAction]
  );

  return (
    <button
      className="press-feedback flex w-full items-center gap-3 rounded-lg border border-border/40 bg-background/50 px-3 py-3 text-left transition-colors hover:border-border/70 hover:bg-accent"
      onClick={handleClick}
      type="button"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon aria-hidden className="size-4 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-xs">
          {action.label}
        </span>
        <span className="block truncate text-caption text-muted-foreground">
          {action.description}
        </span>
      </span>
    </button>
  );
}

export function QuickActions({
  onAction,
}: {
  onAction: (id: QuickActionId, rect: DOMRect | null) => void;
}) {
  return (
    <motion.div
      className="canvas-card flex min-w-0 flex-col overflow-hidden rounded-xl"
      {...SECTION}
      transition={{ ...densitySpring, staggerChildren: 0.04 }}
    >
      <div className="px-4 pt-4 pb-2">
        <h2 className="font-semibold text-ui">Quick actions</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        {ACTIONS.map((action) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 8 }}
            key={action.id}
            transition={densitySpring}
          >
            <QuickActionButton action={action} onAction={onAction} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
