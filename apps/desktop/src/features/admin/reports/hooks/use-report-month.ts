import { useCallback, useMemo, useState } from "react";

import { monthKey, monthLabelForKey, shiftMonthKey } from "@/lib/month";

/**
 * The Stock Report's month selection (D6): session state only — remembered while
 * the app runs, reset to the current month on restart, and never written to the
 * settings store.
 *
 * The forward step is clamped at the current month (D5): there is no future
 * month to report on.
 */
let sessionMonth: string | null = null;

export function useReportMonth() {
  const [month, setMonthState] = useState<string>(
    () => sessionMonth ?? monthKey()
  );

  const commit = useCallback((next: string) => {
    const clamped = next > monthKey() ? monthKey() : next;
    sessionMonth = clamped;
    setMonthState(clamped);
  }, []);

  const stepBack = useCallback(() => {
    setMonthState((previous) => {
      const next = shiftMonthKey(previous, -1);
      sessionMonth = next;
      return next;
    });
  }, []);

  const stepForward = useCallback(() => {
    setMonthState((previous) => {
      const next = shiftMonthKey(previous, 1);
      const clamped = next > monthKey() ? previous : next;
      sessionMonth = clamped;
      return clamped;
    });
  }, []);

  const goToCurrentMonth = useCallback(() => commit(monthKey()), [commit]);

  const monthLabel = useMemo(() => monthLabelForKey(month), [month]);
  const isCurrentMonth = month === monthKey();

  return {
    goToCurrentMonth,
    isCurrentMonth,
    month,
    monthLabel,
    stepBack,
    stepForward,
  };
}
