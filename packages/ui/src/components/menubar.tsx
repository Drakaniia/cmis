"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "@cmis/ui/lib/utils";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";

function Menubar({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menubar" {...props} />;
}

function MenubarMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menubar-menu" {...props} />;
}

function MenubarTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger
      className={cn(
        "inline-flex h-6 select-none items-center rounded-[5px] px-2 font-medium text-[12px] text-foreground/80 tracking-tight transition-colors duration-100 hover:bg-black/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground dark:hover:bg-white/[0.08]",
        className
      )}
      data-slot="menubar-trigger"
      {...props}
    />
  );
}

function MenubarContent({
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        className="z-50 outline-none"
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={cn(
            "data-open:fade-in-0 data-closed:fade-out-0 data-open:zoom-in-95 data-closed:zoom-out-95 max-h-[min(70vh,420px)] min-w-[220px] origin-top-left overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in",
            className
          )}
          data-slot="menubar-content"
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenubarItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] leading-tight outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-3.5",
        variant === "destructive" &&
          "text-destructive focus:bg-destructive/10 focus:text-destructive",
        className
      )}
      data-inset={inset}
      data-slot="menubar-item"
      data-variant={variant}
      {...props}
    />
  );
}

function MenubarSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="menubar-sub" {...props} />;
}

function MenubarSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.SubmenuTrigger
      className={cn(
        "group flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] leading-tight outline-none focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground",
        className
      )}
      data-inset={inset}
      data-slot="menubar-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-3.5 opacity-60 group-data-[open]:opacity-100" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function MenubarSubContent({
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align="start"
        className="z-50 outline-none"
        side="right"
        sideOffset={6}
      >
        <MenuPrimitive.Popup
          className={cn(
            "data-open:fade-in-0 data-closed:fade-out-0 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in",
            className
          )}
          data-slot="menubar-sub-content"
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenubarSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      data-slot="menubar-separator"
      {...props}
    />
  );
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "ml-auto pl-6 text-[11px] text-muted-foreground tracking-widest",
        className
      )}
      data-slot="menubar-shortcut"
      {...props}
    />
  );
}

function MenubarCheckboxItem({
  className,
  children,
  checked,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 pr-8 text-[13px] outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      data-slot="menubar-checkbox-item"
      {...props}
    >
      <span className="absolute right-2 flex items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon className="size-3.5" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
};
