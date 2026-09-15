import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SettingsState } from "../types";
import { DEFAULT_SETTINGS, useSettings } from "./use-settings";

describe("useSettings", () => {
  it("starts with a fully populated default state (no undefined sections)", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.state).toEqual(DEFAULT_SETTINGS);
    expect(result.current.state.general).toBeDefined();
    expect(result.current.state.general.dateFormat).toBeDefined();
    expect(result.current.state.alerts.overrides).toBeInstanceOf(Array);
    expect(result.current.state.suppliers).toBeInstanceOf(Array);
    expect(result.current.state.categories).toBeInstanceOf(Array);
    expect(result.current.state.backup.lastBackupAt).toBeDefined();
  });

  it("updateGeneral patches general settings without clobbering other sections", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateGeneral({ dateFormat: "DD/MM/YYYY" });
    });

    expect(result.current.state.general.dateFormat).toBe("DD/MM/YYYY");
    expect(result.current.state.general.timeFormat).toBe(
      DEFAULT_SETTINGS.general.timeFormat
    );
    expect(result.current.state.suppliers).toEqual(DEFAULT_SETTINGS.suppliers);
  });

  it("setOverride updates a single row override in place", () => {
    const initial: SettingsState = {
      ...DEFAULT_SETTINGS,
      alerts: {
        ...DEFAULT_SETTINGS.alerts,
        overrides: [
          {
            global: 15,
            id: "inv-001",
            itemName: "Paracetamol 500mg",
            override: null,
          },
        ],
      },
    };
    const { result } = renderHook(() => useSettings(initial));

    act(() => {
      result.current.setOverride("inv-001", 99);
    });

    const updated = result.current.state.alerts.overrides.find(
      (row) => row.id === "inv-001"
    );
    expect(updated?.override).toBe(99);
  });
});
