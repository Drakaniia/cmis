import { describe, expect, it } from "vitest";

import {
  buildRequestorUpdate,
  draftFromRequestor,
  EMPTY_REQUESTOR_DRAFT,
  isRequestorChanged,
  validateRequestorDraft,
} from "./requestor-update";
import type { Requestor } from "./types";

const REQUESTOR: Requestor = {
  email: "maria.santos@bukidnon.edu",
  id: "STU-2024-0831",
  name: "Maria Santos",
};

describe("draftFromRequestor", () => {
  it("copies the stored requestor verbatim", () => {
    expect(draftFromRequestor(REQUESTOR)).toEqual(REQUESTOR);
  });

  it("starts from blank for an anonymous requestor", () => {
    expect(
      draftFromRequestor({
        email: "",
        id: "",
        name: "",
      })
    ).toEqual(EMPTY_REQUESTOR_DRAFT);
  });
});

describe("validateRequestorDraft", () => {
  it("accepts a well-formed address", () => {
    expect(validateRequestorDraft(REQUESTOR)).toEqual({});
  });

  it("accepts a blank email — not recorded is a valid answer", () => {
    expect(validateRequestorDraft({ ...REQUESTOR, email: "  " })).toEqual({});
  });

  it("rejects an obviously malformed address", () => {
    expect(
      validateRequestorDraft({ ...REQUESTOR, email: "maria.santos" })
    ).toEqual({ email: "Enter a valid email address, or leave it blank." });
  });

  it("accepts a blank name and ID — anonymous is first-class", () => {
    expect(validateRequestorDraft({ email: "", id: "", name: "" })).toEqual({});
  });
});

describe("buildRequestorUpdate", () => {
  it("trims every field", () => {
    expect(
      buildRequestorUpdate({
        email: "  a@b.co  ",
        id: " STU-1 ",
        name: " Maria ",
      })
    ).toEqual({ email: "a@b.co", id: "STU-1", name: "Maria" });
  });

  it("keeps blank as a blank string, never null", () => {
    expect(buildRequestorUpdate({ email: "", id: "", name: "   " })).toEqual({
      email: "",
      id: "",
      name: "",
    });
  });
});

describe("isRequestorChanged", () => {
  it("is false when the draft matches the stored requestor", () => {
    expect(isRequestorChanged(REQUESTOR, draftFromRequestor(REQUESTOR))).toBe(
      false
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(
      isRequestorChanged(REQUESTOR, {
        ...REQUESTOR,
        name: "  Maria Santos  ",
      })
    ).toBe(false);
  });

  it("is true when any field changes", () => {
    expect(
      isRequestorChanged(REQUESTOR, { ...REQUESTOR, id: "STU-2025-0001" })
    ).toBe(true);
    expect(isRequestorChanged(REQUESTOR, { ...REQUESTOR, name: "" })).toBe(
      true
    );
  });
});
