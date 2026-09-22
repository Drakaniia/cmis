import { describe, expect, it } from "vitest";
import { DEFAULT_BACKUP_STORE, coerceBackupStore } from "./backup-store";

describe("backup-store", () => {
  it("defaults to enabled with keep 10", () => {
    expect(DEFAULT_BACKUP_STORE.enabled).toBe(true);
    expect(DEFAULT_BACKUP_STORE.keep).toBe(10);
  });

  it("coerces garbage and clamps keep to 1–100", () => {
    expect(coerceBackupStore({ keep: 500 }).keep).toBe(100);
    expect(coerceBackupStore({ keep: 0 }).keep).toBe(1);
    expect(coerceBackupStore(null).enabled).toBe(true);
  });
});
