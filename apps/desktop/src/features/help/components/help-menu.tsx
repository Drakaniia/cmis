"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { BookOpenText, Bug, LifeBuoy, RefreshCw } from "lucide-react";
import { useCallback } from "react";

import { useUpdaterOptional } from "@/features/updater/use-updater";
import { useHelpDialogs } from "../help-dialogs-context";
import { DOCS_ROUTE } from "../lib/help-commands";
import { DOCS_SHORTCUT_LABEL } from "../use-help-shortcuts";

/**
 * Header Help control — icon button + dropdown.
 *
 * Shortcuts, About and the update log stay in the menubar and the About modal;
 * this menu keeps the three things users reach for from an in-app header:
 * docs, an explicit update check (non-silent, so it always toasts a result),
 * and reporting an issue.
 */
export function HelpMenu() {
  const navigate = useNavigate();
  const { openReportIssue } = useHelpDialogs();
  const updater = useUpdaterOptional();

  const handleOpenDocumentation = useCallback(() => {
    navigate({ to: DOCS_ROUTE }).catch(() => undefined);
  }, [navigate]);

  const handleCheckForUpdates = useCallback(() => {
    updater?.checkNow({ silent: false }).catch(() => undefined);
  }, [updater]);

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
        <DropdownMenuItem
          className="rounded-sm"
          onClick={handleCheckForUpdates}
        >
          <RefreshCw className="size-3.5" />
          <span className="flex-1">Check for Updates…</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-sm" onClick={openReportIssue}>
          <Bug className="size-3.5" />
          <span className="flex-1">Report an Issue…</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
