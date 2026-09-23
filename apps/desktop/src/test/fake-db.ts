/**
 * An in-memory stand-in for the SQL plugin, for unit-testing write paths that
 * take a `DbLike`.
 *
 * It is intentionally a *small* SQL interpreter — it understands only the
 * statement shapes this app's creation/deletion code issues, and throws loudly
 * on anything else rather than silently returning nothing. That way a test that
 * stops exercising the real query fails instead of passing vacuously.
 *
 * It also understands the two shapes the snapshot/restore rollback needs
 * (`DELETE … WHERE id NOT IN (SELECT …)` and `UPDATE … SET col = (SELECT b.col
 * FROM "backup" b WHERE …)`), because the atomicity promise is only worth
 * something if a test can make the writes fail halfway.
 *
 * A third shape it knows is the app's medicine predicate (`MEDICINE_WHERE_SQL`):
 * a request names an item by normalized text rather than by a foreign key, so a
 * test of any path that resolves a medicine against the shelf needs it — the
 * request's dispensing service included.
 */

import type { DbLike } from "@/features/inventory/creation/db-like";

export type DbRow = Record<string, unknown>;

export const FAKE_TABLES = [
  "inventory_items",
  "inventory_batches",
  "dispensing_events",
  "dispensing_records",
  "requests",
  "request_history",
  "request_notes",
  "trash_records",
  "audit_log",
  "categories",
] as const;

export type FakeTableName = (typeof FAKE_TABLES)[number];

export interface FakeDb extends DbLike {
  statements: { params: unknown[]; sql: string }[];
  /** Snapshot backup tables land here too, keyed by their generated name. */
  tables: Record<string, DbRow[]>;
}

type Condition =
  | { column: string; kind: "compare"; like?: boolean; value: unknown }
  | { column: string; kind: "in"; values: unknown[] }
  | {
      /** Normalized medicine match — `MEDICINE_WHERE_SQL`'s three branches. */
      kind: "medicine";
      columns: {
        composedA: string;
        composedB: string;
        display: string;
        name: string;
      };
      values: [unknown, unknown, unknown];
    }
  | { column: string; kind: "not-in"; table: string };

type ReadTable = (name: string) => DbRow[];

const INSERT_RE = /^INSERT INTO (\w+)\s*\(([^)]*)\)\s*VALUES/i;
const UPDATE_HEAD_RE = /^UPDATE\s+(\w+)\s+SET\s+([\s\S]+)$/i;
const WHERE_KEYWORD = "WHERE ";
const DELETE_RE = /^DELETE FROM (\w+)(?:\s+WHERE\s+(.+))?$/i;
const SELECT_RE = /^SELECT\s+(.+?)\s+FROM\s+(\w+)(.*)$/is;
const WHERE_RE = /WHERE\s+(.+?)(?=\s+ORDER BY|\s+LIMIT|$)/i;
const ORDER_BY_RE = /ORDER BY\s+(.+?)(?=\s+LIMIT|$)/i;
const LIMIT_1_RE = /LIMIT\s+1/i;
const COUNT_RE = /^COUNT\(\*\)/i;
const ALIAS_RE = /AS\s+(\w+)/i;
const CONDITION_RE = /^(\w+)\s*=\s*(.+)$/;
const IN_CONDITION_RE = /^(\w+)\s+IN\s*\(([^)]*)\)$/i;
const ID_IN_RE = /^(\w+)\s+IN\s*\(([^)]*)\)$/i;
const AND_RE = /\s+AND\s+/i;
const QUOTES_RE = /^'|'$/g;
const ORDER_TERM_RE = /\s+/;
// Table names may carry a timestamp suffix (`inventory_items_backup_2026-…`),
const CREATE_AS_SELECT_RE =
  /^CREATE TABLE (?:IF NOT EXISTS )?"?([\w-]+)"? AS SELECT \* FROM ([\w-]+)(\s+WHERE 1=0)?$/i;
const DROP_TABLE_RE = /^DROP TABLE (?:IF EXISTS )?"?([\w-]+)"?$/i;
const LIKE_CONDITION_RE = /^(\w+)\s+LIKE\s+'(.+)'$/i;
const NOT_IN_SUBQUERY_RE =
  /^(\w+)\s+NOT\s+IN\s*\(\s*SELECT\s+\w+\s+FROM\s+"?([\w-]+)"?\s*\)$/i;
/**
 * `MEDICINE_WHERE_SQL` verbatim: display name, then `name || ' ' || dosage`,
 * then the bare name. Spacing is the constant's, because the app interpolates it
 * straight into the statement.
 */
const MEDICINE_CONDITION_RE =
  /^lower\(trim\((\w+)\)\) = lower\(trim\(\?\)\) OR lower\(trim\((\w+) \|\| ' ' \|\| (\w+)\)\) = lower\(trim\(\?\)\) OR lower\(trim\((\w+)\)\) = lower\(trim\(\?\)\)$/i;
const SUBQUERY_ASSIGNMENT_RE =
  /^(\w+)\s*=\s*\(SELECT\s+b\.(\w+)\s+FROM\s+"?([\w-]+)"?\s+b\s+WHERE\s+b\.(\w+)\s*=\s*(\w+)\.(\w+)\)$/i;
const SQLITE_MASTER = "sqlite_master";
const REGEX_SPECIAL_RE = /[.*+?^${}()|[\]\\]/g;

/** `%` and `_` are the only wildcards SQLite's LIKE understands. */
function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(REGEX_SPECIAL_RE, "\\$&");
  return new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
}

const INSERT_STATEMENT_RE = /^INSERT/i;
const UPDATE_STATEMENT_RE = /^UPDATE/i;
const DELETE_STATEMENT_RE = /^DELETE/i;
const CREATE_STATEMENT_RE = /^CREATE TABLE/i;
const DROP_STATEMENT_RE = /^DROP TABLE/i;

function unsupported(sql: string): never {
  throw new Error(`fake-db does not understand: ${sql}`);
}

/**
 * The last top-level ` WHERE ` — a rollback assignment is itself a subquery
 * containing one, so a non-greedy regex would split inside the parentheses.
 */
function splitSetFromWhere(text: string): { set: string; where: string } {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (
      depth === 0 &&
      text.slice(index, index + WHERE_KEYWORD.length).toUpperCase() ===
        WHERE_KEYWORD
    ) {
      return {
        set: text.slice(0, index).trim(),
        where: text.slice(index + WHERE_KEYWORD.length).trim(),
      };
    }
  }
  return unsupported(`update without where: ${text}`);
}

/** Commas inside parentheses (a subquery) are not column separators. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/**
 * Conditions are read left to right and `?` binds in that same order — exactly
 * how SQLite hands the params over, so a statement that mixes a literal and a
 * mark stays honest.
 */
function parseConditions(
  clause: string | undefined,
  nextParam: () => unknown
): Condition[] {
  if (!clause) {
    return [];
  }
  const conditions: Condition[] = [];
  const medicine = clause.trim();
  const medicineMatch = MEDICINE_CONDITION_RE.exec(medicine);
  if (medicineMatch) {
    conditions.push({
      columns: {
        composedA: medicineMatch[2],
        composedB: medicineMatch[3],
        display: medicineMatch[1],
        name: medicineMatch[4],
      },
      kind: "medicine",
      values: [nextParam(), nextParam(), nextParam()],
    });
    return conditions;
  }
  for (const part of clause.split(AND_RE)) {
    const trimmed = part.trim();
    const like = LIKE_CONDITION_RE.exec(trimmed);
    if (like) {
      conditions.push({
        column: like[1],
        kind: "compare",
        like: true,
        value: like[2],
      });
      continue;
    }
    const notIn = NOT_IN_SUBQUERY_RE.exec(trimmed);
    if (notIn) {
      conditions.push({ column: notIn[1], kind: "not-in", table: notIn[2] });
      continue;
    }
    const inList = IN_CONDITION_RE.exec(trimmed);
    if (inList) {
      const marks = splitTopLevel(inList[2], ",");
      conditions.push({
        column: inList[1],
        kind: "in",
        values: marks.map(() => nextParam()),
      });
      continue;
    }
    const match = CONDITION_RE.exec(trimmed);
    if (!match) {
      return unsupported(`condition: ${trimmed}`);
    }
    const raw = match[2].trim();
    conditions.push({
      column: match[1],
      kind: "compare",
      value: raw === "?" ? nextParam() : raw.replace(QUOTES_RE, ""),
    });
  }
  return conditions;
}

function paramCursor(params: unknown[]): () => unknown {
  let cursor = 0;
  return () => {
    const value = params[cursor];
    cursor += 1;
    return value;
  };
}

function matches(
  row: DbRow,
  conditions: Condition[],
  readTable: ReadTable
): boolean {
  return conditions.every((condition) => {
    if (condition.kind === "medicine") {
      const normalize = (candidate: unknown) =>
        String(candidate ?? "")
          .trim()
          .toLowerCase();
      const { composedA, composedB, display, name } = condition.columns;
      const [forDisplay, forComposed, forName] = condition.values;
      return (
        normalize(row[display]) === normalize(forDisplay) ||
        normalize(`${row[composedA] ?? ""} ${row[composedB] ?? ""}`) ===
          normalize(forComposed) ||
        normalize(row[name]) === normalize(forName)
      );
    }
    const value = row[condition.column];
    if (condition.kind === "in") {
      return condition.values.some(
        (candidate) => String(candidate) === String(value)
      );
    }
    if (condition.kind === "not-in") {
      return !readTable(condition.table).some(
        (candidate) => String(candidate[condition.column]) === String(value)
      );
    }
    if (condition.like) {
      return likeToRegExp(String(condition.value)).test(String(value ?? ""));
    }
    return (
      value === condition.value || String(value) === String(condition.value)
    );
  });
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export function createFakeDb(
  seed: Partial<Record<FakeTableName, DbRow[]>> = {}
): FakeDb {
  // Rows are cloned, not aliased: an UPDATE must never reach back into the
  // fixture object a test declared at module scope and mutate the next case.
  const tables: Record<string, DbRow[]> = Object.fromEntries(
    FAKE_TABLES.map((name) => [
      name,
      (seed[name] ?? []).map((row) => ({ ...row })),
    ])
  );
  const statements: { params: unknown[]; sql: string }[] = [];

  function readTable(name: string): DbRow[] {
    if (name === SQLITE_MASTER) {
      return Object.keys(tables).map((key) => ({
        name: key,
        type: "table",
      }));
    }
    const table = tables[name];
    if (!table) {
      return unsupported(`unknown table ${name}`);
    }
    return table;
  }

  /** `CREATE TABLE x AS SELECT * FROM y` — how a snapshot is taken. */
  function createAsSelect(sql: string): void {
    const match = CREATE_AS_SELECT_RE.exec(sql);
    if (!match) {
      unsupported(sql);
      return;
    }
    const [, name, source, empty] = match;
    tables[name] = empty ? [] : readTable(source).map((row) => ({ ...row }));
  }

  function dropTable(sql: string): void {
    const match = DROP_TABLE_RE.exec(sql);
    if (!match) {
      unsupported(sql);
      return;
    }
    delete tables[match[1]];
  }

  function insert(sql: string, params: unknown[]): void {
    // Atomic upsert for dispensing_events: INSERT ... ON CONFLICT(item_id, date) DO UPDATE SET qty = qty + excluded.qty
    if (sql.includes("ON CONFLICT")) {
      const match = INSERT_RE.exec(sql.trim());
      if (!match) {
        unsupported(sql);
        return;
      }
      const columns = match[2].split(",").map((column) => column.trim());
      const row: DbRow = {};
      columns.forEach((column, index) => {
        row[column] = params[index] ?? null;
      });
      const table = readTable(match[1]);
      const existing = table.find(
        (candidate) =>
          String(candidate.item_id) === String(row.item_id) &&
          String(candidate.date) === String(row.date)
      );
      if (existing) {
        const add = Number(row.qty ?? 0);
        existing.qty = Number(existing.qty ?? 0) + add;
        return;
      }
      table.push(row);
      return;
    }
    const match = INSERT_RE.exec(sql.trim());
    if (!match) {
      unsupported(sql);
      return;
    }
    const columns = match[2].split(",").map((column) => column.trim());
    const row: DbRow = {};
    columns.forEach((column, index) => {
      row[column] = params[index] ?? null;
    });
    readTable(match[1]).push(row);
  }

  /**
   * Two statement shapes reach here: the plain `SET qty = ?` of the app's own
   * updates, and the rollback's `SET qty = (SELECT b.qty FROM "backup" b …)`
   * column copy. SQLite binds `?` in text order, which is the order parsed.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: test helper with branching for SQL shapes
  function update(sql: string, params: unknown[]): void {
    // Atomic undo: UPDATE dispensing_events SET qty = CASE WHEN qty - ? < 0 THEN 0 ELSE qty - ? END WHERE item_id = ? AND date = ?
    if (sql.includes("CASE WHEN qty - ?")) {
      const take = Number(params[0]);
      const itemId = String(params[2]);
      const date = String(params[3]);
      const rows = readTable("dispensing_events").filter(
        (row) => String(row.item_id) === itemId && String(row.date) === date
      );
      for (const row of rows) {
        const current = Number(row.qty ?? 0);
        row.qty = Math.max(current - take, 0);
      }
      return;
    }
    // Atomic daily add: UPDATE dispensing_events SET qty = qty + ? WHERE item_id = ? AND date = ?
    if (
      sql.includes("SET qty = qty + ? WHERE item_id = ? AND date = ?") &&
      params.length === 3
    ) {
      const add = Number(params[0]);
      const itemId = String(params[1]);
      const date = String(params[2]);
      const rows = readTable("dispensing_events").filter(
        (row) => String(row.item_id) === itemId && String(row.date) === date
      );
      for (const row of rows) {
        row.qty = Number(row.qty ?? 0) + add;
      }
      return;
    }
    const head = UPDATE_HEAD_RE.exec(sql.trim());
    if (!head) {
      unsupported(sql);
      return;
    }
    const [, table, body] = head;
    const { set: setClause, where: whereClause } = splitSetFromWhere(body);
    const assignments = splitTopLevel(setClause, ",").map((assignment) => {
      const separator = assignment.indexOf("=");
      return {
        column: assignment.slice(0, separator).trim(),
        expr: assignment.slice(separator + 1).trim(),
      };
    });

    let cursor = 0;
    const nextParam = (): unknown => {
      const value = params[cursor];
      cursor += 1;
      return value;
    };
    const values = assignments.map((assignment) => {
      if (assignment.expr === "?") {
        return {
          column: assignment.column,
          kind: "param" as const,
          value: nextParam(),
        };
      }
      const subquery = SUBQUERY_ASSIGNMENT_RE.exec(
        `${assignment.column} = ${assignment.expr}`
      );
      if (subquery) {
        return {
          column: assignment.column,
          kind: "subquery" as const,
          source: {
            backupColumn: subquery[2],
            backupId: subquery[4],
            backupTable: subquery[3],
            localId: subquery[6],
          },
        };
      }
      return {
        column: assignment.column,
        kind: "literal" as const,
        value: Number(assignment.expr),
      };
    });

    const targets = targetRows(table, whereClause, nextParam);
    for (const row of targets) {
      for (const assignment of values) {
        if (assignment.kind === "param" || assignment.kind === "literal") {
          row[assignment.column] = assignment.value;
          continue;
        }
        const { backupColumn, backupId, backupTable, localId } =
          assignment.source;
        const snapshot = readTable(backupTable).find(
          (candidate) => candidate[backupId] === row[localId]
        );
        row[assignment.column] = snapshot?.[backupColumn] ?? null;
      }
    }
  }

  /** `WHERE id = ?` or `WHERE id IN (?, ?, …)` — the only filters UPDATE uses. */
  function targetRows(
    table: string,
    whereClause: string,
    nextParam: () => unknown
  ): DbRow[] {
    const equality = CONDITION_RE.exec(whereClause.trim());
    if (equality && equality[2].trim() === "?") {
      const value = nextParam();
      return readTable(table).filter(
        (row) =>
          row[equality[1]] === value ||
          String(row[equality[1]]) === String(value)
      );
    }
    const idIn = ID_IN_RE.exec(whereClause.trim());
    if (idIn) {
      const marks = splitTopLevel(idIn[2], ",");
      const wanted = marks.map(() => String(nextParam()));
      return readTable(table).filter((row) =>
        wanted.includes(String(row[idIn[1]]))
      );
    }
    return unsupported(`update where: ${whereClause}`);
  }

  function remove(sql: string, params: unknown[]): void {
    const match = DELETE_RE.exec(sql.trim());
    if (!match) {
      unsupported(sql);
      return;
    }
    const conditions = parseConditions(match[2], paramCursor(params));
    if (conditions.length === 0) {
      tables[match[1]] = [];
      return;
    }
    const rows = readTable(match[1]);
    tables[match[1]] = rows.filter(
      (row) => !matches(row, conditions, readTable)
    );
  }

  function select(sql: string, params: unknown[]): DbRow[] {
    const head = SELECT_RE.exec(sql.trim());
    if (!head) {
      unsupported(sql);
      return [];
    }
    const [, rawProjection, table, rest] = head;
    const projection = rawProjection.trim();
    const conditions = parseConditions(
      WHERE_RE.exec(rest)?.[1],
      paramCursor(params)
    );
    const rows = readTable(table).filter((row) =>
      matches(row, conditions, readTable)
    );

    const order = ORDER_BY_RE.exec(rest)?.[1];
    let ordered = rows;
    if (order) {
      const terms = order.split(",").map((term) => {
        const [column, dir] = term.trim().split(ORDER_TERM_RE);
        return { column, desc: dir?.toUpperCase() === "DESC" };
      });
      ordered = [...rows].sort((a, b) => {
        for (const term of terms) {
          const result = compare(a[term.column], b[term.column]);
          if (result !== 0) {
            return term.desc ? -result : result;
          }
        }
        return 0;
      });
    }

    const limited = LIMIT_1_RE.test(rest) ? ordered.slice(0, 1) : ordered;

    if (COUNT_RE.test(projection)) {
      const raw = ALIAS_RE.exec(projection)?.[1] ?? "count";
      return [{ [raw]: limited.length }];
    }
    if (projection === "*") {
      return limited.map((row) => ({ ...row }));
    }
    const columns = projection.split(",").map((column) => column.trim());
    return limited.map((row) =>
      Object.fromEntries(columns.map((column) => [column, row[column]]))
    );
  }

  const db: FakeDb = {
    execute: (sql, params = []) => {
      statements.push({ params: [...params], sql });
      const trimmed = sql.trim();
      if (INSERT_STATEMENT_RE.test(trimmed)) {
        insert(trimmed, [...params]);
        return Promise.resolve({});
      }
      if (UPDATE_STATEMENT_RE.test(trimmed)) {
        update(trimmed, [...params]);
        return Promise.resolve({});
      }
      if (DELETE_STATEMENT_RE.test(trimmed)) {
        remove(trimmed, [...params]);
        return Promise.resolve({});
      }
      if (CREATE_STATEMENT_RE.test(trimmed)) {
        createAsSelect(trimmed);
        return Promise.resolve({});
      }
      if (DROP_STATEMENT_RE.test(trimmed)) {
        dropTable(trimmed);
        return Promise.resolve({});
      }
      unsupported(trimmed);
      return Promise.resolve({});
    },
    select: <T>(sql: string, params: unknown[] = []) => {
      statements.push({ params: [...params], sql });
      return Promise.resolve(select(sql, [...params]) as T);
    },
    statements,
    tables,
  };

  return db;
}
