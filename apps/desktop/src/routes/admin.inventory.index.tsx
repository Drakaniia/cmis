import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/features/inventory/components/inventory-page";

export const Route = createFileRoute("/admin/inventory/")({
  component: AdminInventoryIndexComponent,
});

function AdminInventoryIndexComponent() {
  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <InventoryPage />
      </div>
    </div>
  );
}
