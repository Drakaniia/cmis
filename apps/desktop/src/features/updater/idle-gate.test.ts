import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetIdleTrackingForTests,
  IDLE_THRESHOLD_MS,
  isAppIdle,
  startIdleTracking,
  subscribeIdle,
} from "./idle-gate";

const THRESHOLD = 5000;

describe("idle-gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    __resetIdleTrackingForTests();
  });

  afterEach(() => {
    __resetIdleTrackingForTests();
    vi.useRealTimers();
  });

  function track() {
    return startIdleTracking(THRESHOLD);
  }

  it("defaults to a five-minute window", () => {
    expect(IDLE_THRESHOLD_MS).toBe(300_000);
  });

  it("reports active for the whole threshold after tracking starts", () => {
    track();
    vi.advanceTimersByTime(THRESHOLD - 1);
    expect(isAppIdle()).toBe(false);
  });

  it("goes idle once the threshold elapses with no input", () => {
    track();
    vi.advanceTimersByTime(THRESHOLD);
    expect(isAppIdle()).toBe(true);
  });

  it.each([
    ["pointerdown", new MouseEvent("pointerdown")],
    ["keydown", new KeyboardEvent("keydown", { key: "a" })],
    ["wheel", new WheelEvent("wheel")],
  ])("treats %s as activity that restarts the countdown", (_name, event) => {
    track();
    vi.advanceTimersByTime(THRESHOLD - 100);
    window.dispatchEvent(event);
    vi.advanceTimersByTime(100);
    expect(isAppIdle()).toBe(false);
  });

  it("counts pointer movement as activity", () => {
    track();
    vi.advanceTimersByTime(THRESHOLD - 100);
    window.dispatchEvent(new MouseEvent("pointermove"));
    vi.advanceTimersByTime(100);
    expect(isAppIdle()).toBe(false);
  });

  it("throttles pointer movement so a resting mouse cannot hold the app open forever", () => {
    track();
    vi.advanceTimersByTime(1000);
    // Accepted, so the deadline moves to t=6000.
    window.dispatchEvent(new MouseEvent("pointermove"));
    vi.advanceTimersByTime(100);
    // Inside the throttle window this one is dropped, so the deadline stays.
    window.dispatchEvent(new MouseEvent("pointermove"));

    vi.advanceTimersByTime(4899);
    expect(isAppIdle()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(isAppIdle()).toBe(true);
  });

  it("notifies on both transitions into and out of idle", () => {
    const listener = vi.fn();
    track();
    const unsubscribe = subscribeIdle(listener);

    vi.advanceTimersByTime(THRESHOLD);
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    vi.advanceTimersByTime(THRESHOLD);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores focus and blur — an open background window still counts as idle", () => {
    track();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(THRESHOLD);
    expect(isAppIdle()).toBe(true);
  });

  it("stops counting once tracking is torn down", () => {
    const stop = track();
    stop();
    vi.advanceTimersByTime(THRESHOLD * 10);
    expect(isAppIdle()).toBe(false);
  });

  it("returns the same teardown when tracking is already running", () => {
    expect(track()).toBe(track());
  });
});
