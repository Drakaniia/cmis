/**
 * The "take a safety copy before destroying data" gate, in one place.
 *
 * Wipe All Data and the updater already did this inline, but permanent Trash
 * purges and Excel imports did not — and an import confirmation even claimed
 * a backup was taken when none was. Purge is irreversible: it hard-DELETEs the
 * item, its batches and its dispensing events, and the only rollback is an
 * in-database snapshot that dies with the database.
 *
 * So the rule is uniform: on the desktop, write a `cmis-manual-*` backup first
 * and refuse the destructive action if that copy fails. Outside the Tauri
 * runtime there is no filesystem, so the layer is inert.
 */

export interface SafetyGateOptions<T> {
  /** The destructive work. Only reached once the copy has landed. */
  action: () => Promise<T>;
  /** Writes the safety copy. */
  backup: () => Promise<unknown>;
  /** False in browser preview and tests, where there is no filesystem. */
  isDesktop: boolean;
}

export type SafetyGateResult<T> =
  | { error?: undefined; ok: true; value: T }
  | { error: string; ok: false; value?: undefined };

export async function runWithSafetyBackup<T>({
  action,
  backup,
  isDesktop,
}: SafetyGateOptions<T>): Promise<SafetyGateResult<T>> {
  if (isDesktop) {
    try {
      await backup();
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      };
    }
  }
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}
