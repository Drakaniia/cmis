import { createFileRoute } from "@tanstack/react-router";

import { RequestsPage } from "@/features/requests/components/requests-page";
import { validateRequestsSearch } from "@/features/requests/request-search";

export const Route = createFileRoute("/admin/requests")({
  component: AdminRequestsComponent,
  validateSearch: validateRequestsSearch,
});

function AdminRequestsComponent() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <RequestsPage to="/admin/requests" />
      </div>
    </div>
  );
}
