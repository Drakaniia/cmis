import { useQuery } from "@tanstack/react-query";

import { getDb } from "@/lib/db";
import { loadSystemHealth, type SystemHealth } from "../data/system-health";

export const SYSTEM_HEALTH_KEY = "system-health";

/**
 * The health cards, read from the database. Cached briefly so flipping between
 * the Health page and its Settings tab does not re-run the probe, but short
 * enough that a VACUUM or backup shows a fresh size/date on the next look.
 */
export function useSystemHealth() {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<SystemHealth> => loadSystemHealth(await getDb()),
    queryKey: [SYSTEM_HEALTH_KEY],
    retry: false,
    staleTime: 15_000,
  });
}
