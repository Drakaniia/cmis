import { createFileRoute } from "@tanstack/react-router";

import { AddInventoryPage } from "@/features/inventory/components/add-inventory/add-inventory-page";

export const Route = createFileRoute("/admin/inventory/add")({
  component: AdminInventoryAddComponent,
});

function AdminInventoryAddComponent() {
  return <AddInventoryPage />;
}
