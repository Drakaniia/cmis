/**
 * Shared control styling for the Add Inventory forms, matching the Stock In
 * wizard's field classes so the two intake surfaces read as one app.
 */

export const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

export const LABEL_CLASS = "block font-medium text-caption text-foreground";

export const SELECT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

export const HINT_CLASS = "mt-1 block text-caption text-muted-foreground";

export const ERROR_CLASS = "mt-1 block text-caption text-destructive";

export const CARD_CLASS = "rounded-xl border border-border bg-card p-3";

/**
 * Grid cells are unlabelled (the column header labels them), so a cell carries
 * its own `aria-label` and fits one 32px control row.
 */
export const CELL_CLASS =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

export const CELL_STATIC_CLASS = "truncate text-caption text-muted-foreground";

/** Marks a shared-default control the operator has set on this group (§7.4). */
export const CELL_OVERRIDE_CLASS = "font-medium text-[10px] text-primary";
