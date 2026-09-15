/**
 * Lightweight blocking-modal gate per §3.10.
 * Wizard/import shells call useBlockingModalGate(true) while mounted.
 * The updater defers the "Restart now" toast while count > 0.
 */
let count = 0;
const listeners = new Set<() => void>();

export function getBlockingModalCount(): number {
  return count;
}

export function isBlockingModalOpen(): boolean {
  return count > 0;
}

export function registerBlockingModal(): () => void {
  count += 1;
  notify();
  return () => {
    count = Math.max(0, count - 1);
    notify();
  };
}

export function subscribeBlockingModal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const l of listeners) {
    l();
  }
}

import { useEffect, useSyncExternalStore } from "react";

export function useBlockingModalGate(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const unregister = registerBlockingModal();
    return unregister;
  }, [active]);
}

export function useIsBlockingModalOpen(): boolean {
  return useSyncExternalStore(
    subscribeBlockingModal,
    isBlockingModalOpen,
    () => false
  );
}
