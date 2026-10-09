/**
 * Edit Requestor Details — the rules behind the edit form.
 *
 * Requestor details live on the request itself (there is no separate requestors
 * table): a request carries the name, ID and email that were typed when it was
 * created. Editing them is therefore an update to that one card, not to a shared
 * record, and every rule about what a save means lives here so the modal stays a
 * form and the behaviour is testable without rendering.
 *
 * An anonymous requestor is a first-class answer (D23), so a blank name is legal
 * and simply reads as "Walk-in" again. The only field with a format is the
 * email: a non-empty value that is not an address is a typo worth catching, and
 * a blank one is the same "not recorded" the New Request form already allows.
 */

import type { Requestor } from "./types";

export interface RequestorDraft {
  email: string;
  id: string;
  name: string;
}

export interface RequestorDraftErrors {
  email?: string;
}

export const EMPTY_REQUESTOR_DRAFT: RequestorDraft = {
  email: "",
  id: "",
  name: "",
};

/** The draft an edit starts from — the stored values, untrimmed. */
export function draftFromRequestor(requestor: Requestor): RequestorDraft {
  return {
    email: requestor.email,
    id: requestor.id,
    name: requestor.name,
  };
}

/** Deliberately permissive: rejects an obvious typo, not an unusual address. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRequestorDraft(
  draft: RequestorDraft
): RequestorDraftErrors {
  const errors: RequestorDraftErrors = {};
  const email = draft.email.trim();
  if (email !== "" && !EMAIL_RE.test(email)) {
    errors.email = "Enter a valid email address, or leave it blank.";
  }
  return errors;
}

/**
 * The stored requestor a save writes. Every field is trimmed, and a blank stays
 * a blank string rather than becoming null — the same shape the New Request form
 * writes and the same one `requestorLabel` reads as "Walk-in".
 */
export function buildRequestorUpdate(draft: RequestorDraft): Requestor {
  return {
    email: draft.email.trim(),
    id: draft.id.trim(),
    name: draft.name.trim(),
  };
}

/** True when a save would actually change the stored requestor. */
export function isRequestorChanged(
  requestor: Requestor,
  draft: RequestorDraft
): boolean {
  const next = buildRequestorUpdate(draft);
  return (
    next.email !== requestor.email.trim() ||
    next.id !== requestor.id.trim() ||
    next.name !== requestor.name.trim()
  );
}
