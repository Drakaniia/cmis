/**
 * CMIS Cloud Sync Worker — the entry point `wrangler` deploys.
 *
 * The entry file exists only to satisfy the runtime's expected shape; the API
 * itself is `handleRequest` so it can be driven from a test with a plain
 * `Request` and an in-memory D1 stand-in (`workers/sync/test`).
 */

import type { Env } from "./env";
import { handleRequest } from "./handler";

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    handleRequest(request, env),
};
