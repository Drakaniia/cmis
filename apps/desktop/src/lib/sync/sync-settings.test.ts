import { describe, expect, it } from "vitest";

import {
  __coerceSyncSettingsForTests,
  DEFAULT_SYNC_SETTINGS,
  normalizeEndpoint,
} from "./sync-settings";

describe("coercing the stored sync settings", () => {
  it("tolerates an older store file with no strategy map", () => {
    const loaded = __coerceSyncSettingsForTests({
      enabled: true,
      endpoint: "https://cmis-sync.test",
      intervalMs: 30_000,
      queueMaxSize: 1000,
    });
    expect(loaded.endpointStrategies).toEqual({});
    expect(loaded.endpoint).toBe("https://cmis-sync.test");
  });

  it("keeps known strategies and drops anything else", () => {
    const loaded = __coerceSyncSettingsForTests({
      endpoint: "https://cmis-sync.test",
      endpointStrategies: {
        "": "local",
        "https://a.test": "cloud",
        "https://b.test": "merge",
        "https://c.test": "overwrite",
      },
    });
    expect(loaded.endpointStrategies).toEqual({
      "https://a.test": "cloud",
      "https://b.test": "merge",
    });
  });

  it("falls back to defaults for a non-object product", () => {
    const loaded = __coerceSyncSettingsForTests(null);
    expect(loaded.endpointStrategies).toEqual({});
    expect(loaded.endpoint).toBe(DEFAULT_SYNC_SETTINGS.endpoint);
  });

  it("normalises a trailing slash so endpoint keys match", () => {
    expect(normalizeEndpoint("https://cmis-sync.test/")).toBe(
      "https://cmis-sync.test"
    );
  });
});
