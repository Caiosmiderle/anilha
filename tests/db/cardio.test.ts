/**
 * Cardio besides running in the runs table: a run still needs its distance, the
 * elliptical does not; friends see the right name in the feed.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const A = '00000000-0000-4000-8000-0000000000c1';
const B = '00000000-0000-4000-8000-0000000000c2';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });
let db: PGlite;

function run(id: string, extra: Record<string, unknown>) {
  return {
    table: 'runs',
    row: {
      id,
      updated_at: Date.now(),
      deleted: false,
      local_date: '2026-10-19',
      distance_km: 5,
      duration_sec: 1800,
      run_type: 'leve',
      rpe: 5,
      note: null,
      source: 'manual',
      external_id: null,
      ...extra,
    },
  };
}

async function push(changes: unknown[]) {
  return (await callRpc(db, claims(A), 'sync_push', { changes })) as {
    applied: number;
    rejected: { id: string }[];
  };
}

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, A, 'cardio-a@test.dev');
  await createUser(db, B, 'cardio-b@test.dev');
  await db.query('insert into public.friendships (user_a, user_b) values ($1, $2)', [A, B]);
});

afterAll(async () => {
  await db.close();
});

describe('cardio', () => {
  it('corrida precisa de distância; elíptico e bike sem distância entram', async () => {
    const res = await push([
      run('sem-distancia', { distance_km: null }),
      run('eliptico', { activity: 'eliptico', distance_km: null }),
      run('bike', { activity: 'bike', distance_km: 20 }),
      run('nado', { activity: 'natacao', distance_km: 1.5 }),
      run('inventado', { activity: 'paraquedas', distance_km: null }),
    ]);
    expect(res.applied).toBe(3);
    expect(res.rejected).toHaveLength(2);
  });

  it('o amigo vê o nome certo de cada atividade', async () => {
    await push([run('corrida', { run_type: 'longo', distance_km: 12 })]);
    const overview = (await callRpc(db, claims(B), 'friends_overview', {
      p_week_start: '2026-10-19',
    })) as { activities: { id: string; title: string; activity: string }[] }[];
    const titles = Object.fromEntries(
      (overview[0]?.activities ?? []).map((a) => [a.id, [a.title, a.activity]]),
    );
    expect(titles.eliptico).toEqual(['Elíptico', 'eliptico']);
    expect(titles.bike).toEqual(['Bike', 'bike']);
    expect(titles.nado).toEqual(['Natação', 'natacao']);
    expect(titles.corrida).toEqual(['Corrida longa', 'corrida']);
  });
});
