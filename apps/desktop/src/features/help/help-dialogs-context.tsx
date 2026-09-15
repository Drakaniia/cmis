"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { ReportIssueDialog } from "./components/report-issue-dialog";
import { useHelpShortcuts } from "./use-help-shortcuts";

interface HelpDialogsValue {
  closeReportIssue: () => void;
  isReportIssueOpen: boolean;
  openReportIssue: () => void;
}

const HelpDialogsContext = createContext<HelpDialogsValue | null>(null);

export function useHelpDialogs(): HelpDialogsValue {
  const value = useContext(HelpDialogsContext);
  if (!value) {
    throw new Error("useHelpDialogs must be used within HelpDialogsProvider");
  }
  return value;
}

/** Non-throwing variant for surfaces that may render outside the provider. */
export function useHelpDialogsOptional(): HelpDialogsValue | null {
  return useContext(HelpDialogsContext);
}

/**
 * Shared Help host — mounted once in `__root.tsx`.
 *
 * Every entry point (header dropdown, ⌘K palette, menubar, native macOS menu)
 * calls the same `openReportIssue()` instead of holding its own dialog state,
 * so the dialog behaves identically no matter how it was reached. The F1 docs
 * shortcut is hosted here too so it works on every platform.
 */
export function HelpDialogsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isReportIssueOpen, setReportIssueOpen] = useState(false);

  useHelpShortcuts();

  const openReportIssue = useCallback(() => setReportIssueOpen(true), []);
  const closeReportIssue = useCallback(() => setReportIssueOpen(false), []);

  const value = useMemo<HelpDialogsValue>(
    () => ({ closeReportIssue, isReportIssueOpen, openReportIssue }),
    [closeReportIssue, isReportIssueOpen, openReportIssue]
  );

  return (
    <HelpDialogsContext.Provider value={value}>
      {children}
      <ReportIssueDialog
        onOpenChange={setReportIssueOpen}
        open={isReportIssueOpen}
      />
    </HelpDialogsContext.Provider>
  );
}
