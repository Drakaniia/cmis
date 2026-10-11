/**
 * CMIS Cloud Sync Worker — the bindings, typed by hand.
 *
 * Deliberately no `@cloudflare/workers-types` dependency: the Worker needs three
 * declarations, and pulling a generated types package into a repository whose
 * root `pnpm install` never sees `workers/` would mean a second lockfile and a
 * second thing to keep in step. The shapes below are the subset of D1 the sync
 * engine actually calls.
 */

export interface D1Result<T> {
  results?: T[];
}

export interface D1PreparedStatement {
  all: <T>() => Promise<D1Result<T>>;
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare: (sql: string) => D1PreparedStatement;
}

export interface Env {
  /** The D1 binding declared in `wrangler.toml`. */
  DB: D1DatabaseLike;
  /**
   * Optional shared secret. When it is set, every request must carry it as
   * `Authorization: Bearer <token>`.
   *
   * The spec allows a trusted network with no authentication, and an unset
   * variable keeps exactly that behaviour. It exists because this Worker is
   * usually reachable at a public `*.workers.dev` URL, where "no auth" means
   * anyone who learns the hostname can read and rewrite the clinic's inventory —
   * and setting one secret on both sides is a cheap answer.
   */
  SYNC_TOKEN?: string;
}
