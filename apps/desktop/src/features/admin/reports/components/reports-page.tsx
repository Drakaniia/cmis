"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { getOperatorName } from "@/features/admin/audit/operator";
import { useInventoryItems } from "@/features/inventory/hooks/use-inventory-items";
import { daysInMonth } from "@/lib/month";
import { isTauriRuntime } from "@/lib/open-external";
import { invoke } from "@/lib/tauri";
import {
  consumeStockReportExportRequest,
  subscribeStockReportExport,
} from "../export-request";
import { useMonthActivity } from "../hooks/use-month-activity";
import { useMonthDispensing } from "../hooks/use-month-dispensing";
import { useReportMonth } from "../hooks/use-report-month";
import { buildStockLevelRows, filterStockLevelRows } from "../stock-level-rows";
import {
  buildExportRows,
  buildExportSummary,
  exportFileName,
} from "../stock-report-export";
import { buildGrandTotal, groupByCategory } from "../stock-report-groups";
import { buildStockReportPdfPayload } from "../stock-report-pdf";
import {
  buildMonthActivity,
  buildStockSummary,
  formatAsOf,
} from "../stock-report-summary";
import type {
  MonthActivity,
  StockLevelSort,
  StockLevelSortKey,
} from "../types";
import { ReportsFilterBar } from "./reports-filter-bar";
import { StockLevelTable } from "./stock-level-table";
import { SummaryBlock } from "./summary-block";

/**
 * The document header (F8). Hidden on screen — the global header map carries the
 * page title (D14) — but printed, so the paper copy names itself, who produced it
 * and which filter was applied.
 */
function PrintHeader({
  activity,
  asOf,
  category,
  generatedAt,
  monthLabel,
}: {
  activity: MonthActivity;
  asOf: string;
  category: string;
  generatedAt: string;
  monthLabel: string;
}) {
  const categoryLabel = category === "All" ? "All categories" : category;
  return (
    <header className="mb-4 hidden print:block">
      <h1 className="font-bold text-xl">Stock Level Report</h1>
      <p className="mt-1 text-xs">
        {monthLabel} · received {activity.received} · dispensed{" "}
        {activity.dispensed} · {categoryLabel} · {asOf} · generated{" "}
        {generatedAt}
      </p>
      <p className="mt-0.5 text-xs">
        Operator: {getOperatorName()} · Location: Local
      </p>
    </header>
  );
}

/** Documents is the export's default home (E20); fall back to a bare name. */
async function defaultSavePath(fileName: string): Promise<string> {
  try {
    const { documentDir } = await import("@tauri-apps/api/path");
    const dir = await documentDir();
    return dir ? `${dir}/${fileName}` : fileName;
  } catch {
    return fileName;
  }
}

/**
 * Opens the native save dialog and asks the Rust writer to persist the bytes.
 * Returns the saved path, or `null` when the operator cancelled (E-F1: a cancel
 * is silent — no toast).
 */
async function saveWorkbookBytes(
  bytes: Uint8Array,
  fileName: string
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const chosen = await save({
    defaultPath: await defaultSavePath(fileName),
    filters: [{ extensions: ["xlsx"], name: "Excel Workbook" }],
  });
  if (!chosen) {
    return null;
  }
  return invoke<string>("save_stock_report_workbook", {
    bytes: Array.from(bytes),
    path: chosen,
  });
}

function revealInFolder(path: string): void {
  import("@tauri-apps/plugin-opener")
    .then(({ revealItemInDir }) => revealItemInDir(path))
    .catch(() => undefined);
}

/**
 * Stock Report (`/admin/reports`) — the stock-level-report-spec rebuild.
 *
 * One question, answered as a document: what medicines do I have, how much, and
 * how healthy is the shelf? The six analytic widgets now live at
 * `/admin/analytics` (D25) and the import/export toolbar is deleted (D28).
 *
 * Stock stays live (D30); the month picker drives only this month's in/out
 * figures. The snapshot shares the inventory hook's cache, so the report and
 * Stock Management can never disagree (SL6).
 *
 * Search and sort live here rather than in the table so the Export button can
 * honour exactly what is on screen (spec stock-report-export E7/E-F2).
 */
export function ReportsPage() {
  const {
    goToCurrentMonth,
    isCurrentMonth,
    month,
    monthLabel,
    stepBack,
    stepForward,
  } = useReportMonth();
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [sort, setSort] = useState<StockLevelSort>({
    dir: "asc",
    key: "status",
  });

  const { data: inventory } = useInventoryItems();
  const { data: activity } = useMonthActivity(month, category);
  const { data: dailyByItem } = useMonthDispensing(month);

  // Stock is a snapshot, not a window: only the category filter applies.
  const items = useMemo(() => {
    const all = inventory ?? [];
    return category === "All"
      ? all
      : all.filter((item) => item.category === category);
  }, [category, inventory]);

  const rows = useMemo(() => buildStockLevelRows(items), [items]);
  const summary = useMemo(() => buildStockSummary(items), [items]);
  const activityFigures = useMemo(
    () =>
      buildMonthActivity(
        activity ?? { dispensed: 0, hasActivity: false, received: 0 }
      ),
    [activity]
  );
  const asOf = useMemo(() => formatAsOf(new Date()), []);
  const generatedAt = useMemo(() => new Date().toLocaleString(), []);

  const handlePrint = useCallback(() => {
    if (typeof window !== "undefined") {
      window.print();
    }
  }, []);

  const handleSortChange = useCallback((key: StockLevelSortKey) => {
    setSort((previous) =>
      previous.key === key
        ? { dir: previous.dir === "asc" ? "desc" : "asc", key }
        : { dir: "asc", key }
    );
  }, []);

  const visibleCount = useMemo(
    () => filterStockLevelRows(rows, search).length,
    [rows, search]
  );
  // E18: nothing to export when the filtered/search-narrowed set is empty,
  // mirroring Print's rule widened to include the search box.
  const canExport = rows.length > 0 && visibleCount > 0;

  const handleExport = useCallback(async () => {
    try {
      const days = daysInMonth(month);
      const exportRows = buildExportRows({
        dailyByItem: dailyByItem ?? new Map(),
        items,
        rows,
        search,
        sort,
      });
      const { buildInventoryWorkbook } = await import(
        "@/features/inventory/import/export-xlsx"
      );
      const { write, writeFile } = await import("xlsx");
      const fileName = exportFileName(month);
      const workbook = buildInventoryWorkbook(exportRows, {
        daysInMonth: days,
        extraSheets: [
          buildExportSummary({
            activity: activityFigures,
            asOf,
            category,
            monthLabel,
            operator: getOperatorName(),
            search,
            summary,
          }),
        ],
      });

      if (!isTauriRuntime()) {
        // Browser preview has no native dialog: hand the same workbook to the
        // browser's download path (the Data page's card does the same).
        writeFile(workbook, fileName);
        toast.success(`Export ready — ${fileName}`);
        return;
      }

      const bytes = write(workbook, {
        bookType: "xlsx",
        type: "array",
      }) as Uint8Array;
      const saved = await saveWorkbookBytes(bytes, fileName);
      if (saved === null) {
        return;
      }
      toast.success(`Saved to ${saved}`, {
        action: {
          label: "Reveal",
          onClick: () => revealInFolder(saved),
        },
      });
    } catch (error) {
      // A real reason, never a success placeholder (E-F1).
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not export the stock report."
      );
    }
  }, [
    activityFigures,
    asOf,
    category,
    dailyByItem,
    items,
    month,
    monthLabel,
    rows,
    search,
    sort,
    summary,
  ]);

  // Save as PDF (Phase 2, stock-level-report spec F7/F10): the Rust command
  // draws A4 landscape from the already-computed report and auto-saves to
  // Documents — no dialog, no audit row. The document honours the category
  // filter (D20); search/sort narrow it the same way the export does.
  const handleSavePdf = useCallback(async () => {
    if (!isTauriRuntime()) {
      // Browser preview has no Rust command: the system dialog's own
      // "Save as PDF" is the equivalent path.
      if (typeof window !== "undefined") {
        window.print();
      }
      return;
    }
    setIsSavingPdf(true);
    try {
      const groups = groupByCategory(filterStockLevelRows(rows, search), sort);
      const payload = buildStockReportPdfPayload({
        activity: activityFigures,
        asOf,
        category,
        generatedAt,
        grandTotal: buildGrandTotal(groups),
        groups,
        month,
        monthLabel,
        operator: getOperatorName(),
        summary,
      });
      const saved = await invoke<string>("generate_stock_report_pdf", {
        payload,
      });
      toast.success(`Saved to ${saved}`, {
        action: {
          label: "Reveal",
          onClick: () => revealInFolder(saved),
        },
      });
    } catch (error) {
      // A real reason, never a success placeholder (the SL3 anti-pattern).
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the PDF report."
      );
    } finally {
      setIsSavingPdf(false);
    }
  }, [
    activityFigures,
    asOf,
    category,
    generatedAt,
    month,
    monthLabel,
    rows,
    search,
    sort,
    summary,
  ]);

  // File → Export Stock Report hands off through `export-request`; consume a
  // request queued while navigating here, and react while already open.
  const exportRef = useRef(handleExport);
  useEffect(() => {
    exportRef.current = handleExport;
  }, [handleExport]);
  useEffect(() => {
    const run = () => {
      if (consumeStockReportExportRequest()) {
        exportRef.current().catch(() => undefined);
      }
    };
    const unsubscribe = subscribeStockReportExport(run);
    run();
    return unsubscribe;
  }, []);

  const isEmptyDb = inventory !== undefined && inventory.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
      <ReportsFilterBar
        canExport={canExport}
        canPrint={rows.length > 0}
        canSavePdf={rows.length > 0}
        category={category}
        isCurrentMonth={isCurrentMonth}
        isSavingPdf={isSavingPdf}
        monthLabel={monthLabel}
        onCategoryChange={setCategory}
        onCurrentMonth={goToCurrentMonth}
        onExport={handleExport}
        onPrint={handlePrint}
        onSavePdf={handleSavePdf}
        onStepBack={stepBack}
        onStepForward={stepForward}
      />

      <div className="min-h-0 flex-1 overflow-auto p-3 pb-6 sm:p-4 sm:pb-8 print:overflow-visible print:p-0">
        {isEmptyDb ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <h3 className="font-semibold text-lg">No medicines recorded yet</h3>
            <p className="mt-2 text-muted-foreground text-sm">
              The stock report lists every medicine on the shelf. Import your
              inventory or add a medicine to get started.
            </p>
            <a
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
              href="/admin/data"
            >
              Import inventory
            </a>
          </div>
        ) : (
          <div className="mx-auto max-w-[1280px] space-y-3 sm:space-y-4">
            <PrintHeader
              activity={activityFigures}
              asOf={asOf}
              category={category}
              generatedAt={generatedAt}
              monthLabel={monthLabel}
            />

            <SummaryBlock
              activity={activityFigures}
              asOf={asOf}
              category={category}
              monthLabel={monthLabel}
              summary={summary}
            />

            <StockLevelTable
              category={category}
              onSearchChange={setSearch}
              onSortChange={handleSortChange}
              rows={rows}
              search={search}
              sort={sort}
            />

            {/* Footer meta — provenance without clutter. */}
            <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
              Generated {generatedAt} · {monthLabel} · {category} · {asOf}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
