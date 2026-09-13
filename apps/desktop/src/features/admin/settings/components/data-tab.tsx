import { ExportCard } from "../../data/components/export-card";
import { ImportCard } from "../../data/components/import-card";

/**
 * Settings tab — Data Export/Import.
 * Reuses the existing ExportCard and ImportCard components.
 */
export function DataTab() {
  return (
    <div className="grid gap-4 min-[600px]:grid-cols-2">
      <ExportCard />
      <ImportCard />
    </div>
  );
}
