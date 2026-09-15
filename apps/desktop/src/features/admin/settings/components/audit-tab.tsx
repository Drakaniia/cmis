import { Button } from "@cmis/ui/components/button";
import { Download } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AuditFilterBar } from "../../audit/components/audit-filter-bar";
import { AuditTable } from "../../audit/components/audit-table";
import { CorrectionModal } from "../../audit/components/correction-modal";
import { downloadAuditCsv } from "../../audit/export-audit";
import { useAuditFilters } from "../../audit/hooks/use-audit-filters";
import type { AuditRow } from "../../audit/types";
import { SettingsCard } from "./settings-card";

/** The signed-in Admin authoring corrections (§3.4). */
const ACTOR = "A. Lim";

function noop() {
  // no-op: request flow is not wired up in the settings tab yet
}

/**
 * Settings tab — Audit Logs.
 * Simplified version that doesn't depend on router search params.
 */
export function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([] as AuditRow[]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [correctionRow, setCorrectionRow] = useState<AuditRow | null>(null);

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

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleCorrectionDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setCorrectionRow(null);
    }
  }, []);

  const handleCorrectionSubmit = useCallback(
    (payload: { corrected: Record<string, string>; reason: string }) => {
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
    },
    [correctionRow]
  );

  return (
    <div className="space-y-4">
      <SettingsCard
        actions={
          <Button
            className="press-feedback"
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden className="size-3.5" />
            Export CSV
          </Button>
        }
        description="Append-only activity history — every stock change, request transition, settings tweak and sync conflict."
        title="Audit Logs"
      >
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

        <div className="min-h-0 overflow-auto">
          <AuditTable
            expandedId={expandedId}
            onCorrect={setCorrectionRow}
            onRequest={noop}
            onToggleExpand={handleToggleExpand}
            onViewCorrection={handleViewCorrection}
            rows={filtered}
          />
        </div>
      </SettingsCard>

      <CorrectionModal
        onOpenChange={handleCorrectionDialogChange}
        onSubmit={handleCorrectionSubmit}
        open={correctionRow !== null}
        row={correctionRow}
      />
    </div>
  );
}
