/**
 * The phone side of LGPD: a phone away for more than 30 days drops what the server
 * already purged, and revoking health consent cleans this phone without queuing uploads.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, type AnilhaDB } from '../../data/db';

vi.mock('../client', () => ({ rpc: vi.fn(), getClient: vi.fn() }));
const { rpc } = await import('../client');
const { dropPurged } = await import('../sync');
const { countHealthLocal, wipeHealthLocal } = await import('../consent');

let d: AnilhaDB;
let n = 0;

beforeEach(async () => {
  n += 1;
  d = openDb(`teste-${n}`);
  await d.open();
  vi.mocked(rpc).mockReset();
});

afterEach(async () => {
  d.close();
  await d.delete();
});

// Dexie does not check shapes: rows carry only what the code reads.
const row = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, user_id: 'u', updated_at: 100, deleted: false, ...extra }) as never;

describe('aparelho atrasado', () => {
  it('apaga o que o servidor já não tem, mas guarda o que vai subir e o que vem com o app', async () => {
    await d.runs.bulkPut([row('viva'), row('purgada'), row('na-fila')]);
    await d.exercises.put(row('supino-reto', { updated_at: 0, builtin: true }));
    await d.outbox.put({ key: 'runs:na-fila', table: 'runs', id: 'na-fila', ts: 1 });
    vi.mocked(rpc).mockResolvedValueOnce({ runs: ['viva'], exercises: [] });

    await dropPurged(d, 10, 50);

    expect(rpc).toHaveBeenCalledWith('sync_ids');
    expect((await d.runs.toCollection().primaryKeys()).sort()).toEqual(['na-fila', 'viva']);
    expect(await d.exercises.get('supino-reto')).toBeTruthy();

    // Same horizon again: nothing to do.
    await dropPurged(d, 10, 50);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('aparelho em dia ou novo não pede a lista', async () => {
    await d.runs.put(row('viva'));
    await dropPurged(d, 80, 50);
    await dropPurged(d, 0, 90);
    expect(rpc).not.toHaveBeenCalled();
    expect(await d.runs.count()).toBe(1);
  });
});

describe('revogar dados de saúde', () => {
  it('limpa peso, dores, articulações e a fila de envio deles; treinos ficam', async () => {
    await d.body_logs.put(row('peso', { weight_kg: 80 }));
    await d.pain_reports.put(row('dor', { joint: 'ombro' }));
    await d.day_overrides.bulkPut([
      row('poupar', { action: 'spare_joint', value: 'joelho' }),
      row('tempo', { action: 'time', value: '30' }),
    ]);
    await d.session_items.put(row('item', { pain_joint: 'ombro', status: 'done' }));
    await d.profiles.put(row('u', { onboarding: { spare_joints: ['lombar'], goal: 'forca' } }));
    await d.runs.put(row('corrida'));
    await d.outbox.bulkPut([
      { key: 'body_logs:peso', table: 'body_logs', id: 'peso', ts: 1 },
      { key: 'day_overrides:poupar', table: 'day_overrides', id: 'poupar', ts: 2 },
      { key: 'day_overrides:tempo', table: 'day_overrides', id: 'tempo', ts: 3 },
      { key: 'runs:corrida', table: 'runs', id: 'corrida', ts: 4 },
    ]);
    expect(await countHealthLocal(d)).toBe(5);

    await wipeHealthLocal(d);

    expect(await countHealthLocal(d)).toBe(0);
    expect(await d.body_logs.count()).toBe(0);
    expect(await d.pain_reports.count()).toBe(0);
    expect(await d.day_overrides.toCollection().primaryKeys()).toEqual(['tempo']);
    expect((await d.session_items.get('item'))?.pain_joint).toBeNull();
    expect((await d.profiles.get('u'))?.onboarding).toEqual({ spare_joints: [], goal: 'forca' });
    expect(await d.runs.count()).toBe(1);
    expect((await d.outbox.toCollection().primaryKeys()).sort()).toEqual([
      'day_overrides:tempo',
      'runs:corrida',
    ]);
  });
});
