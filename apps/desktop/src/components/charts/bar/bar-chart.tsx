"use client";

import { cn } from "@cmis/ui/lib/utils";
import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import type { Transition } from "motion/react";
import {
  memo,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_ANIMATION_EASING } from "../animation";
import {
  buildYScalesForLines,
  getPrimaryYScale,
  wrapSingleYScale,
} from "../axes/y-axis-scales";
import {
  forEachChartChild,
  isChartClipPassthrough,
  isClipExcludedComponent,
  isPostOverlayComponent,
  isUnderlayComponent,
  renderKeyedChartLayers,
  resolveChartChildElement,
} from "../chart-child-passthrough";
import { ChartProvider, type Margin, type TooltipData } from "../chart-context";
import { isGradientDefComponent, isPatternDefComponent } from "../chart-defs";
import { shortDateFmt } from "../chart-formatters";
import {
  type ChartPhase,
  type ChartStatus,
  DEFAULT_CHART_LIFECYCLE,
  resolveRestingChartPhase,
} from "../chart-phase";
import { BarLoadingSkeleton } from "../loading-sweep";
import { extractReferenceAreaConfigs } from "../patterns/reference-area-config";
import { useScheduledTooltip } from "../use-scheduled-tooltip";
import {
  computeGroupedMax,
  computeStackedMax,
  extractBarConfigs,
} from "./bar-config";
import {
  computeHorizontalPositions,
  computeVerticalPositions,
  type SquareSnap,
} from "./bar-positions";

/** Skeleton bars to show when `status="loading"` and `data` is empty. */
const FALLBACK_LOADING_BARS = 12;

export type BarOrientation = "vertical" | "horizontal";

export interface BarChartProps {
  /** Animation duration in milliseconds. Default: 1100 */
  animationDuration?: number;
  /** CSS easing for bar grow transitions. */
  animationEasing?: string;
  /** Aspect ratio as "width / height". Default: "2 / 1" */
  aspectRatio?: string;
  /** Gap between bar groups as a fraction of band width (0-1). Default: 0.2 */
  barGap?: number;
  /** Fixed bar width in pixels. If not set, bars auto-size to fill the band. */
  barWidth?: number;
  /** Child components (Bar, Grid, ChartTooltip, etc.). Optional — omit for a
   * pure `status="loading"` skeleton. */
  children?: ReactNode;
  /** Additional class name for the container */
  className?: string;
  /** Data array - each item should have an x-axis key and numeric values */
  data: Record<string, unknown>[];
  /** Motion enter transition (spring or cubic-bezier tween). */
  enterTransition?: Transition;
  /** Chart margins */
  margin?: Partial<Margin>;
  /** Reports reveal lifecycle for OG screenshots and loading orchestration. */
  onPhaseChange?: (phase: ChartPhase) => void;
  /** Bar chart orientation. Default: "vertical" */
  orientation?: BarOrientation;
  /** Signature of motion URL state — triggers enter replay when it changes. */
  revealSignature?: string;
  /** When set, tooltip Y positions snap to the top square center (shape variant). */
  squareSnap?: SquareSnap;
  /** Whether to stack bars instead of grouping them. Default: false */
  stacked?: boolean;
  /** Gap between stacked bar segments in pixels. Default: 0 */
  stackGap?: number;
  /** Fetch / display status. When `"loading"`, a shimmer skeleton replaces the
   * bars (no chart data required). Default: `"ready"`. */
  status?: ChartStatus;
  /** Key in data for the categorical axis. Default: "name" */
  xDataKey?: string;
}

const DEFAULT_MARGIN: Margin = { bottom: 40, left: 40, right: 40, top: 40 };

interface ChartInnerProps {
  animationDuration: number;
  animationEasing: string;
  barGap: number;
  barWidthProp?: number;
  children: ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
  data: Record<string, unknown>[];
  enterTransition?: Transition;
  height: number;
  margin: Margin;
  onPhaseChange?: (phase: ChartPhase) => void;
  orientation: BarOrientation;
  revealSignature?: string;
  squareSnap?: SquareSnap;
  stacked: boolean;
  stackGap: number;
  status: ChartStatus;
  width: number;
  xDataKey: string;
}

function ChartInner(props: ChartInnerProps) {
  const { width, height } = props;
  if (width < 10 || height < 10) {
    return null;
  }
  return <ChartCore {...props} />;
}

const ChartCore = memo(function ChartCoreMemo({
  width,
  height,
  data,
  xDataKey,
  margin,
  animationDuration,
  animationEasing,
  enterTransition,
  revealSignature = "",
  barGap,
  barWidthProp,
  orientation,
  stacked,
  stackGap,
  squareSnap,
  children,
  containerRef,
  onPhaseChange,
  status,
}: ChartInnerProps) {
  const { tooltipData, setTooltipData, scheduleTooltip, clearTooltip } =
    useScheduledTooltip<TooltipData>();
  const [isLoaded, setIsLoaded] = useState(false);
  const [revealEpoch, setRevealEpoch] = useState(0);
  const hoveredBarIndex = tooltipData?.index ?? null;

  const isHorizontal = orientation === "horizontal";

  const lines = useMemo(() => extractBarConfigs(children), [children]);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const categoryAccessor = useCallback(
    (d: Record<string, unknown>): string => {
      const value = d[xDataKey];
      if (value instanceof Date) {
        return shortDateFmt.format(value);
      }
      return String(value ?? "");
    },
    [xDataKey]
  );

  const xAccessorDate = useCallback(
    (d: Record<string, unknown>): Date => {
      const value = d[xDataKey];
      if (value instanceof Date) {
        return value;
      }
      return new Date();
    },
    [xDataKey]
  );

  const categoryScale = useMemo(() => {
    const domain = data.map((d) => categoryAccessor(d));
    const range: [number, number] = isHorizontal
      ? [0, innerHeight]
      : [0, innerWidth];
    return scaleBand<string>({
      domain,
      padding: barGap,
      range,
    });
  }, [innerWidth, innerHeight, data, categoryAccessor, barGap, isHorizontal]);

  const bandWidth = barWidthProp ?? categoryScale.bandwidth();

  const maxValue = useMemo(() => {
    const max = stacked
      ? computeStackedMax(data, lines)
      : computeGroupedMax(data, lines);
    return max || 100;
  }, [data, lines, stacked]);

  const valueScale = useMemo(() => {
    const range = isHorizontal ? [0, innerWidth] : [innerHeight, 0];
    return scaleLinear({
      domain: [0, maxValue * 1.1],
      nice: true,
      range,
    });
  }, [innerWidth, innerHeight, maxValue, isHorizontal]);

  const yScales = useMemo(() => {
    if (isHorizontal) {
      return wrapSingleYScale(valueScale);
    }
    return buildYScalesForLines({
      data,
      innerHeight,
      lines,
      resolveDomain: (dataKeys) => {
        let max = 0;
        for (const d of data) {
          for (const key of dataKeys) {
            const value = d[key];
            if (typeof value === "number" && value > max) {
              max = value;
            }
          }
        }
        return [0, (max || 100) * 1.1];
      },
    });
  }, [data, innerHeight, isHorizontal, lines, valueScale]);

  const primaryYScale = getPrimaryYScale(yScales, valueScale);

  const stackOffsets = useMemo(() => {
    if (!stacked) {
      return;
    }
    const offsets = new Map<number, Map<string, number>>();
    for (let i = 0; i < data.length; i += 1) {
      const d = data[i];
      if (!d) {
        continue;
      }
      const pointOffsets = new Map<string, number>();
      let cumulative = 0;
      for (const line of lines) {
        pointOffsets.set(line.dataKey, cumulative);
        const value = d[line.dataKey];
        if (typeof value === "number") {
          cumulative += value;
        }
      }
      offsets.set(i, pointOffsets);
    }
    return offsets;
  }, [data, lines, stacked]);

  const columnWidth = useMemo(() => {
    if (data.length < 1) {
      return 0;
    }
    return isHorizontal ? innerHeight / data.length : innerWidth / data.length;
  }, [innerWidth, innerHeight, data.length, isHorizontal]);

  const dateLabels = useMemo(
    () => data.map((d) => categoryAccessor(d)),
    [data, categoryAccessor]
  );

  const fakeTimeScale = useMemo(() => {
    const now = Date.now();
    const start = now - data.length * 24 * 60 * 60 * 1000;
    const scale = {
      ...categoryScale,
      copy: () => scale,
      domain: () => [new Date(start), new Date(now)],
      invert: (x: number) => new Date(start + (x / innerWidth) * (now - start)),
      range: () => [0, innerWidth] as [number, number],
    };
    return scale;
  }, [categoryScale, innerWidth, data.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revealSignature
  useEffect(() => {
    setRevealEpoch((n) => n + 1);
    setIsLoaded(false);
    // While loading, hold the skeleton (no reveal, no interaction). When
    // status flips to "ready" this effect re-runs and plays the grow reveal.
    if (status === "loading") {
      return;
    }
    const staggerMs = data.length > 1 ? animationDuration * 0.4 : 0;
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, animationDuration + staggerMs);
    return () => clearTimeout(timer);
  }, [animationDuration, revealSignature, status]);

  useEffect(() => {
    onPhaseChange?.(isLoaded ? "ready" : "revealing");
  }, [isLoaded, onPhaseChange]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGGElement>) => {
      const point = localPoint(event);
      if (!point) {
        return;
      }

      const pos = isHorizontal ? point.y - margin.top : point.x - margin.left;
      const bandIndex = Math.floor(pos / columnWidth);
      const clampedIndex = Math.max(0, Math.min(data.length - 1, bandIndex));
      const d = data[clampedIndex];

      if (!d) {
        return;
      }

      const barPos = categoryScale(categoryAccessor(d)) ?? 0;
      const positions = isHorizontal
        ? computeHorizontalPositions(
            d,
            lines,
            yScales,
            valueScale,
            barPos,
            bandWidth,
            stacked
          )
        : computeVerticalPositions(
            d,
            lines,
            yScales,
            primaryYScale,
            barPos,
            bandWidth,
            stacked,
            stackGap,
            squareSnap,
            innerHeight
          );

      const tooltipX = isHorizontal
        ? Math.max(...Object.values(positions.xPositions), 0)
        : barPos + bandWidth / 2;

      scheduleTooltip({
        index: clampedIndex,
        point: d,
        x: tooltipX,
        xPositions:
          Object.keys(positions.xPositions).length > 0
            ? positions.xPositions
            : undefined,
        yPositions: positions.yPositions,
      });
    },
    [
      categoryScale,
      valueScale,
      data,
      lines,
      margin.left,
      margin.top,
      categoryAccessor,
      columnWidth,
      bandWidth,
      isHorizontal,
      stacked,
      stackGap,
      scheduleTooltip,
      yScales,
      primaryYScale,
      squareSnap,
      innerHeight,
    ]
  );

  const handleMouseLeave = useCallback(() => {
    clearTooltip();
  }, [clearTooltip]);

  const canInteract = isLoaded;

  const defsChildren: ReactElement[] = [];
  const clipExcludedChildren: ReactElement[] = [];
  const underlayChildren: ReactElement[] = [];
  const preOverlayChildren: ReactElement[] = [];
  const postOverlayChildren: ReactElement[] = [];

  forEachChartChild(children, (child) => {
    const resolvedChild = resolveChartChildElement(child);

    if (isGradientDefComponent(child)) {
      defsChildren.push(child);
    } else if (isPatternDefComponent(child)) {
      preOverlayChildren.push(child);
    } else if (isPostOverlayComponent(resolvedChild)) {
      postOverlayChildren.push(resolvedChild);
    } else if (isClipExcludedComponent(resolvedChild)) {
      clipExcludedChildren.push(
        isChartClipPassthrough(child.type) ? resolvedChild : child
      );
    } else if (isUnderlayComponent(resolvedChild)) {
      underlayChildren.push(resolvedChild);
    } else {
      preOverlayChildren.push(child);
    }
  });

  const referenceAreas = useMemo(
    () => extractReferenceAreaConfigs(children),
    [children]
  );

  const contextValue = {
    ...DEFAULT_CHART_LIFECYCLE,
    animationDuration,
    animationEasing,
    bandWidth,
    barScale: categoryScale,
    barXAccessor: categoryAccessor,
    chartPhase: resolveRestingChartPhase(status),
    chartStatus: status,
    columnWidth,
    containerRef,
    data,
    dateLabels,
    enterTransition,
    height,
    hoveredBarIndex,
    innerHeight,
    innerWidth,
    isLoaded,
    lines,
    margin,
    orientation,
    referenceAreas,
    renderData: data,
    revealEpoch,
    setTooltipData,
    squareSnap,
    stacked,
    stackOffsets,
    tooltipData,
    width,
    xAccessor: xAccessorDate,
    xScale: fakeTimeScale as unknown as ReturnType<
      typeof import("@visx/scale").scaleTime<number>
    >,
    yScale: isHorizontal ? valueScale : primaryYScale,
    yScales,
  };

  return (
    <ChartProvider value={contextValue}>
      <svg
        aria-hidden="true"
        className="overflow-visible"
        height={height}
        width={width}
      >
        {/* Gradient and pattern definitions */}
        {defsChildren.length > 0 && <defs>{defsChildren}</defs>}

        <rect fill="transparent" height={height} width={width} x={0} y={0} />

        {/* biome-ignore lint/a11y/noStaticElementInteractions: Chart interaction area */}
        <g
          onMouseLeave={canInteract ? handleMouseLeave : undefined}
          onMouseMove={canInteract ? handleMouseMove : undefined}
          style={{ cursor: canInteract ? "crosshair" : "default" }}
          transform={`translate(${margin.left},${margin.top})`}
        >
          {/* Background rect for mouse event detection */}
          <rect
            fill="transparent"
            height={innerHeight}
            width={innerWidth}
            x={0}
            y={0}
          />

          {renderKeyedChartLayers(clipExcludedChildren)}
          {renderKeyedChartLayers(underlayChildren)}
          {status === "loading" ? (
            <BarLoadingSkeleton
              barCount={data.length || FALLBACK_LOADING_BARS}
              innerHeight={innerHeight}
              innerWidth={innerWidth}
            />
          ) : (
            renderKeyedChartLayers(preOverlayChildren)
          )}

          {/* Markers rendered last so they're on top for interaction */}
          {renderKeyedChartLayers(postOverlayChildren)}
        </g>
      </svg>
    </ChartProvider>
  );
});

export function BarChart({
  data,
  xDataKey = "name",
  margin: marginProp,
  animationDuration = 1100,
  animationEasing = DEFAULT_ANIMATION_EASING,
  enterTransition,
  revealSignature,
  aspectRatio = "2 / 1",
  className = "",
  barGap = 0.2,
  barWidth,
  orientation = "vertical",
  stacked = false,
  stackGap = 0,
  squareSnap,
  children,
  onPhaseChange,
  status = "ready",
}: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const margin = { ...DEFAULT_MARGIN, ...marginProp };

  return (
    <div
      className={cn("relative w-full overflow-visible", className)}
      ref={containerRef}
      style={{ aspectRatio }}
    >
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <ChartInner
            animationDuration={animationDuration}
            animationEasing={animationEasing}
            barGap={barGap}
            barWidthProp={barWidth}
            containerRef={containerRef}
            data={data}
            enterTransition={enterTransition}
            height={height}
            margin={margin}
            onPhaseChange={onPhaseChange}
            orientation={orientation}
            revealSignature={revealSignature}
            squareSnap={squareSnap}
            stacked={stacked}
            stackGap={stackGap}
            status={status}
            width={width}
            xDataKey={xDataKey}
          >
            {children}
          </ChartInner>
        )}
      </ParentSize>
    </div>
  );
}

BarChart.displayName = "BarChart";
