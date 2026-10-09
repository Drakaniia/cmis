import type { RequestItem, Requestor } from "./types";

/**
 * CMIS-UI-05 — the requestor directory, derived from the queue.
 *
 * There is no stored requestor table: a requestor is three text fields embedded
 * on each request (D23), and blank is a first-class anonymous answer. The
 * complete list is therefore a projection over every request the board has
 * loaded — group by identity, keep the most recent spelling, and count the
 * requests attributed to each one. Nothing here writes, so the list can never
 * drift from the cards it was built from.
 */

export interface RequestorSummary {
  /** Requests attributed to this requestor. */
  count: number;
  email: string;
  /**
   * The value that isolates this requestor through the board's existing
   * requestor filter, which matches a substring of `name` + `id`. The ID wins
   * when it exists because it is the precise identity; otherwise the name is.
   * Never empty for a listed requestor — anonymous requests are not listed.
   */
  filterValue: string;
  /** Student/staff ID, blank when the requestor has none. */
  id: string;
  /** Stable grouping key, suitable as a React list key. */
  key: string;
  /** Newest submission date across this requestor's requests (ISO). */
  lastSubmittedAt: string;
  name: string;
}

export interface RequestorDirectory {
  /** Requests with no name, ID or email — the walk-in queue (D2/D23). */
  anonymousCount: number;
  requestors: RequestorSummary[];
}

/** Identity for grouping: the ID wins over the name; blank is anonymous. */
function identityOf(requestor: Requestor): string | null {
  const id = requestor.id.trim().toLowerCase();
  if (id !== "") {
    return `id:${id}`;
  }
  const name = requestor.name.trim().toLowerCase();
  return name === "" ? null : `name:${name}`;
}

/**
 * Every distinct requestor in `items`, alphabetised by name.
 *
 * Requests whose most recent edit changed a requestor's spelling group under
 * the same key and are displayed with the newest spelling, so an old typo does
 * not fork a person into two entries.
 */
export function collectRequestors(
  items: readonly RequestItem[]
): RequestorDirectory {
  const groups = new Map<string, { count: number; latest: RequestItem }>();
  let anonymousCount = 0;

  for (const item of items) {
    const key = identityOf(item.requestor);
    if (key === null) {
      anonymousCount += 1;
      continue;
    }
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { count: 1, latest: item });
      continue;
    }
    group.count += 1;
    if (item.submittedAt >= group.latest.submittedAt) {
      group.latest = item;
    }
  }

  const requestors = [...groups.entries()].map<RequestorSummary>(
    ([key, group]) => {
      const id = group.latest.requestor.id.trim();
      const name = group.latest.requestor.name.trim();
      return {
        count: group.count,
        email: group.latest.requestor.email.trim(),
        filterValue: id === "" ? name : id,
        id,
        key,
        lastSubmittedAt: group.latest.submittedAt,
        name,
      };
    }
  );

  requestors.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    return byName === 0 ? a.id.localeCompare(b.id) : byName;
  });

  return { anonymousCount, requestors };
}
