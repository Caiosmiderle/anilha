/**
 * Reminders: opt-in, at the user's times, at most one per day, nothing when the
 * workout is already done. Runs claim_due_reminders as the service role would.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const U = '00000000-0000-4000-8000-0000000000f1';
const claims: Claims = { sub: U, role: 'authenticated' };
let db: PGlite;

function day(weekday: number, kind: 'gym' | 'run' | 'rest') {
  return {
    weekday,
    kind,
    split_key: kind === 'gym' ? 'perna' : null,
    run_type: kind === 'run' ? 'leve' : null,
    time: '06:00',
  };
}

async function claim(nowIso: string): Promise<{ title: string; body: string; kind: string }[]> {
  const r = await db.query<{ r: { title: string; body: string; kind: string }[] }>(
    'select public.claim_due_reminders($1::timestamptz) as r',
    [nowIso],
  );
  return r.rows[0]?.r ?? [];
}

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, U, 'r@test.dev');
  // Monday gym (legs), Tuesday run, rest of the week off.
  const days = [
    day(0, 'gym'),
    day(1, 'run'),
    day(2, 'rest'),
    day(3, 'rest'),
    day(4, 'rest'),
    day(5, 'rest'),
    day(6, 'rest'),
  ];
  await callRpc(db, claims, 'sync_push', {
    changes: [
      {
        table: 'profiles',
        row: {
          id: U,
          updated_at: 1,
          deleted: false,
          display_name: 'R',
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
          reminders: { enabled: true, gym_time: '05:30', run_eve_time: '21:00' },
          onboarding: null,
        },
      },
      {
        table: 'plans',
        row: {
          id: 'p',
          updated_at: 1,
          deleted: false,
          active_from: '2026-10-01',
          gym_per_week: 1,
          run_per_week: 1,
          days,
          rules: { no_legs_before_run: false },
          params: null,
          reasons: [],
        },
      },
    ],
  });
  await callRpc(db, claims, 'save_push_subscription', {
    p_endpoint: 'https://push.example/abc',
    p_p256dh: 'key',
    p_auth: 'auth',
  });
});

afterAll(async () => {
  await db.close();
});

describe('lembretes', () => {
  it('avisa no horário do treino e só uma vez por dia', async () => {
    // Monday 19/10/2026, 05:35 in São Paulo (UTC-3).
    expect(await claim('2026-10-19T08:00:00Z')).toHaveLength(0);
    const due = await claim('2026-10-19T08:35:00Z');
    expect(due).toHaveLength(1);
    expect(due[0]?.title).toBe('Treino de hoje');
    expect(due[0]?.body).toBe('Hoje tem perna às 06:00.');
    // Same day, evening before Tuesday's run: still nothing (one per day).
    expect(await claim('2026-10-20T00:05:00Z')).toHaveLength(0);
  });

  it('véspera de corrida em outro dia', async () => {
    // Monday 26/10 at 21:05 local: run on Tuesday. The Monday morning slot was missed on purpose.
    const due = await claim('2026-10-27T00:05:00Z');
    expect(due).toHaveLength(1);
    expect(due[0]?.kind).toBe('vespera_corrida');
  });

  it('não avisa treino que já foi feito', async () => {
    await callRpc(db, claims, 'sync_push', {
      changes: [
        {
          table: 'sessions',
          row: {
            id: 's',
            updated_at: 1,
            deleted: false,
            local_date: '2026-11-02',
            started_at: 1,
            ended_at: 2,
            status: 'done',
            split_key: 'perna',
            title: 'Perna',
            routine_id: null,
            source: 'blank',
            note: null,
            detail: 'full',
            rest_started_at: null,
            rest_duration_sec: null,
            adjustments: [],
          },
        },
      ],
    });
    expect(await claim('2026-11-02T08:35:00Z')).toHaveLength(0);
  });

  it('resumo da semana no domingo às 20h, uma vez, sem tomar o lugar do lembrete', async () => {
    // Sunday 08/11 at 20:05 in São Paulo. The week: 1 workout done (02/11), the run missed.
    expect(await claim('2026-11-08T22:55:00Z')).toHaveLength(0);
    const due = await claim('2026-11-08T23:05:00Z');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      kind: 'semana',
      title: 'Resumo da semana',
      body: 'Você fez 1 de 1 treino e 0 de 1 corrida. Veja o resumo e o foco da próxima.',
    });
    expect(await claim('2026-11-08T23:10:00Z')).toHaveLength(0);
  });

  it('semana sem treino chama para a próxima', async () => {
    const due = await claim('2026-11-15T23:05:00Z');
    expect(due[0]).toMatchObject({ kind: 'semana', title: 'Uma semana nova amanhã' });
  });

  it('resumo desligado em Ajustes não chega', async () => {
    await callRpc(db, claims, 'sync_push', {
      changes: [
        {
          table: 'profiles',
          row: {
            id: U,
            updated_at: 2,
            deleted: false,
            display_name: 'R',
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
            reminders: { enabled: true, gym_time: '05:30', run_eve_time: '21:00', weekly: false },
            onboarding: null,
          },
        },
      ],
    });
    expect(await claim('2026-11-22T23:05:00Z')).toHaveLength(0);
  });

  it('lembrete diz o nome das fichas do foco em pernas', async () => {
    const r = await db.query<{ a: string; g: string; c: string }>(
      `select public.split_label('anterior') as a, public.split_label('gluteos') as g,
              public.split_label('superiores') as c`,
    );
    expect(r.rows[0]).toEqual({ a: 'anterior de coxa', g: 'glúteos', c: 'parte de cima' });
  });

  it('usuário comum não chama o agendador', async () => {
    await expect(
      asUser(db, claims, (tx) => tx.query(`select public.claim_due_reminders(now())`)),
    ).rejects.toThrow();
  });
});
