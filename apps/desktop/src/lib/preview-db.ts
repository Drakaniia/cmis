/**
 * The browser's `@tauri-apps/plugin-sql`, backed by the dev server.
 *
 * Outside a Tauri webview the real plugin cannot load, so every query in the app
 * throws and the UI shows empty states that look like real data. This module
 * speaks the same surface (`select`, `execute`, `close`, static `load`) over a
 * dev-only endpoint, so the app code stays untouched and the preview tab drives
 * a genuine SQLite database with the real migrations applied.
 *
 * Chosen in `src/lib/db.ts` only when: dev, not Vitest, and not inside Tauri —
 * a `tauri dev` window is served by this same dev server and must keep using the
 * real plugin. See `dev/preview-sql.ts` for the server half.
 */

const ENDPOINT = "/__cmis-preview-sql";

interface SqlResponse {
  error?: string;
  lastInsertId?: number;
  rows?: Record<string, unknown>[];
  rowsAffected?: number;
}

interface SqlStatement {
  params?: unknown[];
  sql: string;
}

async function request(statement: SqlStatement): Promise<SqlResponse> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      body: JSON.stringify(statement),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    throw new Error(
      `Preview database unreachable at ${ENDPOINT} — is the Vite dev server running?`,
      { cause: error }
    );
  }

  const payload = (await response.json()) as SqlResponse;
  if (!(response.ok && !payload.error)) {
    throw new Error(
      payload.error ?? `Preview database failed (${response.status})`
    );
  }
  return payload;
}

export class PreviewDatabase {
  /**
   * Probes the endpoint so a missing bridge fails here, with a readable message,
   * rather than as a confusing "undefined is not a function" in a query.
   */
  static async load(url: string): Promise<PreviewDatabase> {
    const { rows } = await request({ sql: "SELECT 1 AS ok" });
    if (rows?.length !== 1) {
      throw new Error(
        `Preview database at ${url} did not answer the health probe`
      );
    }
    return new PreviewDatabase(url);
  }

  readonly url: string;

  private constructor(url: string) {
    this.url = url;
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    const { rows } = await request({ params: bindValues, sql: query });
    return (rows ?? []) as T;
  }

  async execute(
    query: string,
    bindValues?: unknown[]
  ): Promise<{ lastInsertId: number; rowsAffected: number }> {
    const { lastInsertId, rowsAffected } = await request({
      params: bindValues,
      sql: query,
    });
    return { lastInsertId: lastInsertId ?? 0, rowsAffected: rowsAffected ?? 0 };
  }

  close(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

export default PreviewDatabase;
