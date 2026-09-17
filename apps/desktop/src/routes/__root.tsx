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
  ensureStrengthBackfill,
  type StrengthBackfillReport,
} from "@/features/inventory/data/strength-backfill";
import { QuickDeductDialogProvider } from "@/features/inventory/quick-deduct-dialog-context";
import { NewRequestDialogProvider } from "@/features/requests/new-request-dialog-context";
import { UpdaterProvider } from "@/features/updater/use-updater";

import "../index.css";

export interface RouterAppContext {
  queryClient: QueryClient;
  /**
   * The run-once strength split's outcome, or `null` when there is no database
   * behind this window (the browser preview). See `StrengthBackfillNotice`.
   *
   * Optional on the router's context, because it is produced by this route's own
   * `beforeLoad` rather than passed in when the router is created.
   */
  strengthBackfill?: StrengthBackfillReport | null;
}

/**
 * The startup hook the strength spec asks for (§6.3, decision 21): the split
 * runs **before any route renders**, so the first inventory query cannot race it
 * and read a half-migrated table. It is guarded to run exactly once per device
 * by its own `app_meta` marker.
 */
export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: async () => ({
    strengthBackfill: await ensureStrengthBackfill(),
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
            <Toaster position="bottom-right" richColors />
          </HelpDialogsProvider>
        </UpdaterProvider>
      </ThemeProvider>
    </>
  );
}
