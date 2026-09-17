import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { NewRequestModal } from "./components/new-request-modal";

/**
 * F1 — the New Request form is reachable from anywhere, so it is mounted once at
 * the app root and opened through this context rather than owned by a route.
 *
 * The board, the menubar and (on macOS) the native menu all go through the one
 * `openNewRequest`, which keeps the accelerator, the menu item and any future
 * entry point from drifting apart.
 */
interface NewRequestDialogValue {
  openNewRequest: () => void;
}

const NOOP: NewRequestDialogValue = { openNewRequest: () => undefined };

const NewRequestDialogContext = createContext<NewRequestDialogValue | null>(
  null
);

/** How long the dialog stays mounted after closing, so it can animate out. */
const EXIT_MS = 250;

export function NewRequestDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const openNewRequest = useCallback(() => setOpen(true), []);
  const value = useMemo<NewRequestDialogValue>(
    () => ({ openNewRequest }),
    [openNewRequest]
  );

  // Mounted on first open, not at startup: the form loads the inventory list for
  // its autocomplete, and paying for that on every launch to show a dialog most
  // sessions never open is the wrong trade. It stays mounted briefly after
  // closing so the exit animation still plays.
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <NewRequestDialogContext.Provider value={value}>
      {children}
      {mounted ? <NewRequestModal onOpenChange={setOpen} open={open} /> : null}
    </NewRequestDialogContext.Provider>
  );
}

/** Falls back to a no-op outside the provider, so isolated renders still work. */
export function useNewRequestDialog(): NewRequestDialogValue {
  return useContext(NewRequestDialogContext) ?? NOOP;
}
