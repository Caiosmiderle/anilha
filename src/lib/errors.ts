import { reloadForNewVersion } from './lazyScreen';

/**
 * Errors the app hits on people's phones go to the database (log_client_error), so a
 * broken screen is seen without anyone reporting it. Each distinct error once per
 * page load; kept in memory while offline or signed out, sent when it can be.
 */
interface Pending {
  message: string;
  stack: string | null;
  url: string;
}

const queue: Pending[] = [];
const seen = new Set<string>();

// Expected while offline or on a flaky gym connection: not bugs.
const IGNORE = [
  /Failed to fetch/i,
  /Load failed/i,
  /NetworkError/i,
  /ResizeObserver loop/i,
  /AbortError/i,
  /The user aborted/i,
  // Thrown by scripts of other origins (in-app browsers, extensions): no message, no stack.
  /^Script error\.?$/i,
];

export function reportError(err: unknown): void {
  const message = (err instanceof Error ? err.message : String(err ?? '')).slice(0, 500);
  if (!message || IGNORE.some((re) => re.test(message))) return;
  const stack = err instanceof Error && err.stack ? err.stack.slice(0, 4000) : null;
  const key = `${message}|${stack ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  queue.push({ message, stack, url: window.location.pathname.slice(0, 300) });
  if (queue.length > 20) queue.shift();
  void flush();
}

let flushing = false;

export async function flush(): Promise<void> {
  if (flushing || queue.length === 0 || !navigator.onLine) return;
  flushing = true;
  try {
    const { rpc } = await import('../sync/client');
    while (queue.length) {
      const e = queue[0] as Pending;
      await rpc('log_client_error', {
        p_message: e.message,
        p_stack: e.stack,
        p_url: e.url,
        p_version: __APP_VERSION__,
        p_user_agent: navigator.userAgent.slice(0, 300),
      });
      queue.shift();
    }
  } catch {
    // Signed out or offline: try again later.
  } finally {
    flushing = false;
  }
}

export function installErrorReporting(): void {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
  window.addEventListener('online', () => void flush());
  // A new version was published and an old chunk is gone: reload into the new one, once.
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewVersion()) e.preventDefault();
  });
}
