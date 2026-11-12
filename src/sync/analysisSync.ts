/**
 * Analyses ('analysis:<session>') and ficha reviews ('review:<routine>') follow the account
 * between the iPhone and the site through the analysis_sync table. Undo snapshots never leave
 * the device that saved: they hold full rows and only that device can check them.
 *
 * Order per run: push what changed here since the last sync, then pull. The server keeps the
 * newest write (client clock). A local edit made while the run was in flight is not
 * overwritten by the pull: it goes up on the next run with a newer stamp.
 */
import type { AnilhaDB } from '../data/db';
import type { CurrentStore } from '../data/store';

export const SYNCED_PREFIXES = ['analysis:', 'review:'] as const;
const hashKey = (key: string) => `analysis-sync-hash:${key}`;
const CURSOR = 'analysis-sync-cursor';
type Value = Record<string, unknown>;
type Rpc = <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
interface PullPage {
  rows: { id: string; payload: Value; updated_at: number }[];
  cursor: number;
  more: boolean;
}

export const syncedKey = (key: string) => SYNCED_PREFIXES.some((p) => key.startsWith(p));

const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, sorted(v)]),
        )
      : value;
export const stableText = (value: unknown) => JSON.stringify(sorted(value));

/** What leaves the device: everything but undo snapshots (top level and per decision). */
export function syncPayload(value: Value): Value {
  const { undo: _undo, ...rest } = value;
  if (Array.isArray(rest.decisions))
    rest.decisions = rest.decisions.map((d) => {
      if (!d || typeof d !== 'object') return d;
      const { undo: _u, ...keep } = d as Value;
      return keep;
    });
  return rest;
}

/** The pulled payload, keeping this device's undo where the status still matches. */
export function mergePulled(remote: Value, local: Value | undefined): Value {
  if (!local) return remote;
  const out: Value = { ...remote };
  if (local.undo && local.status === remote.status) out.undo = local.undo;
  if (Array.isArray(remote.decisions) && Array.isArray(local.decisions)) {
    const mine = local.decisions as Value[];
    out.decisions = (remote.decisions as Value[]).map((d, i) =>
      mine[i]?.undo && mine[i]?.status === d?.status ? { ...d, undo: mine[i]!.undo } : d,
    );
  }
  return out;
}

export async function syncAnalyses(
  d: AnilhaDB,
  call: Rpc,
  check: () => void = () => {},
  now = () => Date.now(),
): Promise<void> {
  const entries = (await d.meta.toArray()).filter((e) => syncedKey(e.key));
  const hashes = new Map(
    (await d.meta.where('key').startsWith('analysis-sync-hash:').toArray()).map((e) => [
      e.key.slice('analysis-sync-hash:'.length),
      e.value as string,
    ]),
  );
  const changed = entries
    .map((e) => ({ key: e.key, payload: syncPayload(e.value as Value) }))
    .filter((e) => hashes.get(e.key) !== stableText(e.payload));
  for (let i = 0; i < changed.length; i += 50) {
    const batch = changed.slice(i, i + 50);
    const stamp = now();
    await call('analysis_push', {
      items: batch.map((e) => ({ id: e.key, payload: e.payload, updated_at: stamp })),
    });
    check();
    // Kept or not, this content was offered: the pull brings the winner either way.
    await d.meta.bulkPut(batch.map((e) => ({ key: hashKey(e.key), value: stableText(e.payload) })));
  }
  for (let guard = 0; guard < 100; guard += 1) {
    const since = ((await d.meta.get(CURSOR))?.value as number | undefined) ?? 0;
    const page = await call<PullPage>('analysis_pull', { since, max_rows: 200 });
    check();
    await d.transaction('rw', d.meta, async () => {
      for (const row of page.rows) {
        if (!syncedKey(row.id)) continue;
        const local = (await d.meta.get(row.id))?.value as Value | undefined;
        const synced = (await d.meta.get(hashKey(row.id)))?.value as string | undefined;
        // Changed here after the last sync and different from the server: keep, push next run.
        const mine = local ? stableText(syncPayload(local)) : undefined;
        if (local && mine !== synced && mine !== stableText(row.payload)) continue;
        await d.meta.put({ key: row.id, value: mergePulled(row.payload, local) });
        await d.meta.put({ key: hashKey(row.id), value: stableText(row.payload) });
      }
      await d.meta.put({ key: CURSOR, value: page.cursor });
    });
    if (!page.more) return;
  }
}

/** Bound to the signed-in account; a failure here never stops the main sync. */
export async function syncAnalysesFor(owner: CurrentStore, assertOwner: () => void): Promise<void> {
  const { accountRpc } = await import('./client');
  await syncAnalyses(owner.db, (fn, args) => accountRpc(owner, fn, args), assertOwner);
}
