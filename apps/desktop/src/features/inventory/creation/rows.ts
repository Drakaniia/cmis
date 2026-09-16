import type { DbLike } from "./db-like";

/**
 * Row insert helpers shared by the delete/restore path and the creation path.
 *
 * The column list is read off the row rather than hardcoded, so a snapshot taken
 * before a later migration still replays in full — and a column added afterwards
 * is never silently dropped on write.
 */

export type Row = Record<string, unknown>;

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function requireIdentifier(name: string): string {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return name;
}

export async function insertRow(
  db: DbLike,
  table: string,
  row: Row
): Promise<void> {
  const columns = Object.keys(row).map(requireIdentifier);
  if (columns.length === 0) {
    throw new Error(`Refusing to insert an empty row into ${table}`);
  }
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns
    .map(() => "?")
    .join(", ")})`;
  await db.execute(
    sql,
    columns.map((column) => row[column])
  );
}

/**
 * Sequential by design, in the order given — a mid-restore failure is
 * recoverable by replaying what already landed.
 */
export function insertRows(
  db: DbLike,
  table: string,
  rows: Row[]
): Promise<void> {
  return rows.reduce<Promise<void>>(
    (previous, row) => previous.then(() => insertRow(db, table, row)),
    Promise.resolve()
  );
}
