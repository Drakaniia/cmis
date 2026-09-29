import { createFileRoute } from "@tanstack/react-router";

import { LowStockPage } from "@/features/inventory/components/low-stock-page";
import { validateStockDetailSearch } from "@/features/inventory/stock-detail-search";

export const Route = createFileRoute("/admin/inventory/low-stock")({
  component: AdminLowStockComponent,
  validateSearch: validateStockDetailSearch,
});

function AdminLowStockComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // The page owns its own column layout, so the route adds no wrapper: two
  // nested flex shells around it were a chain of levels that did nothing.
  return (
    <LowStockPage
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
