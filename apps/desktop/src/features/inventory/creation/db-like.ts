/**
 * The slice of the SQL plugin these modules actually use.
 *
 * Taken as a parameter rather than imported so the write paths are unit-testable
 * against a fake — the same shape `import/import.ts` declares for its own run.
 */
export interface DbLike {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  select: <T>(sql: string, params?: unknown[]) => Promise<T>;
}
