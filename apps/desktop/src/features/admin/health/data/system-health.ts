import type { DbLike } from "@/features/inventory/creation/db-like";
import type { HealthCardData, PendingSync } from "../types";

/**
 * CMIS-UI-09 §5 — the read path behind the System Health cards.
 *
 * The cards used to render an empty grid: `useHealth()` defaults to `[]`, and
 * nothing ever supplied a starting set, so the page and its Settings tab showed
 * nothing at all. This builds them from what the database actually reports —
 * file size, row counts, snapshot tables, the last seven days of activity —
 * rather than inventing numbers, so each metric is a fact the operator can act
 * on.
 *
 * Kept framework-free (it takes a `DbLike`) so the queries stay testable, in the
 * same shape every other data module in the app uses.
 */

const DAY_MS = 86_400_000;
const TREND_DAYS = 7;
const STORAGE_CAPACITY_BYTES = 1_073_741_824; // 1 GB — the local budget the card reports against

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function dayKey(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** Daily totals aligned to the last seven calendar days, oldest first. */
function toTrend(rows: { date: string; total: number }[]): number[] {
  const byDate = new Map(rows.map((row) => [row.date.slice(0, 10), row.total]));
  const trend: number[] = [];
  for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
    trend.push(byDate.get(dayKey(offset)) ?? 0);
  }
  return trend;
}

export interface SystemHealth {
  cards: HealthCardData[];
  pendingSyncs: PendingSync[];
}

interface CountRow {
  audit: number;
  batches: number;
  items: number;
  trash: number;
}

export async function loadSystemHealth(db: DbLike): Promise<SystemHealth> {
  const since = `${dayKey(TREND_DAYS - 1)}T00:00:00.000Z`;

  const [
    counts,
    pageCount,
    pageSize,
    backupRows,
    expiredRows,
    dispensing,
    audit,
    submissions,
  ] = await Promise.all([
    db.select<
      CountRow[]
    >(`SELECT (SELECT COUNT(*) FROM inventory_items) AS items,
                (SELECT COUNT(*) FROM inventory_batches) AS batches,
                (SELECT COUNT(*) FROM audit_log) AS audit,
                (SELECT COUNT(*) FROM trash_records) AS trash`),
    db.select<{ page_count: number }[]>("PRAGMA page_count"),
    db.select<{ page_size: number }[]>("PRAGMA page_size"),
    db.select<{ name: string }[]>(
      `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name LIKE '%\\_backup\\_%' ESCAPE '\\'
          ORDER BY name DESC`
    ),
    db.select<{ c: number }[]>(
      `SELECT COUNT(*) AS c FROM inventory_batches
          WHERE expiry IS NOT NULL AND expiry != ''
            AND julianday(expiry) - julianday('now') < 0`
    ),
    db.select<{ date: string; total: number }[]>(
      `SELECT date, SUM(qty) AS total FROM dispensing_events
          WHERE date >= ? GROUP BY date`,
      [dayKey(TREND_DAYS - 1)]
    ),
    db.select<{ date: string; total: number }[]>(
      `SELECT substr(at, 1, 10) AS date, COUNT(*) AS total FROM audit_log
          WHERE at >= ? GROUP BY date`,
      [since]
    ),
    db.select<{ date: string; total: number }[]>(
      `SELECT substr(submitted_at, 1, 10) AS date, COUNT(*) AS total FROM requests
          WHERE submitted_at >= ? GROUP BY date`,
      [since]
    ),
  ]);

  const [row] = counts;
  const items = row?.items ?? 0;
  const batches = row?.batches ?? 0;
  const auditRows = row?.audit ?? 0;
  const trash = row?.trash ?? 0;

  const sizeBytes =
    (pageCount[0]?.page_count ?? 0) * (pageSize[0]?.page_size ?? 0);
  const newestBackup = backupRows[0]?.name.split("_backup_")[1]?.slice(0, 10);
  const expired = expiredRows[0]?.c ?? 0;

  const dispensedTrend = toTrend(dispensing);
  const auditTrend = toTrend(audit);
  const requestTrend = toTrend(submissions);
  const activeDays = dispensedTrend.filter((value) => value > 0).length;
  const records7d =
    dispensedTrend.reduce((sum, value) => sum + value, 0) +
    requestTrend.reduce((sum, value) => sum + value, 0);

  const cards: HealthCardData[] = [
    {
      actions: [
        { id: "integrity", label: "Check integrity" },
        { id: "vacuum", label: "Vacuum" },
      ],
      caption: `${items} items · ${batches} batches · ${trash} in Trash${expired > 0 ? ` · ${expired} expired` : ""}`,
      id: "database",
      metric: formatBytes(sizeBytes),
      status: expired > 0 ? "warn" : "ok",
      statusLabel:
        expired > 0 ? `${expired} expired batches` : "Database healthy",
      title: "Database",
      trend: dispensedTrend,
    },
    {
      actions: [{ id: "clear-cache", label: "Clear cache" }],
      caption: `${formatBytes(sizeBytes)} used of ${formatBytes(STORAGE_CAPACITY_BYTES)} · ${backupRows.length} snapshots kept`,
      id: "storage",
      metric: `${Math.max(1, Math.round((sizeBytes / STORAGE_CAPACITY_BYTES) * 100))}%`,
      status: "ok",
      statusLabel: "Storage healthy",
      title: "Storage",
      trend: auditTrend,
    },
    {
      actions: [{ id: "retry-sync", label: "Retry sync" }],
      caption:
        "This device is local-only — every change is written straight through",
      id: "sync",
      metric: "Synced",
      status: "ok",
      statusLabel: "Sync healthy",
      title: "Sync",
      trend: requestTrend,
    },
    {
      actions: [{ id: "trigger-backup", label: "Run backup" }],
      caption:
        backupRows.length > 0
          ? `Newest snapshot ${newestBackup ?? "unknown"} · next: daily 02:00`
          : "No snapshot yet · next: daily 02:00",
      id: "backup",
      metric: backupRows.length > 0 ? `${backupRows.length}` : "—",
      status: "ok",
      statusLabel: backupRows.length > 0 ? "Backup current" : "No backup yet",
      title: "Backup",
      trend: [],
    },
    {
      actions: [{ id: "view-audit", label: "View audit", to: "/admin/audit" }],
      caption: `${activeDays} active ${activeDays === 1 ? "day" : "days"} this week · ${auditRows} audit entries`,
      id: "performance",
      metric: `${records7d} records / 7d`,
      status: "ok",
      statusLabel: "Performance healthy",
      title: "Performance",
      trend: dispensedTrend.map(
        (value, index) => value + (requestTrend[index] ?? 0)
      ),
    },
  ];

  return {
    cards,
    // Nothing is queued: this app writes to SQLite directly, so the pending
    // table is legitimately empty and the card says "all synced".
    pendingSyncs: [],
  };
}
