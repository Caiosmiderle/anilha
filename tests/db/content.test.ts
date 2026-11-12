/**
 * Team content from the panel: announcements in the inbox (only after the account
 * existed, optionally by notification) and the library of ready-made fichas, with the
 * first four already there. Only the admin writes; everyone signed in reads.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const DONO = '00000000-0000-4000-8000-0000000004a1';
const ANA = '00000000-0000-4000-8000-0000000004a2';
const NOVA = '00000000-0000-4000-8000-0000000004a3';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });
let db: PGlite;

const inbox = (uid: string) =>
  callRpc(db, claims(uid), 'inbox', {
    p_since: new Date(Date.now() - 30 * 86400000).toISOString(),
  }) as Promise<{ kind: string; title?: string; url?: string }[]>;

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, DONO, 'dono-conteudo@test.dev');
  await createUser(db, ANA, 'ana-conteudo@test.dev');
  await db.query('insert into public.admins (user_id) values ($1)', [DONO]);
  await callRpc(db, claims(ANA), 'save_push_subscription', {
    p_endpoint: 'https://push.example/ana',
    p_p256dh: 'key',
    p_auth: 'auth',
  });
});

afterAll(async () => {
  await db.close();
});

describe('avisos do Anilha', () => {
  it('o admin publica; aparece no sino de quem já tinha conta e vai por notificação', async () => {
    await expect(
      callRpc(db, claims(ANA), 'admin_announce', {
        p_title: 'x',
        p_body: 'y',
        p_url: null,
        p_push: false,
      }),
    ).rejects.toThrow(/Sem permissão/);
    await expect(
      callRpc(db, claims(DONO), 'admin_announce', {
        p_title: 'Novidade',
        p_body: 'Texto',
        p_url: 'https://fora.com',
        p_push: false,
      }),
    ).rejects.toThrow(/tela do app/);

    const sent = (await callRpc(db, claims(DONO), 'admin_announce', {
      p_title: 'Fichas prontas',
      p_body: 'Em Plano, Fichas prontas: quatro para começar.',
      p_url: '/plano/fichas-prontas',
      p_push: true,
    })) as { id: string };
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await inbox(ANA)).find((i) => i.kind === 'announcement')).toMatchObject({
      title: 'Fichas prontas',
      url: '/plano/fichas-prontas',
    });
    const jobs = await db.query<{ n: number }>(
      `select count(*)::int as n from public.push_jobs where user_id = $1 and topic = 'aviso'`,
      [ANA],
    );
    expect(jobs.rows[0]?.n).toBe(1);
  });

  it('conta criada depois não recebe aviso antigo', async () => {
    await db.query(`update public.announcements set created_at = now() - interval '5 days'`);
    // Ana had her account before it; Nova signs up now.
    await db.query(`update auth.users set created_at = now() - interval '10 days' where id = $1`, [
      ANA,
    ]);
    await createUser(db, NOVA, 'nova-conteudo@test.dev');
    expect((await inbox(NOVA)).some((i) => i.kind === 'announcement')).toBe(false);
    expect((await inbox(ANA)).some((i) => i.kind === 'announcement')).toBe(true);
  });

  it('o admin lista e apaga', async () => {
    const list = (await callRpc(db, claims(DONO), 'admin_announcements', {})) as {
      id: string;
    }[];
    expect(list).toHaveLength(1);
    await callRpc(db, claims(DONO), 'admin_delete_announcement', { p_id: list[0]?.id });
    expect((await inbox(ANA)).some((i) => i.kind === 'announcement')).toBe(false);
  });
});

describe('fichas prontas', () => {
  it('a biblioteca já começa com quatro fichas válidas', async () => {
    const lib = (await callRpc(db, claims(ANA), 'library', {})) as {
      name: string;
      items: { exercise_id: string; superset: string | null }[];
    }[];
    expect(lib.map((l) => l.name).sort()).toEqual([
      'Corpo inteiro para começar',
      'Em casa com halteres',
      'Glúteo e posterior',
      'Treino de 30 minutos',
    ]);
    // Bi-sets come in adjacent pairs.
    const quick = lib.find((l) => l.name === 'Treino de 30 minutos');
    expect(quick?.items.map((i) => i.superset)).toEqual(['a', 'a', 'b', 'b', null]);
  });

  it('só o admin publica e tira do ar; adicionar conta só o número', async () => {
    const item = {
      exercise_id: 'supino-reto-barra',
      sets: 3,
      target_min: 8,
      target_max: 12,
      rest_sec: 90,
      warmup_sets: 0,
      note: null,
      superset: null,
    };
    await expect(
      callRpc(db, claims(ANA), 'admin_publish_routine', {
        p_name: 'x',
        p_description: null,
        p_items: [item],
        p_exercises: [],
      }),
    ).rejects.toThrow(/Sem permissão/);
    const pub = (await callRpc(db, claims(DONO), 'admin_publish_routine', {
      p_name: 'Peito em 40 minutos',
      p_description: 'Só peito.',
      p_items: [item],
      p_exercises: [],
    })) as { id: string };
    await callRpc(db, claims(ANA), 'count_library_add', { p_id: pub.id });
    await callRpc(db, claims(NOVA), 'count_library_add', { p_id: pub.id });
    const admin = (await callRpc(db, claims(DONO), 'admin_library', {})) as {
      id: string;
      adds: number;
      exercises_count: number;
    }[];
    expect(admin.find((l) => l.id === pub.id)).toMatchObject({ adds: 2, exercises_count: 1 });
    await callRpc(db, claims(DONO), 'admin_unpublish_routine', { p_id: pub.id });
    const lib = (await callRpc(db, claims(ANA), 'library', {})) as { id: string }[];
    expect(lib.some((l) => l.id === pub.id)).toBe(false);
  });
});
