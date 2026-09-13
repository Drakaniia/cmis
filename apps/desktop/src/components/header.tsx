import { Link, useRouterState } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { CommandPalette } from "./command-palette";
import { ThemeSwitcher } from "./mode-toggle";

const trailingSlashes = /\/+$/;

function resolveTitle(pathname: string): string {
  const normalized = pathname.replace(trailingSlashes, "") || "/";
  if (normalized === "/admin") {
    return "System overview";
  }
  if (normalized.startsWith("/admin/inventory/expiry")) {
    return "Expiry Alerts";
  }
  if (normalized.startsWith("/admin/inventory/low-stock")) {
    return "Low-Stock Alerts";
  }
  if (normalized.startsWith("/admin/inventory")) {
    return "Stock Management";
  }
  if (normalized.startsWith("/admin/requests")) {
    return "Request Queue";
  }
  if (normalized.startsWith("/admin/dispensing")) {
    return "Dispensing Log";
  }
  if (normalized.startsWith("/admin/reports")) {
    return "Reports & Analytics";
  }
  if (normalized.startsWith("/admin/audit")) {
    return "Audit Logs";
  }
  if (normalized.startsWith("/admin/health")) {
    return "System Health";
  }
  if (normalized.startsWith("/admin/data")) {
    return "Data Export / Import";
  }
  if (normalized.startsWith("/admin/users")) {
    return "User Management";
  }
  if (normalized.startsWith("/admin/settings")) {
    return "System Settings";
  }
  if (normalized === "/" || normalized === "") {
    return "System overview";
  }
  return "System overview";
}

/**
 * CMIS-UI global header bar — single source of truth for page title + search.
 * Renders across every page via __root.tsx.
 * Title is derived from the active route; search is compact and right-aligned.
 */
export default function Header() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const title = resolveTitle(pathname);

  return (
    <header
      className="surface-frosted flex shrink-0 items-center justify-between gap-3 border-border/50 border-b px-3 py-2 sm:px-4"
      style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}
    >
      {/* Left — dynamic page title */}
      <div className="min-w-0">
        <h1 className="truncate font-bold text-foreground text-heading tracking-tight">
          {title}
        </h1>
      </div>

      {/* Right — compact search + actions */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="w-[180px] sm:w-[220px] lg:w-[260px]">
          <CommandPalette />
        </div>
        <ThemeSwitcher />
        <Link
          aria-label="Settings"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          to="/admin/settings"
        >
          <Settings className="size-4" />
        </Link>
      </div>
    </header>
  );
}
