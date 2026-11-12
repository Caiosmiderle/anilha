import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { openDatabase, createUser, callRpc } from '../../server/pg';

let db: PGlite;
const ana = '00000000-0000-4000-8000-000000000091';
const bia = '00000000-0000-4000-8000-000000000092';
const as = (sub: string) => ({ sub, role: 'authenticated' as const });
const session = '11111111-1111-4111-8111-111111111111';
type Pull = {
  rows: { id: string; payload: Record<string, unknown>; updated_at: number }[];
  cursor: number;
  more: boolean;
};

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, ana, 'ana-sync@synthetic.invalid');
  await createUser(db, bia, 'bia-sync@synthetic.invalid');
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe('analysis_sync: análises e revisões entre iPhone e site', () => {
  it('guarda, devolve pelo cursor e vence a gravação mais nova', async () => {
    const first = (await callRpc(db, as(ana), 'analysis_push', {
      items: [{ id: `analysis:${session}`, payload: { status: 'proposed' }, updated_at: 100 }],
    })) as { kept: string[] };
    expect(first.kept).toEqual([`analysis:${session}`]);
    // Older write from another device loses; newer wins.
    const stale = (await callRpc(db, as(ana), 'analysis_push', {
      items: [{ id: `analysis:${session}`, payload: { status: 'refused' }, updated_at: 50 }],
    })) as { kept: string[] };
    expect(stale.kept).toEqual([]);
    await callRpc(db, as(ana), 'analysis_push', {
      items: [{ id: `analysis:${session}`, payload: { status: 'saved' }, updated_at: 200 }],
    });
    const page = (await callRpc(db, as(ana), 'analysis_pull', { since: 0 })) as Pull;
    expect(page.rows).toEqual([
      { id: `analysis:${session}`, payload: { status: 'saved' }, updated_at: 200 },
    ]);
    const after = (await callRpc(db, as(ana), 'analysis_pull', { since: page.cursor })) as Pull;
    expect(after.rows).toEqual([]);
    expect(after.cursor).toBe(page.cursor);
  });

  it('cada conta só vê e muda as próprias linhas', async () => {
    const other = (await callRpc(db, as(bia), 'analysis_pull', { since: 0 })) as Pull;
    expect(other.rows).toEqual([]);
    // Same key in another account is another row.
    await callRpc(db, as(bia), 'analysis_push', {
      items: [{ id: `analysis:${session}`, payload: { status: 'proposed' }, updated_at: 999 }],
    });
    const mine = (await callRpc(db, as(ana), 'analysis_pull', { since: 0 })) as Pull;
    expect(mine.rows[0]?.payload).toEqual({ status: 'saved' });
    await expect(callRpc(db, null, 'analysis_pull', { since: 0 })).rejects.toThrow();
  });

  it('recusa chave, lote e conteúdo fora do formato', async () => {
    await expect(
      callRpc(db, as(ana), 'analysis_push', {
        items: [{ id: 'sets:1', payload: {}, updated_at: 1 }],
      }),
    ).rejects.toThrow();
    await expect(
      callRpc(db, as(ana), 'analysis_push', {
        items: [{ id: 'review:x', payload: [], updated_at: 1 }],
      }),
    ).rejects.toThrow();
    const many = Array.from({ length: 51 }, (_, i) => ({
      id: `review:r${i}`,
      payload: {},
      updated_at: 1,
    }));
    await expect(callRpc(db, as(ana), 'analysis_push', { items: many })).rejects.toThrow();
  });

  it('apagar análises e apagar a conta levam as linhas junto', async () => {
    await callRpc(db, as(ana), 'analysis_push', {
      items: [{ id: 'review:ficha-1', payload: { decisions: [] }, updated_at: 300 }],
    });
    expect(await callRpc(db, as(ana), 'analysis_forget', {})).toBe(2);
    expect(((await callRpc(db, as(ana), 'analysis_pull', { since: 0 })) as Pull).rows).toEqual([]);
    await db.query('delete from auth.users where id = $1', [bia]);
    const left = await db.query<{ n: number }>(
      'select count(*)::int as n from public.analysis_sync where user_id = $1',
      [bia],
    );
    expect(left.rows[0]?.n).toBe(0);
  });
});
