import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { type ReactNode, useCallback } from "react";

import { Sparkline, StatusDot } from "../../components/indicators";
import type { HealthAction, HealthCardData } from "../types";

function HealthActionButton({
  action,
  cardId,
  onAction,
}: {
  action: HealthAction;
  cardId: HealthCardData["id"];
  onAction: (id: HealthCardData["id"], action: HealthAction) => void;
}) {
  const handleClick = useCallback(
    () => onAction(cardId, action),
    [action, cardId, onAction]
  );

  return (
    <Button
      className="press-feedback"
      onClick={handleClick}
      size="sm"
      variant="ghost"
    >
      {action.label}
    </Button>
  );
}

/**
 * CMIS-UI-09 §5.3 — card anatomy. The action row uses ghost buttons: these are
 * diagnostic and infrequent, so they must not compete with primary actions.
 */
export function HealthCard({
  card,
  className,
  dimmed = false,
  onAction,
  children,
}: {
  card: HealthCardData;
  children?: ReactNode;
  className?: string;
  dimmed?: boolean;
  onAction: (id: HealthCardData["id"], action: HealthAction) => void;
}) {
  return (
    <section
      aria-label={card.title}
      className={cn(
        "field-opaque flex flex-col rounded-md p-4 transition-opacity",
        dimmed && "opacity-70",
        className
      )}
      style={{ minHeight: 140 }}
    >
      <div className="flex items-center gap-2">
        <StatusDot
          label={card.statusLabel}
          pulse={card.status !== "ok"}
          status={card.status}
        />
        <h3 className="font-semibold text-foreground text-heading tracking-tight">
          {card.title}
        </h3>
        <span className="ml-auto truncate text-caption text-muted-foreground">
          {card.statusLabel}
        </span>
      </div>

      <p className="mt-2 font-bold text-display text-foreground leading-none">
        {card.metric}
      </p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-caption text-muted-foreground">
          {card.caption}
          {dimmed ? " · Local cache" : ""}
        </p>
        <Sparkline data={card.trend} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {card.actions.map((action) => (
          <HealthActionButton
            action={action}
            cardId={card.id}
            key={action.id}
            onAction={onAction}
          />
        ))}
      </div>

      {children}
    </section>
  );
}
