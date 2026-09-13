import { createFileRoute } from "@tanstack/react-router";

import { LowStockPage } from "@/features/inventory/components/low-stock-page";

export const Route = createFileRoute("/admin/inventory/low-stock")({
  component: AdminLowStockComponent,
});

function AdminLowStockComponent() {
  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <LowStockPage />
      </div>
    </div>
  );
}
