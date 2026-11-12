/**
 * Direct invites to a group and the inbox, straight against Postgres (PGlite) with the
 * real migrations and row level security.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const D = '00000000-0000-4000-8000-00000000000d';
const E = '00000000-0000-4000-8000-00000000000e';
const F = '00000000-0000-4000-8000-00000000000f';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });

let db: PGlite;
let group = '';

type Inbox = {
  kind: string;
  id?: string;
  status?: string;
  actor_name: string;
  group_name?: string;
}[];

function profile(uid: string, name: string) {
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
    },
  };
}

const rpc = <T>(uid: string, fn: string, args: Record<string, unknown> = {}) =>
  callRpc(db, claims(uid), fn, args) as Promise<T>;

const inbox = (uid: string) => rpc<Inbox>(uid, 'inbox', { p_since: '2026-01-01T00:00:00Z' });

beforeAll(async () => {
  db = await openDatabase();
  for (const [id, name] of [
    [D, 'Duda'],
    [E, 'Enzo'],
    [F, 'Fê'],
  ] as const) {
    await createUser(db, id, `${name.toLowerCase()}@test.dev`);
    await rpc(id, 'sync_push', { changes: [profile(id, name)] });
  }
  // Duda and Enzo are friends; Fê is a stranger to both.
  const inv = await rpc<{ code: string }>(D, 'create_invite');
  await rpc(E, 'accept_invite', { p_code: inv.code });
  group = (await rpc<{ id: string }>(D, 'create_group', { p_name: 'Turma da manhã' })).id;
});

afterAll(async () => {
  await db.close();
});

describe('convite direto para grupo', () => {
  it('lista só amigos, com o estado de cada um', async () => {
    const r = await rpc<{ friends: { name: string; state: string }[] }>(
      D,
      'group_invite_candidates',
      { p_group: group },
    );
    expect(r.friends).toEqual([expect.objectContaining({ name: 'Enzo', state: 'livre' })]);
    // Who is not in the group cannot list or invite.
    const out = await rpc<{ error?: string }>(E, 'group_invite_candidates', { p_group: group });
    expect(out.error).toBe('nao_membro');
  });

  it('só convida amigo, e só quem é do grupo convida', async () => {
    expect(
      (await rpc<{ error?: string }>(D, 'invite_to_group', { p_group: group, p_friend: F })).error,
    ).toBe('nao_amigo');
    expect(
      (await rpc<{ error?: string }>(E, 'invite_to_group', { p_group: group, p_friend: D })).error,
    ).toBe('nao_membro');
  });

  it('convidar duas vezes deixa um convite só', async () => {
    const first = await rpc<{ ok?: boolean; name?: string }>(D, 'invite_to_group', {
      p_group: group,
      p_friend: E,
    });
    expect(first).toEqual({ ok: true, name: 'Enzo' });
    await rpc(D, 'invite_to_group', { p_group: group, p_friend: E });
    const open = (await inbox(E)).filter(
      (i) => i.kind === 'group_invite' && i.status === 'pending',
    );
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ actor_name: 'Duda', group_name: 'Turma da manhã' });
    const r = await rpc<{ friends: { state: string }[] }>(D, 'group_invite_candidates', {
      p_group: group,
    });
    expect(r.friends[0]?.state).toBe('convidado');
  });

  it('ninguém responde o convite dos outros; recusar não entra no grupo', async () => {
    const id = (await inbox(E)).find((i) => i.kind === 'group_invite')?.id as string;
    expect(
      (await rpc<{ error?: string }>(F, 'answer_group_invite', { p_invite: id, p_accept: true }))
        .error,
    ).toBe('invalido');
    expect(
      (await rpc<{ ok?: boolean }>(E, 'answer_group_invite', { p_invite: id, p_accept: false })).ok,
    ).toBe(true);
    const groups = await rpc<{ id: string }[]>(E, 'my_groups');
    expect(groups).toHaveLength(0);
    // Answered once: cannot answer again.
    expect(
      (await rpc<{ error?: string }>(E, 'answer_group_invite', { p_invite: id, p_accept: true }))
        .error,
    ).toBe('invalido');
  });

  it('aceitar entra no grupo e avisa quem convidou', async () => {
    await rpc(D, 'invite_to_group', { p_group: group, p_friend: E });
    const id = (await inbox(E)).find((i) => i.kind === 'group_invite' && i.status === 'pending')
      ?.id as string;
    const r = await rpc<{ ok?: boolean; group_id?: string }>(E, 'answer_group_invite', {
      p_invite: id,
      p_accept: true,
    });
    expect(r).toMatchObject({ ok: true, group_id: group });
    expect((await rpc<{ id: string }[]>(E, 'my_groups')).map((g) => g.id)).toEqual([group]);
    const dudaInbox = await inbox(D);
    expect(dudaInbox.map((i) => i.kind)).toEqual(
      expect.arrayContaining(['group_joined', 'friend']),
    );
    expect(dudaInbox.find((i) => i.kind === 'group_joined')).toMatchObject({
      actor_name: 'Enzo',
      group_name: 'Turma da manhã',
    });
    expect(
      (await rpc<{ error?: string }>(D, 'invite_to_group', { p_group: group, p_friend: E })).error,
    ).toBe('ja_membro');
  });

  it('a tabela de convites não é lida direto, nem pelo convidado', async () => {
    const n = await asUser(db, claims(E), async (tx) => {
      const r = await tx.query<{ n: number }>(
        'select count(*)::int as n from public.group_invites',
      );
      return r.rows[0]?.n;
    });
    expect(n).toBe(0);
    await expect(callRpc(db, null, 'inbox', { p_since: '2026-01-01T00:00:00Z' })).rejects.toThrow();
  });

  it('estranho não vê nada no aviso dos outros', async () => {
    expect(await inbox(F)).toEqual([]);
  });

  it('apagar a conta leva os convites junto', async () => {
    await rpc(E, 'delete_account');
    // As the database owner: the invites table is not readable by any user.
    const r = await db.query<{ n: number }>('select count(*)::int as n from public.group_invites');
    const left = r.rows[0]?.n;
    expect(left).toBe(0);
  });
});
