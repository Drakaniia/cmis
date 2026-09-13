"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LINE_LOADING_PULSE_EASE } from "./line/line-loading-timing";
import {
  computeSeriesPathPoints,
  interpolateSeriesPathPoints,
  type SeriesPathPoint,
  seriesPathFromPoints,
  seriesPathTransitionSignature,
} from "./series/series-path-utils";

// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

export interface UseAnimatedSeriesPathOptions {
  chartPhase: string;
  curve: CurveFactory;
  dataKey: string;
  durationMs: number;
  enabled: boolean;
  innerWidth: number;
  renderData: Record<string, unknown>[];
  xAccessor: (datum: Record<string, unknown>) => Date;
  xScale: (value: Date) => number | undefined;
  yScale: (value: number) => number | undefined;
}

export function useAnimatedSeriesPath({
  renderData,
  xAccessor,
  xScale,
  yScale,
  dataKey,
  curve,
  chartPhase,
  durationMs,
  innerWidth,
  enabled,
}: UseAnimatedSeriesPathOptions) {
  const reducedMotion = useReducedMotion();
  const [animatedPoints, setAnimatedPoints] = useState<
    SeriesPathPoint[] | null
  >(null);
  const displayedPointsRef = useRef<SeriesPathPoint[] | null>(null);
  const animatingRef = useRef(false);

  const xScaleDomain = useMemo(() => {
    const scaleWithDomain = xScale as { domain?: () => [Date, Date] };
    return scaleWithDomain.domain?.() ?? [new Date(0), new Date(0)];
  }, [xScale]);

  const transitionSignature = useMemo(
    () =>
      seriesPathTransitionSignature({
        dataKey,
        innerWidth,
        renderData,
        xAccessor,
        xDomainMax: xScaleDomain[1].getTime() ?? 0,
        xDomainMin: xScaleDomain[0].getTime() ?? 0,
      }),
    [renderData, xAccessor, dataKey, innerWidth, xScaleDomain]
  );

  const targetPoints = useMemo(
    () =>
      computeSeriesPathPoints(renderData, xAccessor, xScale, yScale, dataKey),
    [renderData, xAccessor, xScale, yScale, dataKey]
  );

  const prevTransitionSignatureRef = useRef(transitionSignature);

  useEffect(() => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: animatingRef.current toggles between true/false at runtime
    if (!animatingRef.current) {
      displayedPointsRef.current = targetPoints;
    }
  }, [targetPoints]);

  useEffect(() => {
    const shouldAnimate =
      enabled &&
      !reducedMotion &&
      chartPhase === "ready" &&
      durationMs > 0 &&
      renderData.length > 0;

    if (!shouldAnimate) {
      animatingRef.current = false;
      setAnimatedPoints(null);
      displayedPointsRef.current = targetPoints;
      prevTransitionSignatureRef.current = transitionSignature;
      return;
    }

    if (prevTransitionSignatureRef.current === transitionSignature) {
      return;
    }
    prevTransitionSignatureRef.current = transitionSignature;

    const fromPoints = displayedPointsRef.current ?? targetPoints;
    if (fromPoints.length === 0) {
      displayedPointsRef.current = targetPoints;
      return;
    }

    animatingRef.current = true;
    const fromSnapshot = fromPoints;

    const control = animate(0, 1, {
      duration: durationMs / 1000,
      ease: [...LINE_LOADING_PULSE_EASE],
      onComplete: () => {
        animatingRef.current = false;
        displayedPointsRef.current = targetPoints;
        setAnimatedPoints(null);
      },
      onUpdate: (progress) => {
        const currentTarget = computeSeriesPathPoints(
          renderData,
          xAccessor,
          xScale,
          yScale,
          dataKey
        );
        const next = interpolateSeriesPathPoints(
          fromSnapshot,
          currentTarget,
          progress
        );
        displayedPointsRef.current = next;
        setAnimatedPoints(next);
      },
    });

    return () => {
      control.stop();
      animatingRef.current = false;
    };
  }, [
    transitionSignature,
    chartPhase,
    durationMs,
    enabled,
    reducedMotion,
    renderData,
    xAccessor,
    xScale,
    yScale,
    dataKey,
    targetPoints,
  ]);

  const activePoints = animatedPoints ?? targetPoints;
  const pathD = useMemo(
    () => seriesPathFromPoints(activePoints, curve),
    [activePoints, curve]
  );

  return {
    isPathAnimating: animatedPoints !== null,
    pathD,
  };
}
