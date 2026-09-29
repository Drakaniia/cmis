"use client";

import { Archive, FileSpreadsheet } from "lucide-react";
import { motion } from "motion/react";
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
import {
  buildStockReportPdfPayload,
  STOCK_REPORT_LOCATION,
  stockReportPdfFileName,
} from "../stock-report-pdf";
import {
  buildMonthActivity,
  buildStockSummary,
  formatAsOf,
} from "../stock-report-summary";
import type { StockLevelSort, StockLevelSortKey } from "../types";
import { ReportsFilterBar } from "./reports-filter-bar";
import { StockLevelTable } from "./stock-level-table";
import { StockReportDocument } from "./stock-report-document";
import { StockReportPreviewDialog } from "./stock-report-preview-dialog";
import { SummaryBlock } from "./summary-block";

async function defaultSavePath(fileName: string): Promise<string> {
  try {
    const { documentDir } = await import("@tauri-apps/api/path");
    const dir = await documentDir();
    return dir ? `${dir}/${fileName}` : fileName;
  } catch {
    return fileName;
  }
}

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
 * Stock Report — Apple fluid interface rebuild (§1-§17).
 *
 * One question, answered as a document: what medicines do I have, how much,
 * and how healthy is the shelf? Six analytic widgets live at /admin/analytics.
 *
 * §12 Material: heavy translucent bar over page-canvas; content scrolls under.
 * §15 Typography: display numbers tighten tracking, captions loosen.
 * §4 Springs: critically damped entry (damping 1.0, response 0.35s), interruptible
 * from presentation value (§3). §9 Rubber-band via overscroll-contain.
 * §14 Reduced motion respects prefers-reduced-motion cross-fade fallback.
 * §1 Every control responds on pointer-down, never on release.
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [sort, setSort] = useState<StockLevelSort>({
    dir: "asc",
    key: "status",
  });

  const { data: inventory } = useInventoryItems();
  const { data: activity } = useMonthActivity(month, category);
  const { data: dailyByItem } = useMonthDispensing(month);

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

  /** The search-filtered rows — the set the document, preview and PDF share. */
  const visibleRows = useMemo(
    () => filterStockLevelRows(rows, search),
    [rows, search]
  );
  const groups = useMemo(
    () => groupByCategory(visibleRows, sort),
    [sort, visibleRows]
  );
  const grandTotal = useMemo(() => buildGrandTotal(groups), [groups]);

  /** One document model, three surfaces: preview, print, PDF payload. */
  const documentProps = useMemo(
    () => ({
      activity: activityFigures,
      asOf,
      category,
      generatedAt,
      grandTotal,
      groups,
      location: STOCK_REPORT_LOCATION,
      monthLabel,
      operator: getOperatorName(),
      summary,
    }),
    [
      activityFigures,
      asOf,
      category,
      generatedAt,
      grandTotal,
      groups,
      monthLabel,
      summary,
    ]
  );

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

  const canExport = rows.length > 0 && visibleRows.length > 0;

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

  /** Opens the review step — nothing is written until the operator confirms. */
  const handleSavePdf = useCallback(() => setIsPreviewOpen(true), []);

  const handleConfirmSave = useCallback(async () => {
    if (!isTauriRuntime()) {
      if (typeof window !== "undefined") {
        window.print();
      }
      return;
    }
    setIsSavingPdf(true);
    try {
      const payload = buildStockReportPdfPayload({
        activity: activityFigures,
        asOf,
        category,
        generatedAt,
        grandTotal,
        groups,
        monthLabel,
        operator: getOperatorName(),
        summary,
      });
      const { save } = await import("@tauri-apps/plugin-dialog");
      const chosen = await save({
        defaultPath: await defaultSavePath(stockReportPdfFileName(month)),
        filters: [{ extensions: ["pdf"], name: "PDF Document" }],
      });
      // Cancelling the dialog is not an error: the preview stays open so the
      // operator can try another destination or close it.
      if (!chosen) {
        return;
      }
      const saved = await invoke<string>("generate_stock_report_pdf", {
        path: chosen,
        payload,
      });
      toast.success(`Saved to ${saved}`, {
        action: {
          label: "Reveal",
          onClick: () => revealInFolder(saved),
        },
      });
      setIsPreviewOpen(false);
    } catch (error) {
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
    grandTotal,
    groups,
    month,
    monthLabel,
    summary,
  ]);

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
      {/* Print path (F8/F9): on paper the document is the only thing that
          renders — the interactive screen below carries `print:hidden`. */}
      {rows.length > 0 ? (
        <div className="hidden print:block">
          <StockReportDocument {...documentProps} />
        </div>
      ) : null}

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

      {/* §9 overscroll-contain + §12 fade mask where content meets chrome */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 pb-6 sm:p-4 sm:pb-8 print:hidden">
        {isEmptyDb ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="mx-auto mt-8 max-w-md overflow-hidden rounded-2xl border bg-card p-8 text-center shadow-[0_4px_24px_oklch(0_0_0/0.06)] sm:mt-16"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ damping: 28, stiffness: 320, type: "spring" }}
          >
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Archive aria-hidden className="size-6" />
            </div>
            <h3 className="mt-4 font-semibold text-[17px] tracking-[-0.015em]">
              No medicines recorded yet
            </h3>
            <p className="mx-auto mt-2 max-w-[32ch] text-[13px] text-muted-foreground leading-relaxed">
              The stock report lists every medicine on the shelf. Import your
              inventory or add a medicine to get started.
            </p>
            <a
              className="press-feedback mt-5 inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 font-medium text-background text-sm shadow-sm hover:bg-foreground/90"
              href="/admin/data"
            >
              <FileSpreadsheet aria-hidden className="size-4" />
              Import inventory
            </a>
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1 }}
            className="mx-auto max-w-[1280px] space-y-4"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* §7 enter from where filter sent it — summary springs after bar */}
            <SummaryBlock
              activity={activityFigures}
              asOf={asOf}
              category={category}
              monthLabel={monthLabel}
              summary={summary}
            />

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{
                damping: 30,
                delay: 0.06,
                stiffness: 340,
                type: "spring",
              }}
            >
              <StockLevelTable
                category={category}
                onSearchChange={setSearch}
                onSortChange={handleSortChange}
                rows={rows}
                search={search}
                sort={sort}
              />
            </motion.div>

            {/* Footer meta — §15 caption, §16 wayfinding: where am I, when was this */}
            <motion.p
              animate={{ opacity: 1 }}
              className="pt-2 text-center text-[11px] text-muted-foreground/70 leading-relaxed tracking-[0.02em]"
              initial={{ opacity: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              Generated {generatedAt} · {monthLabel} · {category} · {asOf}
            </motion.p>
          </motion.div>
        )}
      </div>

      <StockReportPreviewDialog
        document={documentProps}
        isSaving={isSavingPdf}
        onConfirmSave={handleConfirmSave}
        onOpenChange={setIsPreviewOpen}
        onPrint={handlePrint}
        open={isPreviewOpen}
      />
    </div>
  );
}
