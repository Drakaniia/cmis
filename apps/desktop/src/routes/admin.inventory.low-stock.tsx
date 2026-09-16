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

  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
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
      </div>
    </div>
  );
}
