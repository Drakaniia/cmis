import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetAppNameForTests,
  APP_NAME_STORAGE_KEY,
  DEFAULT_APP_NAME,
  getAppName,
  setAppName,
  useAppName,
} from "./app-name";

describe("app-name store", () => {
  beforeEach(() => {
    __resetAppNameForTests();
  });

  it("defaults to CMIS", () => {
    expect(getAppName()).toBe(DEFAULT_APP_NAME);
    expect(DEFAULT_APP_NAME).toBe("CMIS");
  });

  it("trims names and falls back on empty", () => {
    expect(setAppName("  PharmaTrack  ")).toBe("PharmaTrack");
    expect(setAppName("   ")).toBe(DEFAULT_APP_NAME);
  });

  it("persists renames to localStorage", () => {
    setAppName("PharmaTrack");
    expect(localStorage.getItem(APP_NAME_STORAGE_KEY)).toBe("PharmaTrack");
  });

  it("notifies live subscribers with no reload", () => {
    const { result } = renderHook(() => useAppName());
    act(() => {
      setAppName("PharmaTrack");
    });
    expect(result.current).toBe("PharmaTrack");
  });
});
