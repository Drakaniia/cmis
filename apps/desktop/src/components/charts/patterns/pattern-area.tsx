"use client";

import { curveMonotoneX } from "@visx/curve";
import { AreaClosed } from "@visx/shape";
import { useCallback } from "react";
import { useChartStable } from "../chart-context";

// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

export interface PatternAreaProps {
  /** @deprecated Pattern fill is not clip-revealed; only the stroke `Area` animates. */
  animate?: boolean;
  /** Curve function. Default: curveMonotoneX */
  curve?: CurveFactory;
  /** Key in data to use for y values */
  dataKey: string;
  /** Fill color or pattern URL (e.g. `url(#pattern-id)`) */
  fill: string;
}

/**
 * Filled area using an SVG pattern (`url(#id)`).
 * Pair with `PatternLines` in `AreaChart` children and an `Area` with `fillOpacity={0}` for the stroke line.
 */
export function PatternArea({
  dataKey,
  fill,
  curve = curveMonotoneX,
}: PatternAreaProps) {
  const { renderData, xScale, yScale, xAccessor } = useChartStable();

  const getX = useCallback(
    (d: Record<string, unknown>) => xScale(xAccessor(d)) ?? 0,
    [xScale, xAccessor]
  );
  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const v = d[dataKey];
      return typeof v === "number" ? (yScale(v) ?? 0) : 0;
    },
    [dataKey, yScale]
  );

  return (
    <AreaClosed
      curve={curve}
      data={renderData}
      fill={fill}
      x={getX}
      y={getY}
      yScale={yScale}
    />
  );
}

PatternArea.displayName = "PatternArea";
