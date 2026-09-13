"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface SpringConfig {
  damping: number;
  stiffness: number;
}

export interface ChartConfigValue {
  /** Line/area hover-highlight band (x + width). */
  highlightSpring: SpringConfig;
  /** Floating tooltip panel. */
  tooltipBoxSpring: SpringConfig;
  /** Crosshair indicator, tooltip dot, date pill. */
  tooltipSpring: SpringConfig;
}

export const DEFAULT_CHART_CONFIG: ChartConfigValue = {
  highlightSpring: { damping: 28, stiffness: 180 },
  tooltipBoxSpring: { damping: 20, stiffness: 100 },
  tooltipSpring: { damping: 30, stiffness: 300 },
};

const ChartConfigContext = createContext<ChartConfigValue | null>(null);

export interface ChartConfigProviderProps {
  children: ReactNode;
  value?: Partial<ChartConfigValue>;
}

export function ChartConfigProvider({
  value,
  children,
}: ChartConfigProviderProps) {
  const merged = useMemo<ChartConfigValue>(
    () => ({
      ...DEFAULT_CHART_CONFIG,
      ...value,
    }),
    [value]
  );

  return (
    <ChartConfigContext.Provider value={merged}>
      {children}
    </ChartConfigContext.Provider>
  );
}

export function useChartConfig(): ChartConfigValue {
  return useContext(ChartConfigContext) ?? DEFAULT_CHART_CONFIG;
}

const DEFAULT_TOOLTIP_BOX_DAMPING =
  DEFAULT_CHART_CONFIG.tooltipBoxSpring.damping;

/** Maps a damping slider to the floating tooltip panel follow spring. `0` = instant. */
export function resolveTooltipBoxMotion(damping?: number): {
  animate: boolean;
  springConfig: SpringConfig;
} {
  if (damping === 0) {
    return {
      animate: false,
      springConfig: DEFAULT_CHART_CONFIG.tooltipBoxSpring,
    };
  }

  const effectiveDamping = damping ?? DEFAULT_TOOLTIP_BOX_DAMPING;
  let { stiffness } = DEFAULT_CHART_CONFIG.tooltipBoxSpring;

  if (effectiveDamping < DEFAULT_TOOLTIP_BOX_DAMPING) {
    const t =
      (DEFAULT_TOOLTIP_BOX_DAMPING - effectiveDamping) /
      DEFAULT_TOOLTIP_BOX_DAMPING;
    stiffness += t * 400;
  } else if (effectiveDamping > DEFAULT_TOOLTIP_BOX_DAMPING) {
    const t =
      (effectiveDamping - DEFAULT_TOOLTIP_BOX_DAMPING) /
      (100 - DEFAULT_TOOLTIP_BOX_DAMPING);
    stiffness -= t * 85;
  }

  return {
    animate: true,
    springConfig: {
      damping: effectiveDamping,
      stiffness: Math.max(12, Math.round(stiffness)),
    },
  };
}
