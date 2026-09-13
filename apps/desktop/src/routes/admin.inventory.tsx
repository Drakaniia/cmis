import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/inventory")({
  component: AdminInventoryComponent,
});

function AdminInventoryComponent() {
  return <Outlet />;
}
