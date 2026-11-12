import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AnilhaDB } from '../data/db';
import { currentStore, onAccountChange, type CurrentStore } from '../data/store';
import { backendConfigured } from '../lib/env';
import { accountRpc } from './client';

const caches = new WeakMap<AnilhaDB, Map<string, unknown>>();

function cacheFor(owner: CurrentStore | null): Map<string, unknown> | undefined {
  if (!owner) return undefined;
  let cache = caches.get(owner.db);
  if (!cache) {
    cache = new Map();
    caches.set(owner.db, cache);
  }
  return cache;
}

export interface Remote<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  offline: boolean;
  refresh: () => Promise<void>;
}

/**
 * Server-only reads (friends, groups). Shows the last answer right away and refreshes
 * when online; offline it says so instead of failing.
 */
export function useRemote<T>(fn: string, args: Record<string, unknown>, enabled = true): Remote<T> {
  const owner = useSyncExternalStore(onAccountChange, currentStore, currentStore);
  const key = `${fn}:${JSON.stringify(args)}`;
  const cached = (): Omit<Remote<T>, 'refresh'> & { owner: CurrentStore | null; key: string } => ({
    owner,
    key,
    data: cacheFor(owner)?.get(key) as T | undefined,
    error: null,
    loading: false,
    offline: typeof navigator !== 'undefined' && !navigator.onLine,
  });
  const [state, setState] = useState(cached);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!owner || currentStore() !== owner || !enabled || !backendConfigured()) return;
    const version = ++request.current;
    if (!navigator.onLine) {
      setState((s) => ({
        ...s,
        owner,
        key,
        data:
          s.owner === owner && s.key === key
            ? s.data
            : (cacheFor(owner)?.get(key) as T | undefined),
        error: null,
        offline: true,
        loading: false,
      }));
      return;
    }
    const active = () => currentStore() === owner && request.current === version;
    setState((s) => ({
      ...s,
      owner,
      key,
      data:
        s.owner === owner && s.key === key ? s.data : (cacheFor(owner)?.get(key) as T | undefined),
      error: null,
      offline: false,
      loading: true,
    }));
    try {
      const result = await accountRpc<T>(
        owner,
        fn,
        JSON.parse(key.slice(fn.length + 1)) as Record<string, unknown>,
      );
      if (!active()) return;
      cacheFor(owner)?.set(key, result);
      setState({ owner, key, data: result, error: null, loading: false, offline: false });
    } catch (err) {
      if (active()) setState((s) => ({ ...s, error: (err as Error).message || 'erro' }));
    } finally {
      if (active()) setState((s) => ({ ...s, loading: false }));
    }
  }, [enabled, fn, key, owner]);

  useEffect(() => {
    setState({
      owner,
      key,
      data: cacheFor(owner)?.get(key) as T | undefined,
      error: null,
      loading: false,
      offline: !navigator.onLine,
    });
    void refresh();
    const online = () => void refresh();
    window.addEventListener('online', online);
    return () => {
      request.current += 1;
      window.removeEventListener('online', online);
    };
  }, [key, owner, refresh]);

  // An account/key change must hide the previous answer during the render itself,
  // before effects run; an offline account never briefly sees another account's data.
  return { ...(state.owner === owner && state.key === key ? state : cached()), refresh };
}

export function invalidateRemote(prefix: string): void {
  const cache = cacheFor(currentStore());
  if (cache) for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
