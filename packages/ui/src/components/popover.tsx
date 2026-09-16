"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@cmis/ui/lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverPortal({ ...props }: PopoverPrimitive.Portal.Props) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverPositioner({
  className,
  ...props
}: PopoverPrimitive.Positioner.Props) {
  return (
    <PopoverPrimitive.Positioner
      className={cn("z-50 outline-none", className)}
      data-slot="popover-positioner"
      {...props}
    />
  );
}

function PopoverPopup({ className, ...props }: PopoverPrimitive.Popup.Props) {
  return (
    <PopoverPrimitive.Popup
      className={cn(
        "data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 rounded-xl border border-border/40 bg-popover p-3 text-popover-foreground text-xs/relaxed shadow-xl outline-none duration-100 data-closed:animate-out data-open:animate-in",
        className
      )}
      data-slot="popover-popup"
      {...props}
    />
  );
}

export {
  Popover,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
};
