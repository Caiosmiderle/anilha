import { lazy, type ComponentType } from 'react';

/**
 * A new version went out while the app was open and the files of the old one are gone:
 * opening a screen that was not loaded yet fails. The app reloads once into the new
 * version; a second failure within a minute is a real error (offline, broken deploy) and
 * goes to the error screen instead of reloading in a loop.
 */
const KEY = 'anilha-reload-at';
let reloading = false;

export function reloadForNewVersion(): boolean {
  if (reloading) return true;
  if (typeof window === 'undefined' || !navigator.onLine) return false;
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Without storage there is no guard against a loop: no reload.
    return false;
  }
  reloading = true;
  window.location.reload();
  return true;
}

/** Loads a part of the app; if its file is gone after a deploy, reloads instead of breaking. */
export async function loadModule<M>(load: () => Promise<M>): Promise<M> {
  let mod: M | undefined;
  try {
    mod = await load();
  } catch (err) {
    if (reloadForNewVersion()) return new Promise<M>(() => {});
    throw err;
  }
  // Vite resolves to nothing when its preload error was handled by a reload.
  if (mod == null) {
    if (reloadForNewVersion()) return new Promise<M>(() => {});
    throw new Error('Parte do app não carregou');
  }
  return mod;
}

/** React.lazy that survives a deploy: `lazyScreen(() => import('./Plan'), (m) => m.default)`. */
export function lazyScreen<M, P extends object>(
  load: () => Promise<M>,
  pick: (m: M) => ComponentType<P>,
) {
  return lazy(async () => ({ default: pick(await loadModule(load)) }));
}
