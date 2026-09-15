"use client";

import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { DOCS_ROUTE } from "./lib/help-commands";

export const DOCS_SHORTCUT_LABEL = "F1";

/**
 * F1 → in-app documentation.
 *
 * Lives with the Help feature rather than the Win/Linux menubar so it also
 * works on macOS, where the custom menubar is hidden in favour of the native
 * one. F1 carries no conflicting accelerator (see `menu-config.ts`).
 */
export function useHelpShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F1" || event.defaultPrevented) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      navigate({ to: DOCS_ROUTE }).catch(() => undefined);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);
}
