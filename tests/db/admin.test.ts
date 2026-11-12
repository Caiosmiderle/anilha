/**
 * Management panel on the server: only accounts in admins get in, and what comes out
 * is what running the app needs, never health data.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const ADMIN = '00000000-0000-4000-8000-0000000002a1';
const ANA = '00000000-0000-4000-8000-0000000002a2';
const BETO = '00000000-0000-4000-8000-0000000002a3';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });
const TODAY = '2026-10-19';
let db: PGlite;

const now = Date.now();

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, ADMIN, 'dono@test.dev');
  await createUser(db, ANA, 'ana@test.dev');
  await createUser(db, BETO, 'beto@test.dev');
  await db.query('insert into public.admins (user_id) values ($1)', [ADMIN]);

  // Ana trained twice in two weeks and ran once, logged her weight and wrote a message.
  await callRpc(db, claims(ANA), 'sync_push', {
    changes: [
      ...['2026-10-08', '2026-10-17'].map((day, i) => ({
        table: 'sessions',
        row: {
          id: `s${i}`,
          updated_at: now,
          deleted: false,
          local_date: day,
          status: 'done',
          title: 'Ficha A',
          source: 'routine',
          detail: 'full',
          adjustments: [],
          started_at: now,
          ended_at: now,
        },
      })),
      {
        table: 'runs',
        row: {
          id: 'r1',
          updated_at: now,
          deleted: false,
          local_date: '2026-10-18',
          distance_km: 5,
          duration_sec: 1800,
          run_type: 'leve',
          source: 'manual',
        },
      },
      {
        table: 'body_logs',
        row: {
          id: 'b1',
          updated_at: now,
          deleted: false,
          local_date: '2026-10-18',
          weight_kg: 71.5,
          waist_cm: 80,
          note: 'privado',
        },
      },
    ],
  });
  await callRpc(db, claims(ANA), 'record_consent', {
    p_kind: 'saude',
    p_version: '2026-10-19',
    p_granted: true,
  });
  await callRpc(db, claims(ANA), 'create_ticket', {
    p_kind: 'exclusao',
    p_message: 'Apaguem minhas corridas de setembro.',
    p_version: 'v1',
    p_user_agent: null,
  });
  await callRpc(db, claims(BETO), 'log_client_error', {
    p_message: 'x is undefined',
    p_stack: 'at Today',
    p_url: '/',
    p_version: 'v1',
    p_user_agent: 'teste',
  });
});

afterAll(async () => {
  await db.close();
});

describe('painel de gestão', () => {
  it('só quem está em admins entra; anônimo nem chama', async () => {
    expect(await callRpc(db, claims(ADMIN), 'is_admin', {})).toBe(true);
    expect(await callRpc(db, claims(ANA), 'is_admin', {})).toBe(false);
    for (const [fn, args] of [
      ['admin_overview', { p_today: TODAY }],
      ['admin_users', {}],
      ['admin_user', { p_id: ANA, p_today: TODAY }],
      ['admin_tickets', {}],
      ['admin_errors', {}],
      ['admin_answer_ticket', { p_id: ANA, p_answer: 'oi' }],
    ] as const) {
      await expect(callRpc(db, claims(ANA), fn, args)).rejects.toThrow(/Sem permissão/);
      await expect(callRpc(db, null, fn, args)).rejects.toThrow();
    }
    // The list of admins is not readable by anyone through the API.
    await expect(callRpc(db, claims(ANA), 'require_admin', {})).rejects.toThrow();
  });

  it('visão geral conta contas, ativos, treinos e mensagens', async () => {
    const o = (await callRpc(db, claims(ADMIN), 'admin_overview', { p_today: TODAY })) as Record<
      string,
      unknown
    >;
    expect(o.accounts).toBe(3);
    expect(o.active_7d).toBe(1);
    expect(o.workouts_7d).toBe(1);
    expect(o.cardio_7d).toBe(1);
    expect(o.health_on).toBe(1);
    expect(o.tickets_open).toBe(1);
    expect(o.privacy_open).toBe(1);
    expect(o.errors_24h).toBe(1);
    expect((o.signups as unknown[]).length).toBe(30);
    expect((o.weekly_active as unknown[]).length).toBe(8);
  });

  it('pessoas: atividade e status, sem dado de saúde', async () => {
    const users = (await callRpc(db, claims(ADMIN), 'admin_users', {})) as Record<
      string,
      unknown
    >[];
    const ana = users.find((u) => u.email === 'ana@test.dev');
    expect(ana).toMatchObject({
      workouts: 2,
      cardio: 1,
      first_day: '2026-10-08',
      last_day: '2026-10-18',
      weeks: 2,
      health: true,
      open_tickets: 1,
      admin: false,
    });
    // Health stays out: only whether it is on, never the values.
    const text = JSON.stringify(users);
    expect(text).not.toContain('71.5');
    expect(text).not.toContain('privado');

    const detail = (await callRpc(db, claims(ADMIN), 'admin_user', {
      p_id: ANA,
      p_today: TODAY,
    })) as { weeks: { treino: number; cardio: number }[]; tickets: unknown[]; consents: unknown[] };
    expect(detail.weeks).toHaveLength(12);
    expect(detail.weeks.reduce((n, w) => n + w.treino, 0)).toBe(2);
    expect(detail.tickets).toHaveLength(1);
    expect(detail.consents).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toContain('71.5');
  });

  it('responder uma mensagem: aparece para a pessoa', async () => {
    const tickets = (await callRpc(db, claims(ADMIN), 'admin_tickets', {})) as {
      id: string;
      email: string;
      status: string;
    }[];
    expect(tickets[0]).toMatchObject({ email: 'ana@test.dev', status: 'aberto' });
    await expect(
      callRpc(db, claims(ADMIN), 'admin_answer_ticket', { p_id: tickets[0]?.id, p_answer: '  ' }),
    ).rejects.toThrow(/Escreva a resposta/);
    await callRpc(db, claims(ADMIN), 'admin_answer_ticket', {
      p_id: tickets[0]?.id,
      p_answer: 'Feito: as corridas de setembro foram apagadas.',
    });
    const mine = (await callRpc(db, claims(ANA), 'my_tickets', {})) as {
      status: string;
      answer: string;
    }[];
    expect(mine[0]).toMatchObject({
      status: 'respondido',
      answer: 'Feito: as corridas de setembro foram apagadas.',
    });
  });

  it('erros agrupados por mensagem', async () => {
    const errors = (await callRpc(db, claims(ADMIN), 'admin_errors', {})) as {
      message: string;
      count: number;
      people: number;
    }[];
    expect(errors[0]).toMatchObject({ message: 'x is undefined', count: 1, people: 1 });
  });
});
