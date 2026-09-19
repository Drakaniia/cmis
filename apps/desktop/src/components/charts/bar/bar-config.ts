import type { ReactNode } from "react";

import { forEachChartChild } from "../chart-child-passthrough";
import type { LineConfig } from "../chart-context";
import type { BarProps } from "./bar";

// Extract bar configs from children synchronously
export function extractBarConfigs(children: ReactNode): LineConfig[] {
  const configs: LineConfig[] = [];

  forEachChartChild(children, (child) => {
    const childType = child.type as {
      displayName?: string;
      name?: string;
      __isBarDepthLayer?: boolean;
    };
    // Bar-depth surface layers (BarDepthBack/Front, BarPulse) carry a
    // `dataKey` to pair with a Bar but are not series themselves — skip them
    // so they don't inflate the series count and shrink the real bars.
    if (childType.__isBarDepthLayer) {
      return;
    }
    const componentName =
      typeof child.type === "function"
        ? childType.displayName || childType.name || ""
        : "";

    const props = child.props as BarProps | undefined;
    const isBarComponent =
      componentName === "Bar" ||
      componentName === "BarSquares" ||
      (props && typeof props.dataKey === "string" && props.dataKey.length > 0);

    if (isBarComponent && props?.dataKey) {
      const dotColor =
        props.stroke || props.fill || "var(--chart-line-primary)";
      configs.push({
        dataKey: props.dataKey,
        stroke: dotColor,
        strokeWidth: 0,
        yAxisId: props.yAxisId,
      });
    }
  });

  return configs;
}

export function computeStackedMax(
  data: Record<string, unknown>[],
  lines: LineConfig[]
): number {
  let max = 0;
  for (const d of data) {
    let sum = 0;
    for (const line of lines) {
      const value = d[line.dataKey];
      if (typeof value === "number") {
        sum += value;
      }
    }
    if (sum > max) {
      max = sum;
    }
  }
  return max;
}

export function computeGroupedMax(
  data: Record<string, unknown>[],
  lines: LineConfig[]
): number {
  let max = 0;
  for (const line of lines) {
    for (const d of data) {
      const value = d[line.dataKey];
      if (typeof value === "number" && value > max) {
        max = value;
      }
    }
  }
  return max;
}
