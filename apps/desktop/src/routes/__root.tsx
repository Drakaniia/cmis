import { Toaster } from "@cmis/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { TitleBar } from "@/components/titlebar";
import { DocsHeader } from "@/features/help/components/docs/docs-header";
import { HelpDialogsProvider } from "@/features/help/help-dialogs-context";
import { useFirstRunHint } from "@/features/help/use-first-run-hint";
import {
  ensurePackSizeBackfill,
  type PackSizeBackfillReport,
} from "@/features/inventory/data/pack-size-backfill";
import {
  ensureStrengthBackfill,
  type StrengthBackfillReport,
} from "@/features/inventory/data/strength-backfill";
import {
  ensureThresholdBackfill,
  type ThresholdBackfillReport,
} from "@/features/inventory/data/threshold-backfill";
import { QuickDeductDialogProvider } from "@/features/inventory/quick-deduct-dialog-context";
import { NewRequestDialogProvider } from "@/features/requests/new-request-dialog-context";
import { UpdaterProvider } from "@/features/updater/use-updater";

import "../index.css";

export interface RouterAppContext {
  /**
   * The run-once pack-pair backfill's outcome, or `null` when there is no
   * database behind this window. See `PackBackfillNotice`.
   */
  packBackfill?: PackSizeBackfillReport | null;
  queryClient: QueryClient;
  /**
   * The run-once strength split's outcome, or `null` when there is no database
   * behind this window (the browser preview). See `StrengthBackfillNotice`.
   *
   * Optional on the router's context, because it is produced by this route's own
   * `beforeLoad` rather than passed in when the router is created.
   */
  strengthBackfill?: StrengthBackfillReport | null;
  /**
   * The run-once threshold derivation's outcome, or `null` when there is no
   * database behind this window. See `ThresholdBackfillNotice`.
   */
  thresholdBackfill?: ThresholdBackfillReport | null;
}

/**
 * The startup hook the strength spec asks for (§6.3, decision 21): the split
 * runs **before any route renders**, so the first inventory query cannot race it
 * and read a half-migrated table. It is guarded to run exactly once per device
 * by its own `app_meta` marker.
 */
export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: async () => ({
    packBackfill: await ensurePackSizeBackfill(),
    strengthBackfill: await ensureStrengthBackfill(),
    thresholdBackfill: await ensureThresholdBackfill(),
  }),
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "cmis",
      },
      {
        name: "description",
        content: "cmis desktop",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

/**
 * Reports what the backfill did, once (§6.3 decision 22).
 *
 * The counts matter less than the review list: a row whose strength text could
 * not be placed is a row the operator should look at, so the warning names the
 * first few and points at where they can be fixed — the Edit form reachable from
 * Stock Management, Expiry Alerts and Low-Stock Alerts.
 */
function StrengthBackfillNotice() {
  const { strengthBackfill } = Route.useRouteContext();

  useEffect(() => {
    if (!strengthBackfill || strengthBackfill.written === 0) {
      return;
    }
    toast.message(
      `Inventory strengths updated — ${strengthBackfill.written} items`,
      {
        description: `${strengthBackfill.uncertain.length} need a review, ${strengthBackfill.blank} had no strength recorded`,
        id: "strength-backfill",
      }
    );
    if (strengthBackfill.uncertain.length > 0) {
      const names = strengthBackfill.uncertain
        .slice(0, 3)
        .map((row) => row.name)
        .join(", ");
      toast.warning(
        `${strengthBackfill.uncertain.length} items have an uncertain strength split`,
        {
          description: `${names}${strengthBackfill.uncertain.length > 3 ? "…" : ""} — review them from Stock Management`,
          id: "strength-backfill-review",
        }
      );
    }
  }, [strengthBackfill]);

  return null;
}

/**
 * Reports what the pack backfill did, once (pack-size spec F9/F10).
 *
 * It is a **separate** notice from the strength one so the two reports cannot be
 * confused: this one's wording is about pack size, and its review lists are the
 * `numbered` (a number with no container — `100’s`) and `unreadable` (prose)
 * rows that a pack-worded request or stock-in would otherwise silently get wrong.
 */
function PackBackfillNotice() {
  const { packBackfill } = Route.useRouteContext();

  useEffect(() => {
    if (!packBackfill) {
      return;
    }
    const flagged =
      packBackfill.numbered.length + packBackfill.unreadable.length;
    if (packBackfill.paired === 0 && flagged === 0) {
      return;
    }
    toast.message(
      `Pack sizes updated — ${packBackfill.paired} items structured`,
      {
        description: `${flagged} items need a review (${packBackfill.numbered.length} without a container, ${packBackfill.unreadable.length} unreadable)`,
        id: "pack-backfill",
      }
    );
    if (flagged > 0) {
      const names = [...packBackfill.numbered, ...packBackfill.unreadable]
        .slice(0, 3)
        .map((row) => row.name)
        .join(", ");
      toast.warning(`${flagged} items have an unclear pack size`, {
        description: `${names}${flagged > 3 ? "…" : ""} — review them from Stock Management`,
        id: "pack-backfill-review",
      });
    }
  }, [packBackfill]);

  return null;
}

/**
 * Reports what the threshold backfill did, once.
 *
 * A third, separate notice, so the strength, pack and threshold reports cannot
 * be confused with one another. The number worth reading is not how many rows
 * moved but how many the month showed no dispensing for: those end up with a
 * threshold of 0, which means they will never raise a low-stock alert until
 * someone sets one.
 */
function ThresholdBackfillNotice() {
  const { thresholdBackfill } = Route.useRouteContext();

  useEffect(() => {
    if (!thresholdBackfill || thresholdBackfill.updated === 0) {
      return;
    }
    const kept =
      thresholdBackfill.kept > 0
        ? ` · ${thresholdBackfill.kept} kept a threshold you set`
        : "";
    toast.message(
      `Reorder points updated — ${thresholdBackfill.updated} items`,
      {
        description: `${thresholdBackfill.noUsage} had no dispensing recorded, so their threshold is 0${kept}`,
        id: "threshold-backfill",
      }
    );
  }, [thresholdBackfill]);

  return null;
}

function RootComponent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem("cmis-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "cmis-sidebar-collapsed",
        String(sidebarCollapsed)
      );
    } catch {
      // ignore storage errors (private mode / quota)
    }
  }, [sidebarCollapsed]);

  const handleToggle = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // Documentation is a standalone reading surface: keep the title bar (window
  // drag + controls) but drop the admin sidebar and header.
  const isDocsRoute = pathname.startsWith("/docs");

  useFirstRunHint({ enabled: !isDocsRoute });

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <UpdaterProvider>
          <HelpDialogsProvider>
            {/* New Request (Ctrl+N) and Quick Deduct (Ctrl+D) are both
                app-wide, so their dialogs are mounted once here rather than
                owned by a route. */}
            <QuickDeductDialogProvider>
              <NewRequestDialogProvider>
                {isDocsRoute ? (
                  <div className="flex h-svh flex-col overflow-hidden overflow-x-hidden">
                    <TitleBar onToggleSidebar={handleToggle} />
                    <DocsHeader />
                    <main className="page-canvas flex-1 overflow-y-auto">
                      <Outlet />
                    </main>
                  </div>
                ) : (
                  <div className="flex h-svh flex-col overflow-hidden overflow-x-hidden">
                    <TitleBar onToggleSidebar={handleToggle} />
                    <div className="flex flex-1 overflow-hidden overflow-x-hidden">
                      <AppSidebar
                        collapsed={sidebarCollapsed}
                        onToggle={handleToggle}
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <Header />
                        <main className="page-canvas flex-1 overflow-y-auto">
                          <Outlet />
                        </main>
                      </div>
                    </div>
                  </div>
                )}
              </NewRequestDialogProvider>
            </QuickDeductDialogProvider>
            <StrengthBackfillNotice />
            <PackBackfillNotice />
            <ThresholdBackfillNotice />
            <Toaster position="bottom-right" richColors />
          </HelpDialogsProvider>
        </UpdaterProvider>
      </ThemeProvider>
    </>
  );
}
