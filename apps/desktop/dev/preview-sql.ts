import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Plugin } from "vite";

/**
 * Serve the preview tab a real database.
 *
 * The desktop app's data layer is `@tauri-apps/plugin-sql`, which only exists
 * inside a Tauri webview — opened in a plain browser the app renders but every
 * query throws, so lists show false empty states and the intake flows dead-end.
 *
 * This plugin closes that gap without a second data layer: it executes the app's
 * SQL against a real SQLite database (`node:sqlite`, no new dependency) behind a
 * dev-only HTTP endpoint, bootstrapping it with the *same* migration files the
 * Rust side registers. `src/lib/preview-db.ts` is the browser half — it speaks
 * the plugin-sql API, so nothing in the app itself branches on "am I previewing".
 *
 * Guards, in `src/lib/db.ts`: the shim is chosen only in dev, only outside
 * Vitest, and only when `isTauriRuntime()` is false — a `tauri dev` window is
 * served by this very server, and it must keep talking to its own database.
 */

const ROUTE = "/__cmis-preview-sql";

const NUMBERED_PLACEHOLDER_RE = /^[$:@](\d+)/;
const READ_STATEMENT_RE = /^(SELECT|PRAGMA|WITH|EXPLAIN|VALUES)/;

/** Inside `node_modules` so the throwaway database never shows up in git. */
function databaseFile(root: string): string {
  return resolve(root, "node_modules/.cmis-preview/cmis.db");
}

function migrationsDirectory(root: string): string {
  return resolve(root, "src-tauri/migrations");
}

interface SqlRequest {
  params?: unknown[];
  sql: string;
}

interface SqlResponse {
  error?: string;
  lastInsertId?: number;
  rows?: Record<string, unknown>[];
  rowsAffected?: number;
}

/**
 * SQLite accepts only null/number/string/bigint/blob. The plugin's JSON bridge
 * coerces booleans to 0/1 on the way in, and the app relies on that (it stores
 * `is_no_stock`, `dosage_missing` and friends as booleans from JS).
 */
function toBindValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

function migrationFiles(root: string): string[] {
  return readdirSync(migrationsDirectory(root))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * Mirrors `add_migrations` in `src-tauri/src/lib.rs`: every `.sql` file, once,
 * in filename order. The bookkeeping table replaces sqlx's own ledger so a
 * second `pnpm dev` does not re-run `ALTER TABLE` and explode.
 */
function migrate(
  db: DatabaseSync,
  root: string,
  log: (message: string) => void
): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _preview_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );

  const applied = new Set(
    db
      .prepare("SELECT name FROM _preview_migrations")
      .all()
      .map((row) => String((row as { name: string }).name))
  );

  for (const file of migrationFiles(root)) {
    if (applied.has(file)) {
      continue;
    }
    db.exec(readFileSync(resolve(migrationsDirectory(root), file), "utf8"));
    db.prepare(
      "INSERT INTO _preview_migrations (name, applied_at) VALUES (?, ?)"
    ).run(file, new Date().toISOString());
    log(`preview database: applied ${file}`);
  }
}

function openDatabase(
  root: string,
  log: (message: string) => void
): DatabaseSync {
  const file = databaseFile(root);
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db, root, log);
  return db;
}

/**
 * Rewrite the plugin's `$1` placeholders into the anonymous `?` form.
 *
 * `tauri-plugin-sql` hands the SQL to sqlx, whose SQLite examples bind by index
 * (`WHERE id = $1`). SQLite treats `$1` as a *named* parameter, and node:sqlite
 * binds named parameters from an object — so the same statement that works in the
 * app fails here with "column index out of range" (which the app's own error
 * handling swallows). Repeats are expanded per occurrence, exactly as SQLite's
 * positional `?` numbering would.
 */
function bindPlaceholders(sql: string, values: unknown[]): SqlRequest {
  const chunks: string[] = [];
  const params: unknown[] = [];
  let index = 0;
  let quote: string | null = null;

  while (index < sql.length) {
    const char = sql[index] as string;

    if (quote) {
      chunks.push(char);
      // Doubled quotes are an escaped quote, not the end of the literal.
      if (char === quote) {
        if (sql[index + 1] === quote) {
          chunks.push(sql[index + 1] as string);
          index += 2;
          continue;
        }
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      chunks.push(char);
      index += 1;
      continue;
    }

    const numbered = NUMBERED_PLACEHOLDER_RE.exec(sql.slice(index));
    if (numbered) {
      params.push(values[Number(numbered[1]) - 1] ?? null);
      chunks.push("?");
      index += numbered[0].length;
      continue;
    }

    chunks.push(char);
    index += 1;
  }

  return { params, sql: chunks.join("") };
}

function isReadStatement(sql: string): boolean {
  return READ_STATEMENT_RE.test(sql.trimStart().slice(0, 12).toUpperCase());
}

function execute(db: DatabaseSync, request: SqlRequest): SqlResponse {
  const bound = bindPlaceholders(request.sql, request.params ?? []);
  const { params, sql } = bound;
  const values = (params ?? []).map(toBindValue);

  // `VACUUM` and other non-preparable statements are legal for `exec` only, so
  // a prepare failure falls back rather than turning Wipe All Data into an error.
  let statement: ReturnType<DatabaseSync["prepare"]>;
  try {
    statement = db.prepare(sql);
  } catch (error) {
    if (values.length > 0 || isReadStatement(sql)) {
      throw error;
    }
    db.exec(sql);
    return { rows: [] };
  }

  if (isReadStatement(sql)) {
    const rows = (
      values.length > 0
        ? statement.all(...(values as never[]))
        : statement.all()
    ) as Record<string, unknown>[];
    return { rows };
  }

  const result =
    values.length > 0 ? statement.run(...(values as never[])) : statement.run();
  return {
    lastInsertId: Number(result.lastInsertRowid),
    rowsAffected: Number(result.changes),
  };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () =>
      resolveBody(Buffer.concat(chunks).toString("utf8"))
    );
    request.on("error", rejectBody);
  });
}

function send(
  response: ServerResponse,
  status: number,
  payload: SqlResponse
): void {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(body);
}

export function previewSql(): Plugin {
  return {
    apply: "serve",
    configureServer(server) {
      const log = (message: string) => server.config.logger.info(message);
      const db = openDatabase(server.config.root, log);
      log(`preview database: ${databaseFile(server.config.root)}`);

      server.middlewares.use(ROUTE, (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }

        (async () => {
          try {
            const body = JSON.parse(await readBody(request)) as SqlRequest;
            send(response, 200, execute(db, body));
          } catch (error) {
            send(response, 500, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })().catch(() => {
          // fire-and-forget: errors are already handled above
        });
      });

      server.httpServer?.on("close", () => db.close());
    },
    name: "cmis-preview-sql",
  };
}
