"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { BookOpenText, Bug, LifeBuoy } from "lucide-react";
import { useCallback } from "react";

import { useHelpDialogs } from "../help-dialogs-context";
import { DOCS_ROUTE } from "../lib/help-commands";
import { DOCS_SHORTCUT_LABEL } from "../use-help-shortcuts";

/**
 * Header Help control — icon button + two-item dropdown.
 *
 * Deliberately only two items (docs, report an issue): shortcuts, updates and
 * About stay in the menubar and the About modal so the header menu stays a
 * single, obvious decision.
 */
export function HelpMenu() {
  const navigate = useNavigate();
  const { openReportIssue } = useHelpDialogs();

  const handleOpenDocumentation = useCallback(() => {
    navigate({ to: DOCS_ROUTE }).catch(() => undefined);
  }, [navigate]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Help"
        className="relative flex size-8 select-none items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground"
      >
        <LifeBuoy className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-md p-1"
        sideOffset={6}
      >
        <DropdownMenuItem
          className="rounded-sm"
          onClick={handleOpenDocumentation}
        >
          <BookOpenText className="size-3.5" />
          <span className="flex-1">View Documentation</span>
          <DropdownMenuShortcut>{DOCS_SHORTCUT_LABEL}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-sm" onClick={openReportIssue}>
          <Bug className="size-3.5" />
          <span className="flex-1">Report an Issue…</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
