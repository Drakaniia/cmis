import type { scaleLinear } from "@visx/scale";

import { normalizeYAxisId } from "../axes/y-axis-scales";
import type { LineConfig } from "../chart-context";
import { topSquareCenterY } from "./bar-squares-layout";

export interface BarPositions {
  xPositions: Record<string, number>;
  yPositions: Record<string, number>;
}

export interface SquareSnap {
  fit?: boolean;
  groupGap?: number;
  squareGap: number;
}

export function computeHorizontalPositions(
  d: Record<string, unknown>,
  lines: LineConfig[],
  yScales: Record<string, ReturnType<typeof scaleLinear<number>>>,
  valueScale: ReturnType<typeof scaleLinear<number>>,
  barPos: number,
  bandWidth: number,
  stacked: boolean
): BarPositions {
  const yPositions: Record<string, number> = {};
  const xPositions: Record<string, number> = {};
  const seriesCount = lines.length;
  const groupGap = seriesCount > 1 ? 4 : 0;
  const individualBarHeight =
    seriesCount > 0
      ? (bandWidth - groupGap * (seriesCount - 1)) / seriesCount
      : bandWidth;

  if (stacked) {
    let cumulative = 0;
    for (const line of lines) {
      const value = d[line.dataKey];
      if (typeof value === "number") {
        cumulative += value;
        const axisScale = yScales[normalizeYAxisId(line.yAxisId)] ?? valueScale;
        xPositions[line.dataKey] = axisScale(cumulative) ?? 0;
        yPositions[line.dataKey] = barPos + bandWidth / 2;
      }
    }
  } else {
    for (const [idx, line] of lines.entries()) {
      const value = d[line.dataKey];
      if (typeof value === "number") {
        const axisScale = yScales[normalizeYAxisId(line.yAxisId)] ?? valueScale;
        xPositions[line.dataKey] = axisScale(value) ?? 0;
        yPositions[line.dataKey] =
          barPos +
          idx * (individualBarHeight + groupGap) +
          individualBarHeight / 2;
      }
    }
  }

  return { xPositions, yPositions };
}

function computeStackedVerticalPositions(
  d: Record<string, unknown>,
  lines: LineConfig[],
  yScales: Record<string, ReturnType<typeof scaleLinear<number>>>,
  primaryYScale: ReturnType<typeof scaleLinear<number>>,
  stackGap: number
): Record<string, number> {
  const yPositions: Record<string, number> = {};
  let cumulative = 0;
  let seriesIdx = 0;
  for (const line of lines) {
    const value = d[line.dataKey];
    if (typeof value === "number") {
      cumulative += value;
      const axisScale =
        yScales[normalizeYAxisId(line.yAxisId)] ?? primaryYScale;
      const gapOffset = seriesIdx * stackGap;
      yPositions[line.dataKey] = (axisScale(cumulative) ?? 0) - gapOffset;
      seriesIdx += 1;
    }
  }
  return yPositions;
}

function computeGroupedVerticalPositions(
  d: Record<string, unknown>,
  lines: LineConfig[],
  yScales: Record<string, ReturnType<typeof scaleLinear<number>>>,
  primaryYScale: ReturnType<typeof scaleLinear<number>>,
  barPos: number,
  bandWidth: number,
  squareSnap: SquareSnap | undefined,
  innerHeight: number
): BarPositions {
  const yPositions: Record<string, number> = {};
  const xPositions: Record<string, number> = {};
  const seriesCount = lines.length;
  const groupGap = seriesCount > 1 ? 4 : 0;
  const individualBarWidth =
    seriesCount > 0
      ? (bandWidth - groupGap * (seriesCount - 1)) / seriesCount
      : bandWidth;

  for (const [idx, line] of lines.entries()) {
    const value = d[line.dataKey];
    if (typeof value !== "number") {
      continue;
    }
    const axisScale = yScales[normalizeYAxisId(line.yAxisId)] ?? primaryYScale;
    const baselineY = axisScale(0) ?? innerHeight;
    const valueY = axisScale(value) ?? 0;
    const barLengthPx = baselineY - valueY;

    yPositions[line.dataKey] =
      squareSnap && value > 0
        ? topSquareCenterY({
            barLengthPx,
            baselineY,
            fit: squareSnap.fit,
            gap: squareSnap.squareGap,
            squareSize: individualBarWidth,
          })
        : valueY;

    xPositions[line.dataKey] =
      barPos + idx * (individualBarWidth + groupGap) + individualBarWidth / 2;
  }
  return { xPositions, yPositions };
}

export function computeVerticalPositions(
  d: Record<string, unknown>,
  lines: LineConfig[],
  yScales: Record<string, ReturnType<typeof scaleLinear<number>>>,
  primaryYScale: ReturnType<typeof scaleLinear<number>>,
  barPos: number,
  bandWidth: number,
  stacked: boolean,
  stackGap: number,
  squareSnap: SquareSnap | undefined,
  innerHeight: number
): BarPositions {
  if (stacked) {
    const yPositions = computeStackedVerticalPositions(
      d,
      lines,
      yScales,
      primaryYScale,
      stackGap
    );
    return { xPositions: {}, yPositions };
  }

  return computeGroupedVerticalPositions(
    d,
    lines,
    yScales,
    primaryYScale,
    barPos,
    bandWidth,
    squareSnap,
    innerHeight
  );
}
