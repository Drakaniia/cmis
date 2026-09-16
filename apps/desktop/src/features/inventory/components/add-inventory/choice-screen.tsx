import { cn } from "@cmis/ui/lib/utils";
import { ClipboardList, Layers, PackagePlus } from "lucide-react";
import { type ComponentType, useCallback } from "react";

/**
 * Spec §7.1 — the choice screen an operator lands on at `/admin/inventory/add`.
 *
 * Three doors, in the order the spec ranks them: creating a medicine the app has
 * never seen comes first, and only the delivery-sheet card is a multi-product
 * surface (Phase 4).
 */

interface ChoiceCardSpec {
  description: string;
  disabled?: boolean;
  disabledNote?: string;
  icon: ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
  id: string;
  onClick: () => void;
  primary?: boolean;
  title: string;
}

function ChoiceCard({ card }: { card: ChoiceCardSpec }) {
  const Icon = card.icon;
  // React hands the click event to whatever it is given, so the event has to be
  // dropped here — the card's callbacks take no arguments on purpose.
  const handleClick = useCallback(() => card.onClick(), [card.onClick]);

  return (
    <li className="flex">
      <button
        className={cn(
          "press-feedback flex h-full w-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
          card.primary ? "border-primary/40" : "border-border",
          "hover:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        disabled={card.disabled}
        onClick={handleClick}
        type="button"
      >
        <span className="rounded-lg bg-muted p-2">
          <Icon aria-hidden className="size-5" />
        </span>
        <span className="font-semibold text-sm">{card.title}</span>
        <span className="text-caption text-muted-foreground">
          {card.description}
        </span>
        {card.disabled && card.disabledNote ? (
          <span className="text-caption text-muted-foreground italic">
            {card.disabledNote}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function ChoiceScreen({
  hasItems,
  onAddBatches,
  onDeliverySheet,
  onNewProduct,
}: {
  hasItems: boolean;
  onAddBatches: () => void;
  onDeliverySheet: () => void;
  onNewProduct: () => void;
}) {
  const cards: ChoiceCardSpec[] = [
    {
      description:
        "Create a medication the inventory has never seen, with one or more batches",
      icon: PackagePlus,
      id: "new-product",
      onClick: onNewProduct,
      primary: true,
      title: "New product",
    },
    {
      description:
        "Add expiry lots to a product that is already in the inventory",
      disabled: !hasItems,
      disabledNote: "No inventory items to add to.",
      icon: Layers,
      id: "add-batches",
      onClick: onAddBatches,
      title: "Add batches",
    },
    {
      description:
        "Receive a whole delivery — several products, each with its own batches",
      icon: ClipboardList,
      id: "delivery-sheet",
      onClick: onDeliverySheet,
      title: "Delivery sheet",
    },
  ];

  return (
    <ul
      aria-label="Ways to add inventory"
      className="grid gap-3 sm:grid-cols-3"
    >
      {cards.map((card) => (
        <ChoiceCard card={card} key={card.id} />
      ))}
    </ul>
  );
}
