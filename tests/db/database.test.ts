/**
 * Tests run straight against Postgres (PGlite) with the real migrations and row level
 * security, as an authenticated user would hit it through the API. No interface involved.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });
const WEEK = '2026-10-12';

let db: PGlite;

function profile(uid: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    table: 'profiles',
    row: {
      id: uid,
      updated_at: 1,
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

function plan(gym: number, run: number) {
  return {
    table: 'plans',
    row: {
      id: 'plan-1',
      updated_at: 1,
      deleted: false,
      active_from: '2026-10-01',
      gym_per_week: gym,
      run_per_week: run,
      days: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        kind: 'rest',
        split_key: null,
        run_type: null,
        time: '06:00',
      })),
      rules: { no_legs_before_run: true },
      params: null,
      reasons: [],
    },
  };
}

function session(id: string, day: string) {
  return {
    table: 'sessions',
    row: {
      id,
      updated_at: 1,
      deleted: false,
      local_date: day,
      started_at: 1,
      ended_at: 2,
      status: 'done',
      split_key: 'costas_biceps',
      title: 'Costas e bíceps',
      routine_id: null,
      source: 'blank',
      note: 'nota privada',
      detail: 'full',
      rest_started_at: null,
      rest_duration_sec: null,
      adjustments: [],
    },
  };
}

function set(id: string, sessionId: string, load: number, reps: number, updated = 1) {
  return {
    table: 'sets',
    row: {
      id,
      updated_at: updated,
      deleted: false,
      session_id: sessionId,
      item_id: 'item-1',
      exercise_id: 'remada-curvada',
      position: 0,
      kind: 'work',
      load_kg: load,
      reps,
      seconds: null,
      rir: 2,
      note: null,
      completed_at: 10,
    },
  };
}

async function push(uid: string, changes: unknown[]) {
  return (await callRpc(db, claims(uid), 'sync_push', { changes })) as {
    applied: number;
    stale: number;
    rejected: { error: string }[];
  };
}

async function count(uid: string, sql: string, params: unknown[] = []): Promise<number> {
  return asUser(db, claims(uid), async (tx) => {
    const r = await tx.query<{ n: number }>(sql, params);
    return Number(r.rows[0]?.n ?? 0);
  });
}

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, A, 'a@test.dev');
  await createUser(db, B, 'b@test.dev');
  await createUser(db, C, 'c@test.dev');
  await push(A, [
    profile(A, 'Ana'),
    plan(3, 0),
    session('s1', '2026-10-12'),
    set('set-1', 's1', 60, 10),
  ]);
  await push(B, [profile(B, 'Bruno'), plan(3, 0)]);
  await push(C, [profile(C, 'Clara'), plan(3, 0)]);
});

afterAll(async () => {
  await db.close();
});

describe('sincronização', () => {
  it('reenviar o mesmo lote não duplica nada', async () => {
    const batch = [set('set-dup', 's1', 62.5, 8)];
    await push(A, batch);
    await push(A, batch);
    expect(await count(A, `select count(*) as n from sets where id = 'set-dup'`)).toBe(1);
  });

  it('última escrita vence pelo updated_at; escrita antiga é ignorada', async () => {
    await push(A, [set('set-lww', 's1', 50, 10, 100)]);
    const old = await push(A, [set('set-lww', 's1', 40, 10, 50)]);
    expect(old.stale).toBe(1);
    const newer = await push(A, [set('set-lww', 's1', 55, 10, 200)]);
    expect(newer.applied).toBe(1);
    const load = await asUser(db, claims(A), async (tx) =>
      Number(
        (await tx.query<{ load_kg: string }>(`select load_kg from sets where id = 'set-lww'`))
          .rows[0]?.load_kg,
      ),
    );
    expect(load).toBe(55);
  });

  it('pull devolve só as linhas do dono, a partir do cursor', async () => {
    const first = (await callRpc(db, claims(A), 'sync_pull', { since: 0 })) as {
      rows: { table: string; row: { user_id: string } }[];
      cursor: number;
    };
    expect(first.rows.length).toBeGreaterThan(0);
    expect(first.rows.every((r) => r.row.user_id === A)).toBe(true);
    const again = (await callRpc(db, claims(A), 'sync_pull', { since: first.cursor })) as {
      rows: unknown[];
    };
    expect(again.rows).toHaveLength(0);
  });

  it('validação no servidor: valores absurdos são rejeitados, o resto do lote entra', async () => {
    const res = await push(A, [set('set-bad', 's1', 5000, 10), set('set-ok', 's1', 20, 10)]);
    expect(res.rejected).toHaveLength(1);
    expect(res.applied).toBe(1);
    const bad = await push(A, [{ table: 'auth.users', row: { id: 'x' } }]);
    expect(bad.rejected[0]?.error).toBe('tabela');
  });

  it('ninguém escreve no nome de outro usuário', async () => {
    await push(C, [
      {
        ...set('set-forged', 's1', 99, 1),
        row: { ...set('set-forged', 's1', 99, 1).row, user_id: A },
      },
    ]);
    expect(await count(A, `select count(*) as n from sets where id = 'set-forged'`)).toBe(0);
    expect(await count(C, `select count(*) as n from sets where id = 'set-forged'`)).toBe(1);
  });

  it('anônimo não chama RPC nenhuma', async () => {
    await expect(callRpc(db, null, 'sync_pull', { since: 0 })).rejects.toThrow();
  });
});

describe('19. privacidade garantida no banco', () => {
  it('estranho não lê nada de ninguém', async () => {
    expect(await count(C, `select count(*) as n from sets where user_id = $1`, [A])).toBe(0);
    expect(await count(C, `select count(*) as n from sessions where user_id = $1`, [A])).toBe(0);
    const overview = (await callRpc(db, claims(C), 'friends_overview', {
      p_week_start: WEEK,
    })) as unknown[];
    expect(overview).toHaveLength(0);
  });

  it('amigo sem permissão vê aderência e treinos, mas não lê cargas nem repetições', async () => {
    const inv = (await callRpc(db, claims(A), 'create_invite', {})) as { code: string };
    expect(inv.code).toMatch(/^[A-Z0-9]{8}$/);
    const acc = (await callRpc(db, claims(B), 'accept_invite', { p_code: inv.code })) as {
      name: string;
    };
    expect(acc.name).toBe('Ana');

    // Direct table reads, the way a curious client would try through the API.
    expect(await count(B, `select count(*) as n from sets where user_id = $1`, [A])).toBe(0);
    expect(await count(B, `select count(*) as n from sessions where user_id = $1`, [A])).toBe(0);
    expect(await count(B, `select count(*) as n from session_items where user_id = $1`, [A])).toBe(
      0,
    );
    expect(await count(B, `select count(*) as n from plans where user_id = $1`, [A])).toBe(0);
    expect(await count(B, `select count(*) as n from profiles where user_id = $1`, [A])).toBe(0);

    const details = (await callRpc(db, claims(B), 'friend_session_details', {
      p_friend: A,
      p_session: 's1',
    })) as {
      sets: unknown[];
    };
    expect(details.sets).toHaveLength(0);

    const overview = (await callRpc(db, claims(B), 'friends_overview', { p_week_start: WEEK })) as {
      name: string;
      adherence: { done_gym: number; planned_gym: number };
      activities: { title: string; local_date: string }[];
    }[];
    expect(overview[0]?.name).toBe('Ana');
    expect(overview[0]?.adherence).toMatchObject({ done_gym: 1, planned_gym: 3 });
    expect(overview[0]?.activities[0]).toMatchObject({
      title: 'Costas e bíceps',
      local_date: '2026-10-12',
    });
    expect(JSON.stringify(overview)).not.toMatch(/nota privada|load_kg|reps/);
  });

  it('com share_details ligado, o amigo lê as séries; o estranho continua sem ler', async () => {
    await push(A, [profile(A, 'Ana', { share_details: true, updated_at: 5 })]);
    expect(
      await count(B, `select count(*) as n from sets where user_id = $1`, [A]),
    ).toBeGreaterThan(0);
    expect(await count(C, `select count(*) as n from sets where user_id = $1`, [A])).toBe(0);
    const details = (await callRpc(db, claims(B), 'friend_session_details', {
      p_friend: A,
      p_session: 's1',
    })) as {
      sets: unknown[];
    };
    expect(details.sets.length).toBeGreaterThan(0);
    // Still read-only for the friend.
    await asUser(db, claims(B), (tx) =>
      tx.query(`update sets set reps = 1 where user_id = $1`, [A]),
    );
    expect(await count(A, `select count(*) as n from sets where reps = 1`)).toBe(0);
  });

  it('aderência desligada some do resumo do amigo', async () => {
    await push(A, [
      profile(A, 'Ana', { share_details: false, share_adherence: false, updated_at: 6 }),
    ]);
    const overview = (await callRpc(db, claims(B), 'friends_overview', { p_week_start: WEEK })) as {
      adherence: unknown;
    }[];
    expect(overview[0]?.adherence).toBeNull();
    await push(A, [profile(A, 'Ana', { share_adherence: true, updated_at: 7 })]);
  });

  it('reação de um toque só entre amigos', async () => {
    const ok = (await callRpc(db, claims(B), 'set_reaction', {
      p_owner: A,
      p_kind: 'session',
      p_target: 's1',
      p_on: true,
    })) as { ok?: boolean };
    expect(ok.ok).toBe(true);
    const denied = (await callRpc(db, claims(C), 'set_reaction', {
      p_owner: A,
      p_kind: 'session',
      p_target: 's1',
      p_on: true,
    })) as { error?: string };
    expect(denied.error).toBe('nao_amigo');
    const received = (await callRpc(db, claims(A), 'reactions_received', {
      p_since: '2026-01-01',
    })) as {
      actor_name: string;
    }[];
    expect(received.map((r) => r.actor_name)).toEqual(['Bruno']);
  });

  it('bloquear desfaz a amizade e corta tudo', async () => {
    await callRpc(db, claims(A), 'block_user', { p_target: B });
    const overview = (await callRpc(db, claims(B), 'friends_overview', {
      p_week_start: WEEK,
    })) as unknown[];
    expect(overview).toHaveLength(0);
    const inv = (await callRpc(db, claims(A), 'create_invite', {})) as { code: string };
    const again = (await callRpc(db, claims(B), 'accept_invite', { p_code: inv.code })) as {
      error?: string;
    };
    expect(again.error).toBe('invalido');
    await callRpc(db, claims(A), 'unblock_user', { p_target: B });
  });

  it('código errado conta tentativa e trava depois de muitas', async () => {
    for (let i = 0; i < 20; i += 1) {
      await callRpc(db, claims(C), 'accept_invite', { p_code: 'ZZZZZZZZ' });
    }
    const locked = (await callRpc(db, claims(C), 'accept_invite', { p_code: 'ZZZZZZZZ' })) as {
      error?: string;
    };
    expect(locked.error).toBe('tentativas');
  });
});

describe('18. ranking do grupo no banco', () => {
  it('5 de 3 e 3 de 3 empatam em 100%; 2 de 3 fica abaixo', async () => {
    const D = '00000000-0000-4000-8000-00000000000d';
    const E = '00000000-0000-4000-8000-00000000000e';
    const F = '00000000-0000-4000-8000-00000000000f';
    await createUser(db, D, 'd@test.dev');
    await createUser(db, E, 'e@test.dev');
    await createUser(db, F, 'f@test.dev');
    const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
    await push(D, [profile(D, 'Duda'), plan(3, 0), ...days.map((d, i) => session(`d${i}`, d))]);
    await push(E, [
      profile(E, 'Edu'),
      plan(3, 0),
      ...days.slice(0, 3).map((d, i) => session(`e${i}`, d)),
    ]);
    await push(F, [
      profile(F, 'Fê'),
      plan(3, 0),
      ...days.slice(0, 2).map((d, i) => session(`f${i}`, d)),
    ]);
    const g = (await callRpc(db, claims(D), 'create_group', { p_name: 'Turma das 6h' })) as {
      id: string;
      join_code: string;
    };
    await callRpc(db, claims(E), 'join_group', { p_code: g.join_code });
    await callRpc(db, claims(F), 'join_group', { p_code: g.join_code.toLowerCase() });
    const outsider = (await callRpc(db, claims(C), 'group_ranking', {
      p_group: g.id,
      p_week_start: WEEK,
    })) as {
      error?: string;
    };
    expect(outsider.error).toBe('nao_membro');
    const res = (await callRpc(db, claims(E), 'group_ranking', {
      p_group: g.id,
      p_week_start: WEEK,
    })) as {
      members: { name: string; pct: number; position: number }[];
    };
    expect(res.members.map((m) => [m.name, Number(m.pct), Number(m.position)])).toEqual([
      ['Duda', 1, 1],
      ['Edu', 1, 1],
      ['Fê', 0.6667, 3],
    ]);
    await callRpc(db, claims(F), 'leave_group', { p_group: g.id });
    const after = (await callRpc(db, claims(F), 'group_ranking', {
      p_group: g.id,
      p_week_start: WEEK,
    })) as {
      error?: string;
    };
    expect(after.error).toBe('nao_membro');
  });
});

describe('conta', () => {
  it('apagar a conta remove todos os dados do usuário', async () => {
    expect(await count(C, `select count(*) as n from sets`)).toBeGreaterThan(0);
    await callRpc(db, claims(C), 'delete_account', {});
    const left = await db.query<{ n: number }>(
      `select (select count(*) from public.sets where user_id = $1)
            + (select count(*) from public.profiles where user_id = $1)
            + (select count(*) from auth.users where id = $1) as n`,
      [C],
    );
    expect(Number(left.rows[0]?.n)).toBe(0);
  });
});
