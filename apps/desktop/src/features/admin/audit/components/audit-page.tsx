import { Button } from "@cmis/ui/components/button";
import { Download } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { downloadAuditCsv } from "../export-audit";
import { useAuditFilters } from "../hooks/use-audit-filters";
import { mockAuditRows } from "../mock";
import type { AuditRow } from "../types";
import { AuditFilterBar } from "./audit-filter-bar";
import { AuditTable } from "./audit-table";
import { CorrectionModal } from "./correction-modal";

/** The signed-in Admin authoring corrections (§3.4). */
const ACTOR = "A. Lim";

/**
 * CMIS-UI-09 §3 — Audit Logs.
 *
 * The table is the tool: expand a row for the diff, hit the ⋯ for a correction
 * that appends rather than overwrites, and export exactly what's on screen.
 */
export function AuditPage() {
  const [rows, setRows] = React.useState<AuditRow[]>(mockAuditRows);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [correctionRow, setCorrectionRow] = React.useState<AuditRow | null>(
    null
  );

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

  function handleExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadAuditCsv(filtered, `cmis-audit-${stamp}.csv`);
    toast.success(`Exported ${filtered.length} entries`, {
      description: `cmis-audit-${stamp}.csv`,
    });
  }

  function handleViewCorrection(correctionId: string) {
    setSearch(correctionId);
    setExpandedId(correctionId);
  }

  function handleCorrectionSubmit(payload: {
    corrected: Record<string, string>;
    reason: string;
  }) {
    if (!correctionRow) {
      return;
    }
    const at = new Date().toISOString();
    const correction: AuditRow = {
      action: "correction",
      after: payload.corrected,
      at,
      before: { ...correctionRow.after },
      branch: correctionRow.branch,
      correctionOf: correctionRow.id,
      detail: `Correction of [${correctionRow.id}] by ${ACTOR}: ${payload.reason}`,
      id: `AUD-${String(Date.now()).slice(-6)}`,
      reason: payload.reason,
      user: ACTOR,
    };
    setRows((prev) => [
      correction,
      ...prev.map((row) =>
        row.id === correctionRow.id
          ? { ...row, corrected: true, correctionId: correction.id }
          : row
      ),
    ]);
    setExpandedId(correction.id);
    setCorrectionRow(null);
    toast.success("Correction appended", {
      description: `Original ${correctionRow.id} stays intact.`,
    });
  }

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

      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <AuditTable
          expandedId={expandedId}
          onCorrect={setCorrectionRow}
          onRequest={() => {}}
          onToggleExpand={(id) =>
            setExpandedId((prev) => (prev === id ? null : id))
          }
          onViewCorrection={handleViewCorrection}
          rows={filtered}
        />
      </div>

      <CorrectionModal
        onOpenChange={(open) => {
          if (!open) {
            setCorrectionRow(null);
          }
        }}
        onSubmit={handleCorrectionSubmit}
        open={correctionRow !== null}
        row={correctionRow}
      />
    </div>
  );
}
