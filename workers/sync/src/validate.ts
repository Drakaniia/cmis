/**
 * CMIS Cloud Sync Worker — request validation.
 *
 * The spec calls for request validation (§4) and this is where an untrusted
 * payload stops: a device name, a schema version, and a set of tables whose
 * names must be ones this build syncs. Column *names* never come from the
 * payload at all — `lib/sync/changes.ts` reads them from `PRAGMA table_info` and
 * intersects — so the only strings that reach SQL as identifiers are the table
 * names checked here and the column names the database itself reported.
 *
 * Deliberately hand-rolled rather than a schema library: the root workspace does
 * not expose a validator to `workers/`, and a hundred lines of explicit checks is
 * smaller than a new dependency and a build step for it.
 */

import {
  isSyncTableName,
  type SyncTableName,
} from "../../../apps/desktop/src/lib/sync/schema";
import type {
  SyncDelete,
  SyncRow,
  SyncTableChange,
} from "../../../apps/desktop/src/lib/sync/types";

export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ValidationError";
  }
}

function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, what: string, maxLength = 256): string {
  if (typeof value !== "string" || value === "") {
    throw new ValidationError(`${what} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(`${what} is longer than ${maxLength} characters`);
  }
  return value;
}

function optionalString(value: unknown, what: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requireString(value, what);
}

/** A row's values only ever go in as bound parameters, never as SQL text. */
function sanitizeRow(value: unknown, index: number, table: string): SyncRow {
  const raw = requireObject(value, `tables[${table}].rows[${index}]`);
  const row: SyncRow = {};
  for (const [key, cell] of Object.entries(raw)) {
    if (cell === null) {
      row[key] = null;
      continue;
    }
    if (typeof cell === "number" || typeof cell === "string") {
      row[key] = cell;
      continue;
    }
    // Booleans and objects are the shapes a bug produces, not the shapes SQLite
    // hands back; refusing them here turns a silent corruption into a 400.
    throw new ValidationError(
      `tables[${table}].rows[${index}].${key} must be a string, number or null`
    );
  }
  if (Object.keys(row).length === 0) {
    throw new ValidationError(`tables[${table}].rows[${index}] is empty`);
  }
  return row;
}

function sanitizeDelete(
  value: unknown,
  index: number,
  table: string
): SyncDelete {
  const raw = requireObject(value, `tables[${table}].deletes[${index}]`);
  return {
    deletedAt: requireString(
      raw.deletedAt,
      `tables[${table}].deletes[${index}].deletedAt`,
      64
    ),
    deviceId: optionalString(
      raw.deviceId,
      `tables[${table}].deletes[${index}].deviceId`
    ),
    rowKey: requireString(
      raw.rowKey,
      `tables[${table}].deletes[${index}].rowKey`,
      2048
    ),
  };
}

export interface NormalizedChanges {
  tables: SyncTableChange[];
  totalDeletes: number;
  totalRows: number;
}

function collectRows(value: unknown, table: string): SyncRow[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`tables[${table}].rows must be an array`);
  }
  return value.map((row, index) => sanitizeRow(row, index, table));
}

function collectDeletes(value: unknown, table: string): SyncDelete[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`tables[${table}].deletes must be an array`);
  }
  return value.map((entry, index) => sanitizeDelete(entry, index, table));
}

interface NormalizedTableChange {
  change: SyncTableChange | null;
  deletes: number;
  rows: number;
}

/** One `tables[]` entry: its name checked, its rows and deletes sanitized. */
function normalizeTableChange(entry: unknown): NormalizedTableChange {
  const change = requireObject(entry, "tables[]");
  const table = requireString(change.table, "tables[].table", 64);
  if (!isSyncTableName(table)) {
    throw new ValidationError(`unknown table: ${table}`);
  }
  const rows = collectRows(change.rows, table);
  const deletes = collectDeletes(change.deletes, table);
  if (rows.length === 0 && deletes.length === 0) {
    return { change: null, deletes: 0, rows: 0 };
  }
  return {
    change: {
      cursor: typeof change.cursor === "string" ? change.cursor : undefined,
      deletes,
      rows,
      table,
    },
    deletes: deletes.length,
    rows: rows.length,
  };
}

export function validatePushRequest(
  body: unknown,
  maxRows: number
): { changes: NormalizedChanges; deviceId: string; schemaVersion: number } {
  const raw = requireObject(body, "body");
  const deviceId = requireString(raw.deviceId, "deviceId", 128);
  const schemaVersion = Number(raw.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new ValidationError("schemaVersion must be a positive integer");
  }
  if (!Array.isArray(raw.tables)) {
    throw new ValidationError("tables must be an array");
  }
  if (raw.tables.length > 32) {
    throw new ValidationError("tables must hold at most 32 entries");
  }

  const tables: SyncTableChange[] = [];
  let totalRows = 0;
  let totalDeletes = 0;

  for (const entry of raw.tables) {
    const normalized = normalizeTableChange(entry);
    totalRows += normalized.rows;
    totalDeletes += normalized.deletes;
    if (normalized.change) {
      tables.push(normalized.change);
    }
  }

  if (totalRows > maxRows) {
    throw new ValidationError(
      `payload carries ${totalRows} rows, the limit is ${maxRows} — send it in batches`
    );
  }

  return {
    changes: { tables, totalDeletes, totalRows },
    deviceId,
    schemaVersion,
  };
}

export function validatePullRequest(body: unknown): {
  cursors: { deleted: string; rows: Partial<Record<SyncTableName, string>> };
  deviceId: string;
  limit: number;
  schemaVersion: number;
} {
  const raw = requireObject(body, "body");
  const deviceId = requireString(raw.deviceId, "deviceId", 128);
  const schemaVersion = Number(raw.schemaVersion);
  const limit = Number(raw.limit ?? 500);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    throw new ValidationError("limit must be an integer between 1 and 5000");
  }

  const cursors = requireObject(raw.cursors, "cursors");
  const rowsRaw = requireObject(cursors.rows ?? {}, "cursors.rows");
  const rows: Partial<Record<SyncTableName, string>> = {};
  for (const [key, value] of Object.entries(rowsRaw)) {
    if (!isSyncTableName(key)) {
      throw new ValidationError(`cursors.rows has an unknown table: ${key}`);
    }
    if (typeof value !== "string") {
      throw new ValidationError(`cursors.rows.${key} must be a string`);
    }
    rows[key] = value;
  }
  const deleted = typeof cursors.deleted === "string" ? cursors.deleted : "";

  return { cursors: { deleted, rows }, deviceId, limit, schemaVersion };
}
