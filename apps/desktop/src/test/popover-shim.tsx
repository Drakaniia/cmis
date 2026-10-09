/**
 * Test-only stand-in for `@cmis/ui/components/popover`.
 *
 * Base UI's floating positioner costs ~20s per open under jsdom: it re-measures
 * the anchor on every layout pass, and jsdom has no layout engine to answer
 * cheaply. Swapping in plain elements keeps tests that need an *open* popover
 * on the fast path while still exercising real open/close wiring.
 *
 * Use it with `vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"))`.
 * Positioning itself is Base UI's concern, not ours.
 */
import {
  type ButtonHTMLAttributes,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
} from "react";

interface PopoverOpenState {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const OpenContext = createContext<PopoverOpenState>({
  open: false,
  setOpen: () => undefined,
});

export function Popover({
  children,
  open = false,
  onOpenChange,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  return (
    <OpenContext.Provider
      value={{ open, setOpen: (next) => onOpenChange?.(next) }}
    >
      {children}
    </OpenContext.Provider>
  );
}

export function PopoverTrigger({
  children,
  nativeButton: _nativeButton,
  render,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  nativeButton?: boolean;
  render?: ReactElement;
}) {
  const { open, setOpen } = useContext(OpenContext);
  const handleClick = useCallback(() => setOpen(!open), [open, setOpen]);
  if (isValidElement(render)) {
    return cloneElement(
      render as ReactElement<Record<string, unknown>>,
      { onClick: handleClick, ...props },
      children
    );
  }
  return (
    <button onClick={handleClick} type="button" {...props}>
      {children}
    </button>
  );
}

export function PopoverPortal({ children }: { children?: ReactNode }) {
  return children;
}

export function PopoverPositioner({ children }: { children?: ReactNode }) {
  return children;
}

export function PopoverPopup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { open } = useContext(OpenContext);
  return open ? <div className={className}>{children}</div> : null;
}
