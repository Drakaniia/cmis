/**
 * This machine's backup device tag — `deped-4f2a`, for instance.
 *
 * The tag is generated and kept by Rust (`backup_device_tag`, in the app data
 * folder, never in the shared backup folder), so a machine keeps the same tag
 * across launches and store resets and two machines keep different ones even
 * when they were imaged from the same install.
 *
 * Naming the day's copy after the device is what stops two machines that share
 * one backup folder from adopting each other's file: the untagged name is the
 * same on both, so the second machine would find the first's copy, treat it as
 * its own, and report protection over data it does not hold.
 */

import { isTauriRuntime } from "@/lib/open-external";
import { invoke } from "@/lib/tauri";

let cachedTag: string | null = null;
let inFlight: Promise<string> | null = null;

/**
 * Resolved once per session. A failure is not cached: the next run asks again,
 * and the untagged name is used until it answers so that a hiccup in app data
 * costs a name, not a backup.
 */
export function loadDeviceTag(): Promise<string> {
  if (cachedTag !== null) {
    return Promise.resolve(cachedTag);
  }
  if (!isTauriRuntime()) {
    return Promise.resolve("");
  }
  inFlight ??= invoke<string>("backup_device_tag")
    .then((tag) => {
      cachedTag = tag;
      return tag;
    })
    .catch(() => {
      inFlight = null;
      return "";
    });
  return inFlight;
}

/** Tests only. */
export function __resetDeviceTagForTests(): void {
  cachedTag = null;
  inFlight = null;
}
