import * as React from "react";

/**
 * CMIS-UI-05 §3 — relative-time captions refresh every 60s.
 * One shared ticker for the whole board; the tick swaps text only, never motion.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
