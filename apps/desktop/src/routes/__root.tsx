import { Toaster } from "@cmis/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { TitleBar } from "@/components/titlebar";
import { DocsHeader } from "@/features/help/components/docs/docs-header";
import { HelpDialogsProvider } from "@/features/help/help-dialogs-context";
import { useFirstRunHint } from "@/features/help/use-first-run-hint";
import { UpdaterProvider } from "@/features/updater/use-updater";

import "../index.css";

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
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
            <Toaster position="bottom-right" richColors />
          </HelpDialogsProvider>
        </UpdaterProvider>
      </ThemeProvider>
    </>
  );
}
