/**
 * Test-only stand-in for `@cmis/ui/components/dropdown-menu`.
 *
 * Same reasoning as `popover-shim.tsx`: Base UI's floating positioner re-measures
 * its anchor on every layout pass, and jsdom has no layout engine to answer
 * cheaply, so an *open* menu costs seconds per render. Rendering the trigger and
 * the content as plain elements keeps the open/close wiring and the item
 * handlers under test while leaving positioning to Base UI.
 *
 * Use it with
 * `vi.mock("@cmis/ui/components/dropdown-menu", () => import("@/test/dropdown-menu-shim"))`.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function DropdownMenu({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function DropdownMenuTrigger({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={className} type="button" {...props}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
}: {
  align?: "start" | "end" | "center";
  children: ReactNode;
}) {
  return <div role="menu">{children}</div>;
}

export function DropdownMenuItem({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button disabled={disabled} onClick={onClick} role="menuitem" type="button">
      {children}
    </button>
  );
}
