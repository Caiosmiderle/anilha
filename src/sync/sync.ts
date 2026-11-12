import { useSyncExternalStore } from 'react';
import { getMeta, setMeta, SYNCED_TABLES, type AnilhaDB, type SyncedTable } from '../data/db';
import { currentStore, onAccountChange, onLocalWrite, type CurrentStore } from '../data/store';
import { backendConfigured } from '../lib/env';
import { AccountChangedError, accountRpc, getClient, rpc } from './client';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'signed_out';

interface Snapshot {
  state: SyncState;
  pending: number;
  lastSyncedAt: number | null;
}

let snapshot: Snapshot = { state: 'idle', pending: 0, lastSyncedAt: null };
const listeners = new Set<() => void>();

function setSnapshot(next: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

onAccountChange(() => setSnapshot({ state: 'idle', pending: 0, lastSyncedAt: null }));

export function useSyncStatus(): Snapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}

interface PushResult {
  applied: number;
  stale: number;
  rejected: { table: string; id: string; error: string }[];
}

interface PullResult {
  rows: { table: SyncedTable; row: Record<string, unknown> & { id: string; updated_at: number } }[];
  cursor: number;
  more: boolean;
  /** Newest server_seq of this person's deleted rows the server already dropped. */
  horizon?: number;
}

const BATCH = 200;

async function refreshPending(owner = currentStore()): Promise<void> {
  if (!owner) return;
  const pending = await owner.db.outbox.count();
  if (currentStore() === owner) setSnapshot({ pending });
}

function assertOwner(owner: CurrentStore): void {
  if (currentStore() !== owner) throw new AccountChangedError('A conta mudou.');
}

async function push(owner: CurrentStore): Promise<void> {
  const d = owner.db;
  for (let guard = 0; guard < 100; guard += 1) {
    assertOwner(owner);
    const entries = await d.outbox.orderBy('ts').limit(BATCH).toArray();
    if (entries.length === 0) return;
    const changes: { table: SyncedTable; row: unknown }[] = [];
    for (const e of entries) {
      const row = await d.table(e.table).get(e.id);
      if (row) changes.push({ table: e.table, row });
    }
    const result = await accountRpc<PushResult>(owner, 'sync_push', { changes });
    assertOwner(owner);
    if (result.rejected.length) {
      const log = ((await getMeta<unknown[]>(d, 'sync_rejected')) ?? []).slice(-50);
      await setMeta(d, 'sync_rejected', [...log, ...result.rejected]);
    }
    // Drop only entries that did not change while the request was in flight.
    await d.transaction('rw', d.outbox, async () => {
      for (const e of entries) {
        assertOwner(owner);
        const now = await d.outbox.get(e.key);
        if (now && now.ts === e.ts) await d.outbox.delete(e.key);
      }
    });
    await refreshPending(owner);
  }
}

/**
 * Deleted rows leave the server after 30 days. A phone away for longer never pulled
 * those deletions: drop the local rows the server no longer has. Rows still waiting to
 * go up and built-in exercises (never synced) stay.
 */
export async function dropPurged(
  d: AnilhaDB,
  since: number,
  horizon: number,
  owner?: CurrentStore,
): Promise<void> {
  const done = (await getMeta<number>(d, 'horizon')) ?? 0;
  if (horizon <= done) return;
  if (since > 0 && horizon > since) {
    type ServerIds = Partial<Record<SyncedTable, string[]>>;
    const ids = owner
      ? await accountRpc<ServerIds>(owner, 'sync_ids')
      : await rpc<ServerIds>('sync_ids');
    const tables = SYNCED_TABLES.map((t) => d.table(t));
    await d.transaction('rw', [...tables, d.outbox], async () => {
      for (const t of SYNCED_TABLES) {
        if (owner) assertOwner(owner);
        const keep = new Set(ids[t] ?? []);
        const rows = (await d.table(t).toArray()) as { id: string; updated_at: number }[];
        const drop: string[] = [];
        for (const row of rows) {
          if (keep.has(row.id) || row.updated_at === 0) continue;
          if (await d.outbox.get(`${t}:${row.id}`)) continue;
          drop.push(row.id);
        }
        if (drop.length) await d.table(t).bulkDelete(drop);
      }
    });
  }
  if (owner) assertOwner(owner);
  await setMeta(d, 'horizon', horizon);
}

async function pull(owner: CurrentStore): Promise<void> {
  const d = owner.db;
  for (let guard = 0; guard < 200; guard += 1) {
    assertOwner(owner);
    const since = (await getMeta<number>(d, 'cursor')) ?? 0;
    const result = await accountRpc<PullResult>(owner, 'sync_pull', { since, max_rows: 500 });
    assertOwner(owner);
    if (guard === 0) await dropPurged(d, since, result.horizon ?? 0, owner);
    if (result.rows.length) {
      const tables = SYNCED_TABLES.map((t) => d.table(t));
      await d.transaction('rw', [...tables, d.outbox, d.meta], async () => {
        for (const { table, row } of result.rows) {
          assertOwner(owner);
          if (!SYNCED_TABLES.includes(table)) continue;
          const key = `${table}:${row.id}`;
          const pending = await d.outbox.get(key);
          if (pending) {
            const local = (await d.table(table).get(row.id)) as { updated_at: number } | undefined;
            // Local edit newer than the server copy: keep it, it goes up on the next push.
            if (local && local.updated_at > row.updated_at) continue;
            await d.outbox.delete(key);
          }
          await d.table(table).put(row);
        }
        assertOwner(owner);
        await d.meta.put({ key: 'cursor', value: result.cursor });
      });
    } else {
      assertOwner(owner);
      await setMeta(d, 'cursor', result.cursor);
    }
    if (!result.more) {
      assertOwner(owner);
      await setMeta(d, 'initial_pull_done', true);
      return;
    }
  }
}

interface SyncRun {
  owner: CurrentStore | null;
  promise: Promise<void>;
  again: boolean;
}
let running: SyncRun | null = null;

/** Push local changes, then pull remote ones. Safe to call any time. */
export function syncNow(): Promise<void> {
  const owner = currentStore();
  if (running?.owner === owner) {
    running.again = true;
    return running.promise;
  }
  // A stalled request from an account that signed out must not hold the next
  // account's sync hostage. Its captured token and owner checks keep it isolated.
  const run: SyncRun = { owner, promise: Promise.resolve(), again: false };
  running = run;
  run.promise = Promise.resolve().then(async () => {
    try {
      if (!owner || !backendConfigured()) return;
      await refreshPending(owner);
      assertOwner(owner);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSnapshot({ state: 'offline' });
        return;
      }
      const client = await getClient();
      const { data } = await client.auth.getSession();
      assertOwner(owner);
      if (data.session?.user.id !== owner.userId) {
        setSnapshot({ state: 'signed_out' });
        return;
      }
      setSnapshot({ state: 'syncing' });
      await push(owner);
      await pull(owner);
      await refreshPending(owner);
      assertOwner(owner);
      setSnapshot({ state: 'idle', lastSyncedAt: Date.now() });
    } catch (err) {
      if (!owner || currentStore() !== owner || err instanceof AccountChangedError) return;
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setSnapshot({ state: offline ? 'offline' : 'error' });
      console.warn('[sync]', err);
    } finally {
      if (running === run) {
        running = null;
        if (run.again) void syncNow();
      }
    }
  });
  return run.promise;
}

/** Background sync: after local writes, when back online or in focus, and every minute. */
export function startSyncLoop(): () => void {
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    void refreshPending();
    clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 1500);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow();
  };
  const onOnline = () => void syncNow();
  const onOffline = () => setSnapshot({ state: 'offline' });
  const off = onLocalWrite(soon);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  void syncNow();
  return () => {
    off();
    clearTimeout(debounce);
    clearInterval(timer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
