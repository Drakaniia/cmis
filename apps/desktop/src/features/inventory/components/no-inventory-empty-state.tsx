/**
 * Shared empty state for both the dashboard (`/admin/`) and the inventory page
 * when SQLite has no inventory rows yet (single-user app — everyone is admin).
 */

import { Link } from "@tanstack/react-router";

export function NoInventoryEmptyState({
  description,
}: {
  description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h2 className="font-semibold text-2xl">No inventory yet</h2>
        <p className="mt-2 text-muted-foreground">{description}</p>
        <Link
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground text-sm hover:bg-primary/90"
          to="/admin/data"
        >
          Import CSV
        </Link>
      </div>
    </div>
  );
}
