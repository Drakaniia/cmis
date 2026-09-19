import { createFileRoute } from "@tanstack/react-router";

import { ExpiryPage } from "@/features/inventory/components/expiry-page";
import { validateStockDetailSearch } from "@/features/inventory/stock-detail-search";

export const Route = createFileRoute("/admin/inventory/expiry")({
  component: AdminExpiryComponent,
  validateSearch: validateStockDetailSearch,
});

function AdminExpiryComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ExpiryPage
          deepLink={search}
          onDeepLinkChange={(next) => navigate({ replace: true, search: next })}
          onOpenItemInStockManagement={(item) =>
            navigate({
              search: { item },
              to: "/admin/inventory",
            })
          }
        />
      </div>
    </div>
  );
}
