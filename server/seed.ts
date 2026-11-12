/**
 * Dev-only synthetic data: an invented week plus two friends and a group,
 * so every screen has something to show locally. Never runs against production.
 */
import type { PGlite } from '@electric-sql/pglite';
import { EXAMPLE_PARAMS, exampleWeek } from '../src/engine/fixtures/exampleWeek';
import { generatePlan } from '../src/engine/generator';
import { callRpc, createUser, type Claims } from './pg';

export const DEMO = {
  caio: { id: '00000000-0000-4000-8000-00000000ca10', email: 'caio@anilha.dev', name: 'Rafa' },
  ana: { id: '00000000-0000-4000-8000-0000000000a1', email: 'ana@anilha.dev', name: 'Ana' },
  bruno: { id: '00000000-0000-4000-8000-0000000000b2', email: 'bruno@anilha.dev', name: 'Bruno' },
};

const T = new Date(2026, 9, 11, 20).getTime();
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });

function profile(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    table: 'profiles',
    row: {
      id,
      updated_at: T,
      deleted: false,
      display_name: name,
      unit: 'kg',
      rest_sec: 90,
      timezone: 'America/Sao_Paulo',
      share_adherence: true,
      share_workouts: true,
      share_records: true,
      share_details: false,
      return_mode: 'auto',
      return_started_on: null,
      return_notice_seen: null,
      reminders: { enabled: false, gym_time: '05:30', run_eve_time: '21:00' },
      onboarding: null,
      ...extra,
    },
  };
}

function rows(table: string, list: object[]) {
  return list.map((row) => ({ table, row }));
}

function simpleSession(id: string, day: string, split: string, title: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const start = new Date(y, m - 1, d, 6).getTime();
  return {
    id,
    updated_at: T,
    deleted: false,
    local_date: day,
    started_at: start,
    ended_at: start + 3_600_000,
    status: 'done',
    split_key: split,
    title,
    routine_id: null,
    source: 'summary',
    note: null,
    detail: 'summary',
    rest_started_at: null,
    rest_duration_sec: null,
    adjustments: [],
  };
}

export async function seedDemo(db: PGlite): Promise<void> {
  const exists = await db.query('select 1 from auth.users where id = $1', [DEMO.caio.id]);
  if (exists.rows.length) return;

  for (const u of Object.values(DEMO)) await createUser(db, u.id, u.email);

  const week = exampleWeek(DEMO.caio.id, T);
  const strip = <R extends { user_id?: string }>(list: R[]) =>
    list.map(({ user_id: _u, ...rest }) => rest);
  await callRpc(db, claims(DEMO.caio.id), 'sync_push', {
    changes: [
      profile(DEMO.caio.id, DEMO.caio.name, {
        onboarding: EXAMPLE_PARAMS,
        return_mode: 'on',
        return_started_on: '2026-10-12',
      }),
      { table: 'plans', row: strip([week.plan])[0] },
      ...rows('routines', strip(week.routines)),
      ...rows('routine_items', strip(week.routineItems)),
      ...rows('sessions', strip(week.sessions)),
      ...rows('session_items', strip(week.items)),
      ...rows('sets', strip(week.sets)),
    ],
  });

  const anaPlan = generatePlan({
    ...EXAMPLE_PARAMS,
    first_name: 'Ana',
    run_days: 1,
    returning: false,
  });
  await callRpc(db, claims(DEMO.ana.id), 'sync_push', {
    changes: [
      profile(DEMO.ana.id, DEMO.ana.name),
      {
        table: 'plans',
        row: {
          id: 'ana-plan',
          updated_at: T,
          deleted: false,
          active_from: '2026-09-01',
          gym_per_week: anaPlan.gym_per_week,
          run_per_week: anaPlan.run_per_week,
          days: anaPlan.days,
          rules: anaPlan.rules,
          params: null,
          reasons: [],
        },
      },
      ...rows('sessions', [
        simpleSession('ana-s1', '2026-10-12', 'costas_biceps', 'Costas e bíceps'),
        simpleSession('ana-s2', '2026-10-14', 'peito_triceps', 'Peito e tríceps'),
        simpleSession('ana-s3', '2026-10-16', 'perna', 'Perna'),
      ]),
      ...rows('runs', [
        {
          id: 'ana-r1',
          updated_at: T,
          deleted: false,
          local_date: '2026-10-18',
          distance_km: 10.2,
          duration_sec: 3720,
          run_type: 'longo',
          rpe: 6,
          note: null,
          source: 'manual',
          external_id: null,
        },
      ]),
      ...rows('records', [
        {
          id: 'ana-rec-1',
          updated_at: T,
          deleted: false,
          exercise_id: 'agachamento-livre',
          exercise_name: 'Agachamento livre com barra',
          kind: 'carga',
          value: 62.5,
          unit: 'kg',
          local_date: '2026-10-16',
          session_id: 'ana-s3',
          run_id: null,
        },
      ]),
    ],
  });

  await callRpc(db, claims(DEMO.bruno.id), 'sync_push', {
    changes: [
      profile(DEMO.bruno.id, DEMO.bruno.name),
      {
        table: 'plans',
        row: {
          id: 'bruno-plan',
          updated_at: T,
          deleted: false,
          active_from: '2026-09-01',
          gym_per_week: 3,
          run_per_week: 0,
          days: generatePlan({ ...EXAMPLE_PARAMS, run_days: 0 }).days,
          rules: { no_legs_before_run: true },
          params: null,
          reasons: [],
        },
      },
      ...rows('sessions', [
        simpleSession('bruno-s1', '2026-10-13', 'superior_a', 'Superior A'),
        simpleSession('bruno-s2', '2026-10-15', 'inferior_a', 'Inferior A'),
      ]),
    ],
  });

  // Friendships and a group, through the same RPCs the app uses.
  for (const friend of [DEMO.ana, DEMO.bruno]) {
    const inv = (await callRpc(db, claims(DEMO.caio.id), 'create_invite', {})) as { code: string };
    await callRpc(db, claims(friend.id), 'accept_invite', { p_code: inv.code });
  }
  const group = (await callRpc(db, claims(DEMO.ana.id), 'create_group', {
    p_name: 'Turma das 6h',
  })) as {
    join_code: string;
  };
  await callRpc(db, claims(DEMO.caio.id), 'join_group', { p_code: group.join_code });
  await callRpc(db, claims(DEMO.bruno.id), 'join_group', { p_code: group.join_code });
  await callRpc(db, claims(DEMO.ana.id), 'set_reaction', {
    p_owner: DEMO.caio.id,
    p_kind: 'session',
    p_target: 'demo-session-2026-10-18',
    p_on: true,
  });
}
