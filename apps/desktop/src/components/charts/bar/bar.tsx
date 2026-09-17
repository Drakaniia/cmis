"use client";

import type { scaleBand } from "@visx/scale";
import type { Transition } from "motion/react";
import { motion } from "motion/react";
import { memo, useId, useMemo } from "react";
import {
  chartCssVars,
  useChart,
  useChartStable,
  useYScale,
} from "../chart-context";
import { useChartLegendHover } from "../chart-legend-hover";
import { transitionWithDelay } from "../motion-utils";
import { barDepthAndRise, barDepthMaxDepth } from "./bar-depth-geometry";

type ScaleBand<Domain extends { toString: () => string }> = ReturnType<
  typeof scaleBand<Domain>
>;

export type BarLineCap = "round" | "butt" | number;
export type BarAnimationType = "grow" | "fade";

// ── Bar-depth perspective trim ───────────────────────────────────────────
// Uses the SHARED geometry (`bar-depth-geometry.ts`) so a
// `<Bar perspective>` front face lines up exactly with
// `<BarDepthBack>`'s lid — the formula lives in one place for both.

/** perspectiveRise for a positive bar whose visual top sits at `topY`.
 * Returns 0 for a dead-center bar or a dense chart (degenerate depth). */
function barDepthPerspectiveRise(
  barScale: ScaleBand<string>,
  bandWidth: number,
  barXAccessor: (d: Record<string, unknown>) => string,
  innerWidth: number,
  datum: Record<string, unknown>,
  topY: number,
  baselineY: number
): number {
  const centerX = innerWidth / 2;
  if (centerX <= 0) {
    return 0;
  }
  const step =
    (barScale as unknown as { step?: () => number }).step?.() ?? bandWidth;
  const maxDepth = barDepthMaxDepth(step, bandWidth);
  const bandX = barScale(barXAccessor(datum)) ?? 0;
  const cx = bandX + bandWidth / 2;
  const absOffset = Math.min(1, Math.abs((cx - centerX) / centerX));
  const naturalHeight = Math.abs(baselineY - topY);
  return barDepthAndRise(absOffset, naturalHeight, maxDepth).perspectiveRise;
}

export interface BarProps {
  /** Whether to animate the bars. Default: true */
  animate?: boolean;
  /** Animation type: "grow" (height) or "fade" (opacity + blur). Default: "grow" */
  animationType?: BarAnimationType;
  /** Key in data to use for y values */
  dataKey: string;
  /** Opacity when not hovered (when another bar is hovered). Default: 0.3 */
  fadedOpacity?: number;
  /** Fill color for the bar. Can be a color, gradient url, or pattern url. Default: var(--chart-line-primary) */
  fill?: string;
  /** Gap between grouped bars in pixels. Default: 4 */
  groupGap?: number;
  /** Line cap style for bar ends: "round", "butt", or a number for custom radius. Default: "round" */
  lineCap?: BarLineCap;
  /** Minimum rendered bar height in px (non-stacked, vertical). Floors short or
   * zero-value bars so they stay visible. Pair with the same value on
   * `<BarDepthProvider minBarHeight>` when using the 3D surfaces. Default: 0 */
  minBarHeight?: number;
  /** Shrink each positive bar's top by its perspective rise so the front face
   * lines up with `<BarDepthBack>`'s lid (instead of the lid sitting above the
   * front face). Pass `true` whenever the chart also renders the bar-depth 3D
   * surfaces. Default: false */
  perspective?: boolean;
  /** Gap between stacked bars in pixels. Default: 0 */
  stackGap?: number;
  /** Stagger delay between bars in seconds. Auto-calculated if not provided. */
  staggerDelay?: number;
  /** Color for tooltip dot. Use when fill is a gradient/pattern. Default: uses fill value */
  stroke?: string;
  /** Y-scale group id for vertical bars (Recharts `yAxisId`). Default: `"left"`. */
  yAxisId?: string | number;
}

interface BarInnerProps extends BarProps {
  bandWidth: number;
  barScale: ScaleBand<string>;
  barXAccessor: (d: Record<string, unknown>) => string;
}

interface AnimatedBarProps {
  animationType: BarAnimationType;
  enterTransition?: Transition;
  fadedOpacity: number;
  fill: string;
  height: number;
  index: number;
  innerHeight: number;
  isFaded: boolean;
  isHorizontal: boolean;
  revealEpoch: number;
  rx: number;
  ry: number;
  staggerDelay: number;
  width: number;
  x: number;
  y: number;
}

function AnimatedBar({
  x,
  y,
  width,
  height,
  fill,
  rx,
  ry,
  index,
  isFaded,
  animationType,
  innerHeight,
  fadedOpacity,
  staggerDelay,
  enterTransition,
  revealEpoch,
  isHorizontal,
}: AnimatedBarProps) {
  const enterAnim = transitionWithDelay(enterTransition, index * staggerDelay);

  if (animationType === "fade") {
    return (
      <motion.rect
        animate={{
          filter: "blur(0px)",
          opacity: isFaded ? fadedOpacity : 1,
        }}
        fill={fill}
        height={height}
        initial={{ filter: "blur(2px)", opacity: 0 }}
        key={`fade-${index}-${revealEpoch}`}
        rx={rx}
        ry={ry}
        transition={enterAnim}
        width={width}
        x={x}
        y={y}
      />
    );
  }

  const initial = isHorizontal
    ? { height, width: 0, x: 0, y }
    : { height: 0, width, x, y: innerHeight };
  const target = isHorizontal
    ? { height, width, x: 0, y }
    : { height, width, x, y };

  return (
    <g
      opacity={isFaded ? fadedOpacity : 1}
      style={{ transition: "opacity 0.15s ease-in-out" }}
    >
      <motion.rect
        animate={target}
        fill={fill}
        initial={initial}
        key={`grow-${index}-${revealEpoch}`}
        rx={rx}
        ry={ry}
        transition={enterAnim}
      />
    </g>
  );
}

interface BarPosition {
  barHeight: number;
  barW: number;
  x: number;
  y: number;
}

function computeHorizontalBarPosition({
  bandPos,
  barWidth,
  dataKey,
  groupGap,
  isLastSeries,
  seriesCount,
  seriesIndex,
  stacked,
  stackGap,
  stackOffsets,
  value,
  scale,
}: {
  bandPos: number;
  barWidth: number;
  dataKey: string;
  groupGap: number;
  isLastSeries: boolean;
  seriesCount: number;
  seriesIndex: number;
  stacked: boolean;
  stackGap: number;
  stackOffsets?: Map<number, Map<string, number>>;
  value: number;
  scale: (value: number) => number | undefined;
}): BarPosition {
  const valuePos = scale(value) ?? 0;
  let barW = valuePos;
  const barHeight = barWidth;
  let x = 0;

  if (stacked && stackOffsets) {
    const offset = stackOffsets.get(seriesIndex)?.get(dataKey) ?? 0;
    x = scale(offset) ?? 0;
    barW = valuePos - x;
    const gapOffset = seriesIndex * stackGap;
    x += gapOffset;
    if (!isLastSeries && stackGap > 0) {
      barW = Math.max(0, barW - stackGap);
    }
  }

  const y = stacked
    ? bandPos
    : bandPos + seriesIndex * (barWidth + (seriesCount > 1 ? groupGap : 0));

  return { barHeight, barW, x, y };
}

function computeVerticalBarPosition({
  bandPos,
  barScale,
  bandWidth,
  barWidth,
  barXAccessor,
  d,
  dataKey,
  groupGap,
  innerHeight,
  innerWidth,
  isLastSeries,
  minBarHeight,
  perspective,
  seriesCount,
  seriesIndex,
  stacked,
  stackGap,
  stackOffsets,
  value,
  scale,
}: {
  bandPos: number;
  barScale: ScaleBand<string>;
  bandWidth: number;
  barWidth: number;
  barXAccessor: (d: Record<string, unknown>) => string;
  d: Record<string, unknown>;
  dataKey: string;
  groupGap: number;
  innerHeight: number;
  innerWidth: number;
  isLastSeries: boolean;
  minBarHeight: number;
  perspective: boolean;
  seriesCount: number;
  seriesIndex: number;
  stacked: boolean;
  stackGap: number;
  stackOffsets?: Map<number, Map<string, number>>;
  value: number;
  scale: (value: number) => number | undefined;
}): BarPosition {
  const valuePos = scale(value) ?? 0;
  let barHeight = innerHeight - valuePos;
  const barW = barWidth;
  let y = valuePos;

  if (stacked && stackOffsets) {
    const offset = stackOffsets.get(seriesIndex)?.get(dataKey) ?? 0;
    const offsetY = scale(offset) ?? innerHeight;
    const gapOffset = seriesIndex * stackGap;
    y = offsetY - barHeight - gapOffset;
    if (!isLastSeries && stackGap > 0) {
      barHeight = Math.max(0, barHeight - stackGap);
    }
  }

  const x = stacked
    ? bandPos
    : bandPos + seriesIndex * (barWidth + (seriesCount > 1 ? groupGap : 0));

  let isFloored = false;
  if (!stacked && minBarHeight > 0 && value >= 0 && barHeight < minBarHeight) {
    const baselineY = scale(0) ?? innerHeight;
    barHeight = minBarHeight;
    y = baselineY - minBarHeight;
    isFloored = true;
  }

  if (perspective && value > 0 && !isFloored && (!stacked || isLastSeries)) {
    const baselineY = scale(0) ?? innerHeight;
    const rise = barDepthPerspectiveRise(
      barScale,
      bandWidth,
      barXAccessor,
      innerWidth,
      d,
      y,
      baselineY
    );
    const trim = Math.min(rise, Math.max(0, barHeight - 1));
    y += trim;
    barHeight -= trim;
  }

  return { barHeight, barW, x, y };
}

const BarInner = memo(function BarInnerImpl({
  dataKey,
  yAxisId,
  fill = chartCssVars.linePrimary,
  lineCap = "round",
  animate = true,
  animationType = "grow",
  fadedOpacity = 0.3,
  staggerDelay,
  stackGap = 0,
  groupGap = 4,
  perspective = false,
  minBarHeight = 0,
  barScale,
  bandWidth,
  barXAccessor,
}: BarInnerProps) {
  const {
    data,
    yScale: chartYScale,
    innerHeight,
    innerWidth,
    isLoaded,
    hoveredBarIndex,
    lines,
    orientation,
    stacked: stackedRaw,
    stackOffsets,
    animationDuration,
    enterTransition,
    revealEpoch = 0,
  } = useChart();
  const stacked = stackedRaw ?? false;

  const totalAnimDuration = animationDuration || 1100;
  const staggerSpread = totalAnimDuration * 0.4; // 40% of time for stagger spread
  const calculatedStaggerDelay =
    staggerDelay ?? (data.length > 1 ? staggerSpread / 1000 / data.length : 0);
  const uniqueId = useId();

  const isHorizontal = orientation === "horizontal";

  // Find the index of this bar series among all bar series
  const { hoveredIndex: legendHoveredIndex } = useChartLegendHover();

  const seriesIndex = useMemo(() => {
    const idx = lines.findIndex((l) => l.dataKey === dataKey);
    return idx >= 0 ? idx : 0;
  }, [lines, dataKey]);

  const seriesConfig = lines[seriesIndex];
  const valueScale = useYScale(yAxisId ?? seriesConfig?.yAxisId);

  const isLegendDimmed =
    legendHoveredIndex !== null && legendHoveredIndex !== seriesIndex;

  const seriesCount = lines.length;
  const isLastSeries = seriesIndex === seriesCount - 1;

  const barWidth = useMemo(() => {
    if (!bandWidth || seriesCount === 0) {
      return 0;
    }
    if (stacked) {
      // Stacked bars use full band width
      return bandWidth;
    }
    // Leave a gap between grouped bars (controlled by groupGap prop)
    const effectiveGroupGap = seriesCount > 1 ? groupGap : 0;
    return (bandWidth - effectiveGroupGap * (seriesCount - 1)) / seriesCount;
  }, [bandWidth, seriesCount, stacked, groupGap]);

  // top (radius 0) so the 3D lid from `<BarDepthBack>` meets the bar with no
  // gap — rounded corners would leave a wedge, so `perspective` overrides it.
  const cornerRadius = useMemo(() => {
    if (perspective) {
      return 0;
    }
    if (typeof lineCap === "number") {
      return lineCap;
    }
    if (lineCap === "round" && barWidth) {
      return Math.min(barWidth / 2, 8);
    }
    return 0;
  }, [lineCap, barWidth, perspective]);

  return (
    <g className={`bar-series-${uniqueId}`}>
      {data.map((d, i) => {
        const value = d[dataKey];
        if (typeof value !== "number") {
          return null;
        }

        const categoryValue = barXAccessor(d);
        const bandPos = barScale(categoryValue) ?? 0;

        const pos = isHorizontal
          ? computeHorizontalBarPosition({
              bandPos,
              barWidth,
              dataKey,
              groupGap,
              isLastSeries,
              scale: chartYScale,
              seriesCount,
              seriesIndex,
              stacked,
              stackGap,
              stackOffsets,
              value,
            })
          : computeVerticalBarPosition({
              bandPos,
              bandWidth,
              barScale,
              barWidth,
              barXAccessor,
              d,
              dataKey,
              groupGap,
              innerHeight,
              innerWidth,
              isLastSeries,
              minBarHeight,
              perspective,
              scale: valueScale,
              seriesCount,
              seriesIndex,
              stacked,
              stackGap,
              stackOffsets,
              value,
            });

        const { x, y, barHeight, barW } = pos;

        const isFaded =
          (hoveredBarIndex !== null && hoveredBarIndex !== i) || isLegendDimmed;

        const barKey = `bar-${dataKey}-${categoryValue}`;

        // Apply rounded corners:
        // - For non-stacked: always apply
        // - For stacked with gap: apply to all bars
        // - For stacked without gap: only apply to the last series
        const applyRounding = !stacked || stackGap > 0 || isLastSeries;
        const effectiveRx = applyRounding ? cornerRadius : 0;
        const effectiveRy = applyRounding ? cornerRadius : 0;

        if (animate && !isLoaded) {
          return (
            <AnimatedBar
              animationType={animationType}
              enterTransition={enterTransition}
              fadedOpacity={fadedOpacity}
              fill={fill}
              height={barHeight}
              index={i}
              innerHeight={innerHeight}
              isFaded={isFaded}
              isHorizontal={isHorizontal}
              key={barKey}
              revealEpoch={revealEpoch}
              rx={effectiveRx}
              ry={effectiveRy}
              staggerDelay={calculatedStaggerDelay}
              width={barW}
              x={x}
              y={y}
            />
          );
        }

        return (
          <rect
            fill={fill}
            height={barHeight}
            key={barKey}
            opacity={isFaded ? fadedOpacity : 1}
            rx={effectiveRx}
            ry={effectiveRy}
            style={{
              cursor: "default",
              transition: "opacity 0.15s ease-in-out",
            }}
            width={barW}
            x={x}
            y={y}
          />
        );
      })}
    </g>
  );
});

export function Bar(props: BarProps) {
  const { barScale, bandWidth, barXAccessor } = useChartStable();

  if (!(barScale && bandWidth && barXAccessor)) {
    console.warn("Bar component must be used within a BarChart");
    return null;
  }

  return (
    <BarInner
      {...props}
      bandWidth={bandWidth}
      barScale={barScale}
      barXAccessor={barXAccessor}
    />
  );
}

Bar.displayName = "Bar";
