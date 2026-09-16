import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { InventoryPage } from "@/features/inventory/components/inventory-page";
import {
  type InventoryTab,
  inventorySearchFromTab,
  validateInventorySearch,
} from "@/features/inventory/inventory-search";

export const Route = createFileRoute("/admin/inventory/")({
  component: AdminInventoryIndexComponent,
  validateSearch: validateInventorySearch,
});

function AdminInventoryIndexComponent() {
  const { item, tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: InventoryTab = tab ?? "stock";

  const handleTabChange = useCallback(
    (next: InventoryTab) => {
      navigate({ replace: true, search: inventorySearchFromTab(next) });
    },
    [navigate]
  );

  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* `?item=` is the inbound half of the alert pages' "Open in Stock
         * Management" jump (spec §13). */}
        <InventoryPage
          activeTab={activeTab}
          onTabChange={handleTabChange}
          preselectItemId={item ?? null}
        />
      </div>
    </div>
  );
}
