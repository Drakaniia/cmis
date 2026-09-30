import { useQuery } from "@tanstack/react-query";
import { loadDeviceTag } from "../data/device-tag";

/**
 * The device tag this machine names its own copies after, or `""` until it
 * resolves (and outside Tauri). The Backup tab reads it to mark the copies that
 * came from another machine.
 */
export function useDeviceTag(): string {
  const { data } = useQuery({
    queryFn: loadDeviceTag,
    queryKey: ["backup-device-tag"],
    staleTime: Number.POSITIVE_INFINITY,
  });
  return data ?? "";
}
