import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@cmis/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-clip-padding font-medium text-xs outline-none transition-[transform,box-shadow,background-color] duration-150 ease-out focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8 rounded-lg",
        "icon-lg": "size-9 rounded-lg",
        "icon-sm": "size-7 rounded-md",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 gap-1 rounded-none px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-6 gap-1 rounded-none px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
      },
      variant: {
        /* §16 Agency — confirm actions (non-destructive primary) use a confident solid fill,
         * distinct from the destructive tint. Matches Apple's pattern of solid, unambiguous CTAs
         * that say "yes, proceed" without the tentative ghost-to-solid on-hover. */
        confirm:
          "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/15 hover:bg-primary/90 hover:shadow-md active:shadow-sm",
        /* §16 Simplicity — default primary action; §1 Response — press feedback via base active:scale */
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md active:shadow-sm",
        /* §16 Craft — destructive actions are visually assertive, not tentative. §16 Responsibility —
         * irreversible actions (deny, dispose, delete) use a solid-tinted background that reads as
         * "this will do something" at a glance, never a light ghost that hides the consequence. */
        destructive:
          "bg-[color-mix(in_oklch,var(--destructive),transparent_75%)] text-destructive shadow-sm ring-1 ring-destructive/15 hover:bg-[color-mix(in_oklch,var(--destructive),transparent_60%)] hover:shadow-md focus-visible:border-destructive/40 focus-visible:ring-destructive/30 dark:bg-[color-mix(in_oklch,var(--destructive),transparent_70%)] dark:focus-visible:ring-destructive/40 dark:hover:bg-[color-mix(in_oklch,var(--destructive),transparent_50%)]",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        outline:
          "border-border bg-background shadow-sm hover:bg-muted hover:text-foreground hover:shadow-md aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] hover:shadow-md aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
      },
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ className, size, variant }))}
      data-slot="button"
      {...props}
    />
  );
}

export { Button, buttonVariants };
