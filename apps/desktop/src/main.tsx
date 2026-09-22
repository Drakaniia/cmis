import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import { AppSplash } from "./components/app-splash";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30_000,
    },
  },
});

const router = createRouter({
  context: { queryClient },
  defaultPendingComponent: () => <Loader />,
  defaultPreload: "intent",
  routeTree,
  scrollRestoration: true,
  Wrap({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Hand off from the static #splash shell (index.html) to React's AppSplash.
    // Static shell painted at 0ms; fade it once React has mounted so there is
    // no flash or black frame between the two layers (Apple §7 spatial consistency).
    // The static shell must NEVER be removed before React's splash is opaque,
    // otherwise the Tauri window shows its bare backgroundColor (previously black).
    const staticSplash = document.getElementById("splash");
    let staticTimer: number | undefined;
    if (staticSplash) {
      // Let React's splash paint one frame first, then cross-fade the static one
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          staticSplash.dataset.hide = "true";
          staticTimer = window.setTimeout(() => staticSplash.remove(), 500);
        });
      });
    }

    // Apple §1/§14: splash is the loading screen — it must cover the
    // first-launch DB migrations (beforeLoad) so the window never feels stuck
    // on a black/empty frame. Keep it for at least `minMs` AND until the
    // router has finished its initial pending load.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minMs = prefersReduced ? 650 : 1250;
    const startedAt = Date.now();

    // Poll router pending state; hide only when both min time and load are done.
    // This prevents the black flash on slow first launches (SQL migrations).
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      // TanStack Router exposes status/pending via state; fallback to false if unknown
      const state = (
        router as unknown as {
          state?: { status?: string; isLoading?: boolean };
        }
      ).state;
      const isPending =
        state?.status === "pending" || state?.isLoading === true;
      if (elapsed >= minMs && !isPending) {
        setShowSplash(false);
      } else {
        window.setTimeout(tick, 80);
      }
    };
    const id = window.setTimeout(tick, minMs);

    // Safety: never hold longer than 4s even if pending hangs
    const maxId = window.setTimeout(() => setShowSplash(false), 4000);

    return () => {
      window.clearTimeout(id);
      window.clearTimeout(maxId);
      if (staticTimer) {
        window.clearTimeout(staticTimer);
      }
    };
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <AppSplash visible={showSplash} />
    </>
  );
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
