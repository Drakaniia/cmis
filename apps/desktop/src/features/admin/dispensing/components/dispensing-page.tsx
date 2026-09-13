import { Button } from "@cmis/ui/components/button";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Download } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import type { DispensingSearch } from "../dispensing-search";
import {
  dispensingSearchEquals,
  filtersFromSearch,
  searchFromFilters,
} from "../dispensing-search";
import { downloadDispensingCsv } from "../export-dispensing";
import { useDispensingFilters } from "../hooks/use-dispensing-filters";
import { mockDispensingRows } from "../mock";
import type { DispensingRow } from "../types";
import { DispensingFilterBar } from "./dispensing-filter-bar";
import type { SortDir, SortKey } from "./dispensing-table";
import { DispensingTable } from "./dispensing-table";

/**
 * CMIS-UI-06 §2 — Dispensing Log page.
 *
 * C table (Option C): filterable sortable table with row drill-in modal,
 * export controls, denied row styling, and URL-persisted filters.
 */
export function DispensingPage({
  routePath,
}: {
  routePath: "/admin/dispensing";
}) {
  const navigate = useNavigate();
  const search: DispensingSearch = useSearch({ from: routePath });
  const [rows] = React.useState<DispensingRow[]>(mockDispensingRows);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("dispensedAt");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const [initialFilters] = React.useState(() => filtersFromSearch(search));
  const {
    activeChips,
    branches,
    clearFilters,
    filtered,
    filters,
    medicines,
    removeChip,
    setBranch,
    setMedicine,
    setPreset,
    setRequestor,
    setSearch,
    setStaff,
    setStatus,
    staffList,
  } = useDispensingFilters(rows, initialFilters);

  // Deep-linked filters seed state; later edits flow back to the URL.
  React.useEffect(() => {
    const next = searchFromFilters(filters);
    if (!dispensingSearchEquals(next, search)) {
      navigate({ replace: true, search: next, to: routePath });
    }
  }, [filters, navigate, search, routePath]);

  // Sort the filtered rows
  const sorted = React.useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "dispensedAt":
          cmp =
            new Date(a.dispensedAt).getTime() -
            new Date(b.dispensedAt).getTime();
          break;
        case "medicine":
          cmp = a.medicine.localeCompare(b.medicine);
          break;
        case "batch":
          cmp = a.batch.localeCompare(b.batch);
          break;
        case "qty":
          cmp = a.qty - b.qty;
          break;
        case "requestor":
          cmp = a.requestor.localeCompare(b.requestor);
          break;
        case "staff":
          cmp = a.staff.localeCompare(b.staff);
          break;
      }
      // Secondary sort by medicine asc on date ties
      if (cmp === 0 && sortKey !== "medicine") {
        cmp = a.medicine.localeCompare(b.medicine);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "dispensedAt" ? "desc" : "asc");
    }
  }

  function handleExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadDispensingCsv(sorted, `cmis-dispensing-${stamp}.csv`);
    toast.success(`Exported ${sorted.length} records`, {
      description: `cmis-dispensing-${stamp}.csv`,
    });
  }

  function handleRequest(requestRef: string) {
    navigate({
      search: { q: requestRef },
      to: `${routePath.replace("/dispensing", "/requests")}`,
    });
  }

  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="flex shrink-0 justify-end border-border/50 border-b bg-card px-3 py-2">
        <Button
          className="press-feedback"
          disabled={sorted.length === 0}
          onClick={handleExport}
          size="sm"
          variant="outline"
        >
          <Download aria-hidden className="size-3.5" />
          Export CSV
        </Button>
      </div>

      <DispensingFilterBar
        activeChips={activeChips}
        branches={branches}
        filters={filters}
        medicines={medicines}
        onBranchChange={setBranch}
        onClearFilters={clearFilters}
        onMedicineChange={setMedicine}
        onPresetChange={setPreset}
        onRemoveChip={removeChip}
        onRequestorChange={setRequestor}
        onSearchChange={setSearch}
        onStaffChange={setStaff}
        onStatusChange={setStatus}
        resultCount={sorted.length}
        staffList={staffList}
      />

      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <DispensingTable
          expandedId={expandedId}
          onClearFilters={clearFilters}
          onRequest={handleRequest}
          onSort={handleSort}
          onToggleExpand={(id) =>
            setExpandedId((prev) => (prev === id ? null : id))
          }
          rows={sorted}
          sortDir={sortDir}
          sortKey={sortKey}
          totalUnfiltered={rows.length}
        />
      </div>
    </div>
  );
}
