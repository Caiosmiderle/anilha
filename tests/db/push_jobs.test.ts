/**
 * Notification queue: the end of a rest (scheduled by the phone, one at a time) and
 * friends' activity (queued by triggers), with the preferences and the throttle.
 * Claims run as the dispatcher would.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const P = '00000000-0000-4000-8000-0000000000a1';
const Q = '00000000-0000-4000-8000-0000000000a2';
const R = '00000000-0000-4000-8000-0000000000a3';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });

let db: PGlite;

function profile(uid: string, name: string, reminders: Record<string, unknown> = {}) {
  return {
    table: 'profiles',
    row: {
      id: uid,
      updated_at: Date.now(),
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
      reminders: { enabled: false, gym_time: '05:30', run_eve_time: '21:00', ...reminders },
      onboarding: null,
    },
  };
}

const rpc = <T>(uid: string, fn: string, args: Record<string, unknown> = {}) =>
  callRpc(db, claims(uid), fn, args) as Promise<T>;

async function jobs(
  uid: string,
): Promise<{ kind: string; topic: string; body: string; sent: boolean }[]> {
  const r = await db.query<{ kind: string; topic: string; body: string; sent: boolean }>(
    `select kind, topic, body, sent_at is not null as sent from public.push_jobs
      where user_id = $1 order by id`,
    [uid],
  );
  return r.rows;
}

async function claim(nowIso: string) {
  const r = await db.query<{ r: { title: string; body: string; tag: string; endpoint: string }[] }>(
    'select public.claim_push_jobs($1::timestamptz) as r',
    [nowIso],
  );
  return r.rows[0]?.r ?? [];
}

beforeAll(async () => {
  db = await openDatabase();
  for (const [id, name] of [
    [P, 'Paula'],
    [Q, 'Quim'],
    [R, 'Rafa'],
  ] as const) {
    await createUser(db, id, `${name.toLowerCase()}@test.dev`);
    await rpc(id, 'sync_push', { changes: [profile(id, name)] });
  }
  await rpc(P, 'save_push_subscription', {
    p_endpoint: 'https://push.example/paula',
    p_p256dh: 'key',
    p_auth: 'auth',
  });
});

afterAll(async () => {
  await db.close();
});

describe('fim do descanso', () => {
  it('agendar de novo substitui; cancelar apaga', async () => {
    const due = new Date(Date.now() + 90_000).toISOString();
    await rpc(P, 'schedule_rest_alert', {
      p_due: due,
      p_title: 'Descanso acabou',
      p_body: 'Próxima: supino',
    });
    await rpc(P, 'schedule_rest_alert', {
      p_due: due,
      p_title: 'Descanso acabou',
      p_body: 'Próxima: remada',
    });
    const rest = (await jobs(P)).filter((j) => j.kind === 'rest' && !j.sent);
    expect(rest).toHaveLength(1);
    expect(rest[0]?.body).toBe('Próxima: remada');
    await rpc(P, 'cancel_rest_alert');
    expect((await jobs(P)).filter((j) => j.kind === 'rest' && !j.sent)).toHaveLength(0);
  });

  it('horário absurdo é recusado', async () => {
    const later = new Date(Date.now() + 60 * 60_000).toISOString();
    const r = await rpc<{ error?: string }>(P, 'schedule_rest_alert', {
      p_due: later,
      p_title: 'x',
      p_body: 'y',
    });
    expect(r.error).toBe('horario');
  });

  it('desligado nas preferências, nada é agendado', async () => {
    await rpc(R, 'sync_push', { changes: [profile(R, 'Rafa', { rest: false })] });
    const r = await rpc<{ ok: boolean }>(R, 'schedule_rest_alert', {
      p_due: new Date(Date.now() + 60_000).toISOString(),
      p_title: 'Descanso acabou',
      p_body: '',
    });
    expect(r.ok).toBe(false);
    expect(await jobs(R)).toHaveLength(0);
  });

  it('só sai na hora, e uma vez', async () => {
    const due = new Date(Date.now() + 60_000);
    await rpc(P, 'schedule_rest_alert', {
      p_due: due.toISOString(),
      p_title: 'Descanso acabou',
      p_body: 'Próxima: supino, 2ª série',
    });
    expect(await claim(new Date(due.getTime() - 5_000).toISOString())).toHaveLength(0);
    const sent = await claim(new Date(due.getTime() + 1_000).toISOString());
    expect(sent).toEqual([
      expect.objectContaining({
        title: 'Descanso acabou',
        body: 'Próxima: supino, 2ª série',
        tag: 'anilha-descanso',
        endpoint: 'https://push.example/paula',
      }),
    ]);
    expect(await claim(new Date(due.getTime() + 2_000).toISOString())).toHaveLength(0);
  });
});

describe('amigos', () => {
  it('convite usado, reação e convite de grupo viram notificação', async () => {
    const inv = await rpc<{ code: string }>(P, 'create_invite');
    await rpc(Q, 'accept_invite', { p_code: inv.code });
    expect((await jobs(P)).map((j) => j.topic)).toContain('amigo_novo');

    // Paula has a workout and a run to react to.
    await rpc(P, 'sync_push', {
      changes: [
        {
          table: 'sessions',
          row: {
            id: 's1',
            updated_at: 1,
            deleted: false,
            local_date: '2026-10-19',
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
        {
          table: 'runs',
          row: {
            id: 'r1',
            updated_at: 1,
            deleted: false,
            local_date: '2026-10-19',
            distance_km: 5,
            duration_sec: 1800,
            run_type: 'leve',
            rpe: 5,
            note: null,
            source: 'manual',
            external_id: null,
          },
        },
      ],
    });
    await rpc(Q, 'set_reaction', { p_owner: P, p_kind: 'session', p_target: 's1', p_on: true });
    const reaction = (await jobs(P)).find((j) => j.topic === 'reacao');
    expect(reaction?.body).toBe('Quim mandou um boa no seu treino.');

    // Another reaction within 10 minutes: no second notification, the inbox has it.
    await rpc(Q, 'set_reaction', { p_owner: P, p_kind: 'run', p_target: 'r1', p_on: true });
    expect((await jobs(P)).filter((j) => j.topic === 'reacao')).toHaveLength(1);

    const g = await rpc<{ id: string }>(Q, 'create_group', { p_name: 'Turma' });
    await rpc(Q, 'invite_to_group', { p_group: g.id, p_friend: P });
    expect((await jobs(P)).find((j) => j.topic === 'convite_grupo')?.body).toBe(
      'Quim chamou você para o grupo Turma.',
    );
  });

  it('desligado, o amigo não recebe', async () => {
    await rpc(R, 'sync_push', { changes: [profile(R, 'Rafa', { rest: false, social: false })] });
    const inv = await rpc<{ code: string }>(R, 'create_invite');
    await rpc(Q, 'accept_invite', { p_code: inv.code });
    expect(await jobs(R)).toHaveLength(0);
  });

  it('quem não tem aparelho cadastrado é descartado, sem erro', async () => {
    // Quim has no subscription: his jobs are claimed and dropped.
    const inv = await rpc<{ code: string }>(Q, 'create_invite');
    await rpc(R, 'accept_invite', { p_code: inv.code });
    const out = await claim(new Date(Date.now() + 1_000).toISOString());
    expect(out.every((o) => o.endpoint === 'https://push.example/paula')).toBe(true);
    expect((await jobs(Q)).every((j) => j.sent)).toBe(true);
  });

  it('usuário comum não lê a fila nem chama o envio', async () => {
    const n = await asUser(db, claims(P), async (tx) => {
      const r = await tx.query<{ n: number }>('select count(*)::int as n from public.push_jobs');
      return r.rows[0]?.n;
    });
    expect(n).toBe(0);
    await expect(
      asUser(db, claims(P), (tx) => tx.query('select public.claim_push_jobs(now())')),
    ).rejects.toThrow();
  });
});

describe('sincronização de versão antiga', () => {
  it('campo que o aparelho não mandou não é apagado', async () => {
    // A newer phone saved a nullable field; an older one pushes the profile without it.
    await rpc(P, 'sync_push', {
      changes: [
        { table: 'profiles', row: { ...profile(P, 'Paula').row, return_started_on: '2026-10-01' } },
      ],
    });
    const { return_started_on: _drop, ...old } = profile(P, 'Paula Souza').row;
    await rpc(P, 'sync_push', {
      changes: [{ table: 'profiles', row: { ...old, updated_at: Date.now() + 1000 } }],
    });
    const r = await db.query<{ name: string; since: string }>(
      `select display_name as name, return_started_on::text as since from public.profiles where user_id = $1`,
      [P],
    );
    expect(r.rows[0]).toEqual({ name: 'Paula Souza', since: '2026-10-01' });
  });
});
