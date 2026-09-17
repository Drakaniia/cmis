/**
 * Request references: `REQ-<YYYY>-<NNNN>`, sequential within the calendar year
 * (D8, F4).
 *
 * The sequence is derived from what is already stored rather than kept in a
 * counter, so it survives a restart and needs no extra table. `nextRequestId` is
 * pure and takes the ids it should avoid, which is what makes it testable; the
 * DB-backed `reserveRequestIds` is the thin lookup on top.
 *
 * Requests created before the year rolls over keep their reference. A new year
 * restarts at `0001` and nothing is renumbered (E10).
 */

import { loadRequestIds } from "./persistence";

const ID_PATTERN = /^REQ-(\d{4})-(\d+)$/;
const PAD = 4;

export function formatRequestId(year: number, sequence: number): string {
  return `REQ-${String(year).padStart(4, "0")}-${String(sequence).padStart(PAD, "0")}`;
}

/**
 * The next free reference for `year`, given every id already in use.
 *
 * The candidate advances until it is genuinely unused, so a caller that hands
 * the function a set it has already reserved against cannot get a duplicate
 * (E9). A concurrent writer that commits between the read and the insert is the
 * one race this cannot see; the primary key rejects that write loudly rather
 * than overwriting a card.
 */
export function nextRequestId(
  existingIds: readonly string[],
  year: number
): string {
  const taken = new Set(existingIds);
  let highest = 0;
  for (const id of existingIds) {
    const match = ID_PATTERN.exec(id);
    if (match && Number(match[1]) === year) {
      highest = Math.max(highest, Number(match[2]));
    }
  }
  let sequence = highest + 1;
  let candidate = formatRequestId(year, sequence);
  while (taken.has(candidate)) {
    sequence += 1;
    candidate = formatRequestId(year, sequence);
  }
  return candidate;
}

/**
 * Reserves `count` consecutive references for the current year, reading what is
 * stored first. The ids handed out inside one call are reserved against each
 * other, so a multi-item form submission produces one card per row with no
 * collisions (E8).
 */
export async function reserveRequestIds(
  count: number,
  now: Date = new Date()
): Promise<string[]> {
  const existing = new Set(await loadRequestIds());
  const year = now.getFullYear();
  const reserved: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = nextRequestId([...existing], year);
    existing.add(id);
    reserved.push(id);
  }
  return reserved;
}
