/**
 * Sending a ficha: only to friends (the team, from the panel, to anyone), cleaned to what
 * a routine is, read only by who sent and who got it, answered once, in the inbox, with a
 * push; and the answer to a message reaches the phone too.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const LIA = '00000000-0000-4000-8000-0000000003a1';
const TEO = '00000000-0000-4000-8000-0000000003a2';
const RUI = '00000000-0000-4000-8000-0000000003a3';
const DONO = '00000000-0000-4000-8000-0000000003a4';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });
let db: PGlite;

const item = (extra: Record<string, unknown> = {}) => ({
  exercise_id: 'supino-reto',
  sets: 3,
  target_min: 8,
  target_max: 12,
  rest_sec: 90,
  warmup_sets: 1,
  note: null,
  superset: null,
  ...extra,
});

const send = (from: string, to: string, extra: Record<string, unknown> = {}) =>
  callRpc(db, claims(from), 'send_routine', {
    p_to: to,
    p_name: 'Peito pesado',
    p_note: 'Faz duas vezes na semana.',
    p_items: [item(), item({ exercise_id: 'meu-crucifixo', sets: 4 })],
    p_exercises: [
      { id: 'meu-crucifixo', name: 'Crucifixo do Lia', primary_group: 'peito', hack: 'x' },
    ],
    ...extra,
  }) as Promise<{ id?: string; error?: string }>;

async function pushes(user: string, topic: string): Promise<number> {
  const r = await db.query<{ n: number }>(
    `select count(*)::int as n from public.push_jobs where user_id = $1 and topic = $2`,
    [user, topic],
  );
  return r.rows[0]?.n ?? 0;
}

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, LIA, 'lia-ficha@test.dev');
  await createUser(db, TEO, 'teo-ficha@test.dev');
  await createUser(db, RUI, 'rui-ficha@test.dev');
  await createUser(db, DONO, 'dono-ficha@test.dev');
  await db.query(
    'insert into public.friendships (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))',
    [LIA, TEO],
  );
  await db.query('insert into public.admins (user_id) values ($1)', [DONO]);
});

afterAll(async () => {
  await db.close();
});

describe('mandar ficha', () => {
  it('para amigo vai, limpa o que não é ficha e avisa; para quem não é amigo, não', async () => {
    const friends = (await callRpc(db, claims(LIA), 'my_friends', {})) as { id: string }[];
    expect(friends.map((f) => f.id)).toEqual([TEO]);

    const sent = await send(LIA, TEO);
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await send(LIA, RUI)).toEqual({ error: 'not_friends' });

    const row = (await callRpc(db, claims(TEO), 'shared_routine', { p_id: sent.id })) as {
      sender_name: string;
      items: { sets: number; exercise_id: string }[];
      exercises: Record<string, unknown>[];
      status: string;
    };
    expect(row.status).toBe('pending');
    expect(row.items.map((i) => i.sets)).toEqual([3, 4]);
    // Unknown fields do not travel.
    expect(row.exercises[0]).toEqual({
      id: 'meu-crucifixo',
      name: 'Crucifixo do Lia',
      primary_group: 'peito',
    });
    // Someone else cannot read it.
    expect(await callRpc(db, claims(RUI), 'shared_routine', { p_id: sent.id })).toBeNull();
    expect(await pushes(TEO, 'ficha')).toBe(1);

    const inbox = (await callRpc(db, claims(TEO), 'inbox', {
      p_since: new Date(Date.now() - 86400000).toISOString(),
    })) as { kind: string; status?: string; name?: string }[];
    expect(inbox.find((i) => i.kind === 'routine')).toMatchObject({
      status: 'pending',
      name: 'Peito pesado',
    });
  });

  it('ficha fora do limite é recusada', async () => {
    await expect(send(LIA, TEO, { p_items: [] })).rejects.toThrow(/1 a 30/);
    await expect(send(LIA, TEO, { p_items: [item({ sets: 40 })] })).rejects.toThrow(/limite/);
    await expect(send(LIA, TEO, { p_items: [item({ target_max: 5 })] })).rejects.toThrow(/limite/);
    await expect(send(LIA, TEO, { p_name: '  ' })).rejects.toThrow(/nome/);
  });

  it('só quem recebeu responde, uma vez; aceitar avisa quem mandou', async () => {
    const sent = await send(LIA, TEO);
    expect(
      await callRpc(db, claims(LIA), 'answer_shared_routine', { p_id: sent.id, p_accept: true }),
    ).toEqual({ error: 'invalid' });
    expect(
      await callRpc(db, claims(TEO), 'answer_shared_routine', { p_id: sent.id, p_accept: true }),
    ).toEqual({ ok: true });
    expect(
      await callRpc(db, claims(TEO), 'answer_shared_routine', { p_id: sent.id, p_accept: false }),
    ).toEqual({ error: 'invalid' });
    expect(await pushes(LIA, 'ficha_aceita')).toBe(1);
    const inbox = (await callRpc(db, claims(LIA), 'inbox', {
      p_since: new Date(Date.now() - 86400000).toISOString(),
    })) as { kind: string; actor_name?: string }[];
    expect(inbox.some((i) => i.kind === 'routine_accepted')).toBe(true);
  });

  it('a equipe manda para qualquer pessoa pelo painel, assinado Anilha; quem não é admin, não', async () => {
    const sent = (await callRpc(db, claims(DONO), 'admin_send_routine', {
      p_to: RUI,
      p_name: 'Corpo inteiro para começar',
      p_note: null,
      p_items: [item()],
      p_exercises: [],
    })) as { id: string };
    const row = (await callRpc(db, claims(RUI), 'shared_routine', { p_id: sent.id })) as {
      sender_name: string;
      from_team: boolean;
    };
    expect(row).toMatchObject({ sender_name: 'Anilha', from_team: true });
    await expect(
      callRpc(db, claims(LIA), 'admin_send_routine', {
        p_to: RUI,
        p_name: 'x',
        p_note: null,
        p_items: [item()],
        p_exercises: [],
      }),
    ).rejects.toThrow(/Sem permissão/);
    const detail = (await callRpc(db, claims(DONO), 'admin_user', {
      p_id: RUI,
      p_today: '2026-10-19',
    })) as { routines: { name: string; status: string }[] };
    expect(detail.routines).toEqual([
      expect.objectContaining({ name: 'Corpo inteiro para começar', status: 'pending' }),
    ]);
    const o = (await callRpc(db, claims(DONO), 'admin_overview', {
      p_today: '2026-10-19',
    })) as { routines_30d: number; routines_added_30d: number };
    expect(o.routines_30d).toBeGreaterThanOrEqual(3);
    expect(o.routines_added_30d).toBe(1);
  });

  it('respondida há mais de 30 dias ou parada há mais de 60, sai do servidor', async () => {
    await db.query(
      `update public.shared_routines set created_at = now() - interval '61 days' where status = 'pending' and recipient = $1`,
      [RUI],
    );
    await db.query(`select public.purge_old_data()`);
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from public.shared_routines where recipient = $1`,
      [RUI],
    );
    expect(r.rows[0]?.n).toBe(0);
  });
});

describe('resposta de mensagem', () => {
  it('chega no celular como notificação', async () => {
    const t = (await callRpc(db, claims(RUI), 'create_ticket', {
      p_kind: 'sugestao',
      p_message: 'Queria tema roxo.',
      p_version: null,
      p_user_agent: null,
    })) as { id: string };
    await callRpc(db, claims(DONO), 'admin_answer_ticket', {
      p_id: t.id,
      p_answer: 'Anotado!',
    });
    expect(await pushes(RUI, 'mensagem')).toBe(1);
  });
});
