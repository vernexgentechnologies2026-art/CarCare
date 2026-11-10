/**
 * After a new release is deployed, a tab opened on the previous release still
 * references the old (now removed) screen chunks. Opening another screen then
 * fails with "Failed to fetch dynamically imported module". Vite reports that
 * as a `vite:preloadError` event; reloading once loads the new release.
 *
 * Guarded so a genuinely broken deployment can't cause a reload loop: at most
 * one automatic reload per minute, after which the normal error screen (with
 * its Reload button) is shown.
 */
const KEY = 'carcare.chunk-reload-at';
const MIN_INTERVAL_MS = 60_000;

export function installChunkRecovery(
  target: Pick<Window, 'addEventListener'> = window,
  reload: () => void = () => window.location.reload(),
  now: () => number = Date.now,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeSessionStorage(),
): void {
  target.addEventListener('vite:preloadError', (event) => {
    const last = Number(storage?.getItem(KEY) ?? 0);
    if (now() - last < MIN_INTERVAL_MS) return; // already tried: let the error screen show
    try {
      storage?.setItem(KEY, String(now()));
    } catch {
      /* storage unavailable: still reload once */
    }
    event.preventDefault();
    reload();
  });
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
