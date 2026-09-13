import { ExportCard } from "./export-card";
import { ImportCard } from "./import-card";

/**
 * CMIS-UI-09 §4 — Data Export/Import.
 *
 * Two co-equal tasks sharing one purpose, so they sit side by side at ≥900px
 * and stack below it — tabs would hide the import affordance that the Backup
 * settings card deep-links to (§4.2).
 */
export function DataPage() {
  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto grid w-full max-w-5xl gap-4 px-3 py-4 sm:px-4 min-[900px]:grid-cols-2">
          <ExportCard />
          <ImportCard />
        </div>
      </div>
    </div>
  );
}
