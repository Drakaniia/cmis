import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

import type { RequestAction } from "../transitions";
import { requestActions } from "../transitions";
import type { RequestStatus } from "../types";

/**
 * CMIS-UI-05 §4.2 — the per-card ⋯ menu. Secondary, always available: the
 * precision path for when a drag is the wrong tool (Apple §16 Agency).
 * Only actions legal for the card's column are rendered at all — never shown
 * disabled, which keeps the error surface at zero.
 */
export function RequestCardMenu({
  onAction,
  onOpenChange,
  open,
  requestorName,
  status,
}: {
  onAction: (action: RequestAction) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requestorName: string;
  status: RequestStatus;
}) {
  const [view, ...statusActions] = requestActions(status);

  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger
        aria-label={`Actions for ${requestorName}`}
        className="press-feedback inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onClick={() => onAction(view)}>
          {view.label}
        </DropdownMenuItem>
        {statusActions.length > 0 ? <DropdownMenuSeparator /> : null}
        {statusActions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            onClick={() => onAction(action)}
            variant={action.destructive ? "destructive" : "default"}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
