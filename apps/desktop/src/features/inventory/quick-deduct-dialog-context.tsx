import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { QuickDeductModal } from "./components/quick-deduct-modal";

/**
 * F1 — the quick deduction is reachable from any screen, so it is mounted once
 * at the app root and opened through this context rather than owned by a route.
 *
 * The menubar accelerator (`Ctrl+D` / `⌘D`), the macOS native menu item and the
 * command palette all go through the one `openQuickDeduct`, so the three entry
 * points cannot drift apart. Repeated presses are no-ops: the state is a
 * boolean, so a second `Ctrl+D` cannot stack a second modal (E10).
 */
interface QuickDeductDialogValue {
  openQuickDeduct: () => void;
}

const NOOP: QuickDeductDialogValue = { openQuickDeduct: () => undefined };

const QuickDeductDialogContext = createContext<QuickDeductDialogValue | null>(
  null
);

export function QuickDeductDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openQuickDeduct = useCallback(() => setOpen(true), []);
  const value = useMemo<QuickDeductDialogValue>(
    () => ({ openQuickDeduct }),
    [openQuickDeduct]
  );

  return (
    <QuickDeductDialogContext.Provider value={value}>
      {children}
      <QuickDeductModal onOpenChange={setOpen} open={open} />
    </QuickDeductDialogContext.Provider>
  );
}

/** Falls back to a no-op outside the provider, so isolated renders still work. */
export function useQuickDeductDialog(): QuickDeductDialogValue {
  return useContext(QuickDeductDialogContext) ?? NOOP;
}
