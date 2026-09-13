import { createFileRoute } from "@tanstack/react-router";

import { ExpiryPage } from "@/features/inventory/components/expiry-page";

export const Route = createFileRoute("/admin/inventory/expiry")({
  component: AdminExpiryComponent,
});

function AdminExpiryComponent() {
  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ExpiryPage />
      </div>
    </div>
  );
}
