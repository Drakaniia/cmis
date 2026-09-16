import { Button } from "@cmis/ui/components/button";
import { Download } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { downloadAuditCsv } from "../export-audit";
import { useAuditCorrection } from "../hooks/use-audit-correction";
import { useAuditFilters } from "../hooks/use-audit-filters";
import { useAuditLog } from "../hooks/use-audit-log";
import { AuditFilterBar } from "./audit-filter-bar";
import { AuditTable } from "./audit-table";
import { CorrectionModal } from "./correction-modal";

/**
 * CMIS-UI-09 §3 — Audit Logs.
 *
 * Rows are read from the append-only `audit_log`; a correction is *written*
 * rather than appended to local state, so it survives a restart and shows up in
 * the export like every other entry.
 */
export function AuditPage() {
  const { data } = useAuditLog();
  const rows = data ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const {
    correctionRow,
    handleOpenChange,
    open: correctionOpen,
    setCorrectionRow,
    submit: submitCorrection,
  } = useAuditCorrection({ onWritten: setExpandedId });

  const {
    activeChips,
    clearFilters,
    filtered,
    filters,
    removeChip,
    setPreset,
    setSearch,
    setUser,
    toggleAction,
    users,
  } = useAuditFilters(rows);

  const handleExport = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadAuditCsv(filtered, `cmis-audit-${stamp}.csv`);
    toast.success(`Exported ${filtered.length} entries`, {
      description: `cmis-audit-${stamp}.csv`,
    });
  }, [filtered]);

  const handleViewCorrection = useCallback(
    (correctionId: string) => {
      setSearch(correctionId);
      setExpandedId(correctionId);
    },
    [setSearch]
  );

  const handleNoopRequest = useCallback(() => {
    /* noop */
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="flex h-[calc(100svh-48px)] flex-col overflow-hidden">
      <div className="flex shrink-0 justify-end border-border/50 border-b bg-card px-3 py-2">
        <Button
          className="press-feedback"
          onClick={handleExport}
          size="sm"
          variant="outline"
        >
          <Download aria-hidden className="size-3.5" />
          Export CSV
        </Button>
      </div>

      <AuditFilterBar
        activeChips={activeChips}
        filters={filters}
        onClearFilters={clearFilters}
        onPresetChange={setPreset}
        onRemoveChip={removeChip}
        onSearchChange={setSearch}
        onToggleAction={toggleAction}
        onUserChange={setUser}
        resultCount={filtered.length}
        users={users}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <AuditTable
          expandedId={expandedId}
          onCorrect={setCorrectionRow}
          onRequest={handleNoopRequest}
          onToggleExpand={handleToggleExpand}
          onViewCorrection={handleViewCorrection}
          rows={filtered}
        />
      </div>

      <CorrectionModal
        onOpenChange={handleOpenChange}
        onSubmit={submitCorrection}
        open={correctionOpen}
        row={correctionRow}
      />
    </div>
  );
}
