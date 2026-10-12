/**
 * CMIS Cloud Sync — the configuration surface.
 *
 * Rendered in two places on purpose: as the Settings → Sync tab, and inside the
 * dialog the title-bar indicator opens. One component, so the chrome shortcut
 * cannot drift from the settings page.
 *
 * The endpoint is edited locally and saved on submit: a half-typed URL is not a
 * configuration, and saving every keystroke would fire a request per character.
 */

import { Button } from "@cmis/ui/components/button";
import { Input } from "@cmis/ui/components/input";
import { cn } from "@cmis/ui/lib/utils";
import { RefreshCw, Save, Upload } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmModal } from "@/features/admin/components/confirm-modal";
import { SettingsCard } from "@/features/admin/settings/components/settings-card";
import { getDb } from "@/lib/db";
import { migrateToCloud, readMigrationMarker } from "@/lib/sync/migration";
import { ensureDeviceId } from "@/lib/sync/offline-queue";
import { countAllRows, sumAllQty } from "@/lib/sync/scan";
import { explainNoDownload } from "@/lib/sync/strategy";
import { fetchSyncStatus } from "@/lib/sync/sync-client";
import { DEFAULT_SYNC_INTERVAL_MS } from "@/lib/sync/sync-settings";
import type { SyncDatabase, SyncTableName } from "@/lib/sync/types";
import { useSync } from "@/lib/sync/use-sync";
import { SyncButtons } from "./sync-button";

const INTERVAL_CHOICES = [
  { label: "Every 15 seconds", value: 15_000 },
  { label: "Every 30 seconds", value: DEFAULT_SYNC_INTERVAL_MS },
  { label: "Every minute", value: 60_000 },
  { label: "Every 5 minutes", value: 300_000 },
] as const;

function formatWhen(iso: string | null): string {
  if (!iso) {
    return "Never";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SyncSettingsPanel({ className }: { className?: string }) {
  const sync = useSync();
  const [endpoint, setEndpoint] = useState(sync.endpoint);
  const [token, setToken] = useState(sync.token);
  const [busy, setBusy] = useState(false);
  const [migratedAt, setMigratedAt] = useState<string | null>(null);
  const [adopted, setAdopted] = useState({
    endpoint: sync.endpoint,
    token: sync.token,
  });
  const [localCounts, setLocalCounts] = useState<
    Partial<Record<SyncTableName, number>>
  >({});
  const [localTotals, setLocalTotals] = useState<
    Partial<Record<SyncTableName, number>>
  >({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCounts, setConfirmCounts] = useState<{
    cloud: number | null;
    local: number;
  }>({ cloud: null, local: 0 });

  // Adopt the stored values in the same render they arrive, not in an effect
  // after it: until they do, the field is disabled, and an effect would leave a
  // commit where it is already enabled but still shows the previous (empty)
  // value — a window a fast save could capture. Typing changes the local state
  // without changing `sync`, so an in-progress edit is never overwritten.
  if (adopted.endpoint !== sync.endpoint || adopted.token !== sync.token) {
    setAdopted({ endpoint: sync.endpoint, token: sync.token });
    setEndpoint(sync.endpoint);
    setToken(sync.token);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = (await getDb()) as unknown as SyncDatabase;
        const marker = await readMigrationMarker(db);
        if (!cancelled) {
          setMigratedAt(marker);
        }
      } catch {
        // No database in this window (preview) — the row stays "Not yet".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The local half of the side-by-side view (§6.6). Re-read after every run
  // that could have changed a table, so "0 here · 85 in the cloud" is current.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the run counters are the re-read trigger, not values the effect body reads
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = (await getDb()) as unknown as SyncDatabase;
        const [counts, totals] = await Promise.all([
          countAllRows(db),
          sumAllQty(db),
        ]);
        if (!cancelled) {
          setLocalCounts(counts);
          setLocalTotals(totals);
        }
      } catch {
        // No database in this window (preview) — the local column stays empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sync.pending, sync.lastResult]);

  const dirty = endpoint !== sync.endpoint || token !== sync.token;

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await sync.update({
        enabled: endpoint.trim() !== "",
        endpoint,
        token,
      });
      toast.success(
        endpoint.trim() === "" ? "Cloud sync disabled" : "Sync settings saved",
        { id: "sync-settings" }
      );
    } finally {
      setBusy(false);
    }
  }, [endpoint, sync, token]);

  const uploadExisting = useCallback(async () => {
    if (sync.endpoint === "") {
      toast.error("Set an endpoint first");
      return;
    }
    setBusy(true);
    try {
      const db = (await getDb()) as unknown as SyncDatabase;
      const deviceId = await ensureDeviceId(db);
      let sent = 0;
      const result = await migrateToCloud({
        batchSize: 500,
        db,
        deviceId,
        endpoint: sync.endpoint,
        onProgress: (progress) => {
          sent += progress.rows;
        },
        token: sync.token || undefined,
      });
      setMigratedAt(result.migratedAt);
      sync.refreshServerStatus().catch(() => undefined);
      toast.success("Existing data uploaded", {
        description: `${result.total} rows (${sent} in this run), ${result.conflicts} conflicts resolved`,
        id: "sync-migration",
      });
    } catch (error) {
      toast.error("Upload failed", {
        description: error instanceof Error ? error.message : String(error),
        id: "sync-migration",
      });
    } finally {
      setBusy(false);
    }
  }, [sync.endpoint, sync.refreshServerStatus, sync.token]);

  const onSave = useCallback(() => {
    save().catch(() => undefined);
  }, [save]);

  const onEndpointChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setEndpoint(event.target.value),
    []
  );

  const onTokenChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setToken(event.target.value),
    []
  );

  /**
   * Enabling is a data-moving action when this device already holds records,
   * so it is confirmed first (§6.3, P2). Turning sync off never prompts.
   */
  const onEnabledChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { checked } = event.target;
      if (!checked) {
        sync.update({ enabled: false }).catch(() => undefined);
        return;
      }
      setBusy(true);
      (async () => {
        try {
          const db = (await getDb()) as unknown as SyncDatabase;
          const counts = await countAllRows(db);
          const localCount = Object.values(counts).reduce<number>(
            (sum, count) => sum + (count ?? 0),
            0
          );
          setLocalCounts(counts);
          if (localCount === 0) {
            // Nothing to warn about: an empty device cannot be overwritten.
            await sync.update({ enabled: true, endpoint, token });
            return;
          }
          // The cloud count is a courtesy (D18); if the server cannot answer,
          // the modal still shows the local count and says so.
          let cloud: number | null = null;
          try {
            const status = await fetchSyncStatus({
              endpoint,
              fetchImpl: globalThis.fetch.bind(globalThis),
              token: token || undefined,
            });
            cloud = Object.values(status.counts).reduce<number>(
              (sum, count) => sum + (count ?? 0),
              0
            );
          } catch {
            cloud = null;
          }
          setConfirmCounts({ cloud, local: localCount });
          setConfirmOpen(true);
        } catch {
          // No database (preview): fall through to enabling directly.
          await sync.update({ enabled: true, endpoint, token });
        } finally {
          setBusy(false);
        }
      })();
    },
    [endpoint, sync, token]
  );

  const confirmEnable = useCallback(() => {
    setConfirmOpen(false);
    sync.update({ enabled: true, endpoint, token }).catch(() => undefined);
  }, [endpoint, sync, token]);

  const onRestoreBackup = useCallback(() => {
    sync.restoreBackup().catch(() => undefined);
  }, [sync]);

  const onIntervalChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      sync
        .update({ intervalMs: Number(event.target.value) })
        .catch(() => undefined);
    },
    [sync]
  );

  const onCheckServer = useCallback(() => {
    sync.refreshServerStatus().catch(() => undefined);
  }, [sync]);

  const onUploadExisting = useCallback(() => {
    uploadExisting().catch(() => undefined);
  }, [uploadExisting]);

  const serverCounts = sync.serverStatus?.counts ?? {};
  const serverTotals = sync.serverStatus?.totals ?? {};
  const totalOf = (counts: Partial<Record<SyncTableName, number>>) =>
    Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0);
  const lastRun = sync.lastResult;
  const localTotalRows = totalOf(localCounts);
  const cloudTotalRows = totalOf(serverCounts);
  const noDownloadReason = lastRun
    ? explainNoDownload({
        applied: lastRun.appliedRows + lastRun.appliedDeletes,
        cloudTotal: cloudTotalRows,
        localTotal: localTotalRows,
        ranPull: true,
        skipped: lastRun.skipped,
      })
    : null;

  return (
    <>
      <div className={cn("space-y-4", className)}>
        <SettingsCard
          actions={
            <div className="flex items-center gap-2">
              <Button
                className="press-feedback"
                disabled={busy || !dirty}
                onClick={onSave}
                size="sm"
                variant="confirm"
              >
                <Save aria-hidden className="size-3.5" />
                Save
              </Button>
            </div>
          }
          description="Point this device at the Cloudflare Worker that serves the sync API. Sync is off until an endpoint is set, so a clinic that has not deployed one is never asked to authenticate against a server that does not exist."
          title="Connection"
        >
          <div className="space-y-3">
            <label className="block space-y-1" htmlFor="sync-endpoint">
              <span className="font-medium text-foreground text-sm">
                Worker endpoint
              </span>
              <Input
                autoComplete="off"
                disabled={!sync.resolved}
                id="sync-endpoint"
                onChange={onEndpointChange}
                placeholder="https://cmis-sync.<account>.workers.dev"
                spellCheck={false}
                value={endpoint}
              />
            </label>
            {sync.resolved ? null : (
              <p className="text-muted-foreground text-xs">
                Reading the saved sync settings…
              </p>
            )}
            <label className="block space-y-1" htmlFor="sync-token">
              <span className="font-medium text-foreground text-sm">
                Shared token{" "}
                <span className="text-muted-foreground">(optional)</span>
              </span>
              <Input
                autoComplete="off"
                id="sync-token"
                onChange={onTokenChange}
                placeholder="Must match the Worker's SYNC_TOKEN secret"
                spellCheck={false}
                type="password"
                value={token}
              />
            </label>
            <label className="flex items-center gap-3 text-foreground text-sm">
              <input
                checked={sync.enabled}
                className="accent-primary"
                disabled={endpoint.trim() === ""}
                onChange={onEnabledChange}
                type="checkbox"
              />
              Sync automatically
            </label>
            <label className="block space-y-1" htmlFor="sync-interval">
              <span className="font-medium text-foreground text-sm">
                Automatic interval
              </span>
              <select
                className="h-8 w-full border border-input bg-transparent px-2 text-xs dark:bg-input/30"
                id="sync-interval"
                onChange={onIntervalChange}
                value={sync.intervalMs}
              >
                {INTERVAL_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-muted-foreground text-xs">
              Sync also runs when the app regains focus, shortly after a change,
              and whenever you press Sync now. Push sends only, Pull downloads
              only (local edits stay queued). Offline changes are queued locally
              and sent on the next successful run.
            </p>
          </div>
        </SettingsCard>

        <SettingsCard
          actions={
            <div className="flex items-center gap-2">
              <SyncButtons />
              <Button
                className="press-feedback"
                onClick={onCheckServer}
                size="sm"
                variant="outline"
              >
                <RefreshCw aria-hidden className="size-3.5" />
                Check server
              </Button>
            </div>
          }
          description="The first number is this device's local SQLite; the second is the cloud (the Worker's own database). When they disagree the row is highlighted. Units are summed qty for inventory tables."
          title="Status"
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-caption text-muted-foreground">State</dt>
              <dd className="font-medium text-foreground text-sm capitalize">
                {sync.phase}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">
                Last synced
              </dt>
              <dd className="font-medium text-foreground text-sm">
                {formatWhen(sync.lastSyncedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">
                Waiting to be sent
              </dt>
              <dd className="font-medium text-foreground text-sm">
                {sync.pending} change{sync.pending === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">
                Existing data uploaded
              </dt>
              <dd className="font-medium text-foreground text-sm">
                {formatWhen(migratedAt)}
              </dd>
            </div>
            {sync.lastError ? (
              <div className="sm:col-span-2">
                <dt className="text-caption text-destructive">Last error</dt>
                <dd className="text-destructive text-sm">{sync.lastError}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
            <p className="font-medium text-foreground text-xs">
              This device vs the cloud
            </p>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {sync.tables.map((table) => {
                const localCount = localCounts[table as SyncTableName] ?? 0;
                const cloudCount = serverCounts[table as SyncTableName] ?? 0;
                const localUnit = localTotals[table as SyncTableName];
                const cloudUnit = serverTotals[table as SyncTableName];
                const mismatch =
                  Object.keys(serverCounts).length > 0 &&
                  localCount !== cloudCount;
                return (
                  <li
                    className={cn(
                      "flex items-center justify-between text-xs",
                      mismatch ? "text-destructive" : "text-muted-foreground"
                    )}
                    key={table}
                  >
                    <span className="font-mono">{table}</span>
                    <span>
                      {localCount} here
                      {typeof localUnit === "number"
                        ? ` (${localUnit} units)`
                        : ""}
                      {" · "}
                      {cloudCount} in cloud
                      {typeof cloudUnit === "number"
                        ? ` (${cloudUnit} units)`
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            {Object.keys(serverCounts).length > 0 &&
            localTotalRows !== cloudTotalRows ? (
              <p className="mt-1 text-destructive text-xs">
                This device holds {localTotalRows} rows; the cloud holds{" "}
                {cloudTotalRows}.
              </p>
            ) : null}
          </div>

          {lastRun ? (
            <div className="mt-3 rounded-md border border-border/60 px-3 py-2">
              <p className="font-medium text-foreground text-xs">Last run</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Pushed {lastRun.pushedRows + lastRun.pushedDeletes} · applied{" "}
                {lastRun.appliedRows + lastRun.appliedDeletes} · skipped{" "}
                {lastRun.skipped} · conflicts {lastRun.conflicts.length}
              </p>
              {noDownloadReason ? (
                <p className="mt-1 text-destructive text-xs">
                  {noDownloadReason}
                </p>
              ) : null}
            </div>
          ) : null}

          {sync.backup ? (
            <div className="mt-3 flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <p className="text-muted-foreground text-xs">
                Backup from {formatWhen(sync.backup.at)} · {sync.backup.rows}{" "}
                rows
              </p>
              <Button
                className="press-feedback"
                onClick={onRestoreBackup}
                size="sm"
                variant="outline"
              >
                Restore this backup
              </Button>
            </div>
          ) : null}
        </SettingsCard>

        <SettingsCard
          actions={
            <Button
              className="press-feedback"
              disabled={busy || sync.endpoint === ""}
              onClick={onUploadExisting}
              size="sm"
              variant="outline"
            >
              <Upload aria-hidden className="size-3.5" />
              Send existing data
            </Button>
          }
          description="The one-time migration: uploads everything this device already has, in batches, and then marks the cursors so the next automatic sync does not send it again. Safe to run more than once — the server applies it with the same last-write-wins rules as any other push."
          title="Existing data"
        >
          <p className="text-muted-foreground text-xs">
            Run this once per device after pointing it at a new Worker. Data
            created by other devices is pulled in by the next sync, not by this
            button.
          </p>
        </SettingsCard>
      </div>

      <ConfirmModal
        confirmLabel="Enable sync"
        description={`Records already exist on this device. Are you sure you want to sync? This device holds ${confirmCounts.local} record${confirmCounts.local === 1 ? "" : "s"} · the cloud ${
          confirmCounts.cloud === null
            ? "count is unavailable (server unreachable)"
            : `holds ${confirmCounts.cloud}`
        }.`}
        onConfirm={confirmEnable}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Enable cloud sync?"
      />
    </>
  );
}
