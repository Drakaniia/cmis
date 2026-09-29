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

  // The page owns its own column layout, so the route adds no wrapper: two
  // nested flex shells around it were a chain of levels that did nothing.
  return (
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
  );
}
