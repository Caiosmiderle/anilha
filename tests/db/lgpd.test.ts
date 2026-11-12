/**
 * LGPD on the server: consent history, health data only with consent (revoking deletes
 * it and keeps it from coming back), the message box, and retention of deleted rows.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const A = '00000000-0000-4000-8000-0000000001a1';
const B = '00000000-0000-4000-8000-0000000001a2';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });
let db: PGlite;

interface PushResult {
  applied: number;
  stale: number;
  rejected: { id: string; error: string }[];
}

const push = (uid: string, changes: unknown[]) =>
  callRpc(db, claims(uid), 'sync_push', { changes }) as Promise<PushResult>;

const consent = (uid: string, kind: string, granted: boolean) =>
  callRpc(db, claims(uid), 'record_consent', {
    p_kind: kind,
    p_version: '2026-10-19',
    p_granted: granted,
  }) as Promise<{ termos: { granted: boolean } | null; saude: { granted: boolean } | null }>;

const body = (id: string, extra: Record<string, unknown> = {}) => ({
  table: 'body_logs',
  row: {
    id,
    updated_at: Date.now(),
    deleted: false,
    local_date: '2026-10-19',
    weight_kg: 80,
    waist_cm: 85,
    note: 'manhã',
    ...extra,
  },
});

const pain = (id: string, extra: Record<string, unknown> = {}) => ({
  table: 'pain_reports',
  row: {
    id,
    updated_at: Date.now(),
    deleted: false,
    local_date: '2026-10-19',
    exercise_id: 'supino-reto',
    session_id: 's1',
    joint: 'ombro',
    ...extra,
  },
});

const spare = (id: string) => ({
  table: 'day_overrides',
  row: {
    id,
    updated_at: Date.now(),
    deleted: false,
    local_date: '2026-10-19',
    action: 'spare_joint',
    value: 'joelho',
  },
});

const item = (id: string, painJoint: string | null) => ({
  table: 'session_items',
  row: {
    id,
    updated_at: Date.now(),
    deleted: false,
    session_id: 's1',
    position: 0,
    exercise_id: 'supino-reto',
    status: 'done',
    planned_sets: 3,
    target_min: 8,
    target_max: 12,
    rest_sec: 90,
    warmup_sets: 0,
    added: false,
    pain_joint: painJoint,
  },
});

const profile = (uid: string, joints: string[]) => ({
  table: 'profiles',
  row: {
    id: uid,
    updated_at: Date.now(),
    deleted: false,
    display_name: 'Ana',
    unit: 'kg',
    rest_sec: 90,
    timezone: 'America/Sao_Paulo',
    share_adherence: true,
    share_workouts: true,
    share_records: true,
    share_details: false,
    return_mode: 'auto',
    reminders: { enabled: false },
    onboarding: { spare_joints: joints, returning: false },
  },
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0] as T;
}

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, A, 'lgpd-a@test.dev');
  await createUser(db, B, 'lgpd-b@test.dev');
});

afterAll(async () => {
  await db.close();
});

describe('consentimento', () => {
  it('guarda o histórico e devolve a escolha atual', async () => {
    const before = (await callRpc(db, claims(A), 'consent_state', {})) as {
      termos: unknown;
      saude: unknown;
    };
    expect(before).toEqual({ termos: null, saude: null });
    await consent(A, 'termos', true);
    await consent(A, 'saude', false);
    const now = await consent(A, 'saude', true);
    expect(now.termos?.granted).toBe(true);
    expect(now.saude?.granted).toBe(true);
    const history = (await callRpc(db, claims(A), 'consent_history', {})) as unknown[];
    expect(history).toHaveLength(3);
  });

  it('termos não se recusam por aqui; anônimo não registra; ninguém grava direto', async () => {
    await expect(consent(A, 'termos', false)).rejects.toThrow(/aceitar os termos/);
    await expect(
      callRpc(db, null, 'record_consent', {
        p_kind: 'saude',
        p_version: 'v',
        p_granted: true,
      }),
    ).rejects.toThrow();
    await expect(
      asUser(db, claims(A), (tx) =>
        tx.query(
          `insert into public.consents (user_id, kind, version, granted) values ($1, 'saude', 'x', true)`,
          [A],
        ),
      ),
    ).rejects.toThrow();
    // B does not see A's history.
    const seen = await asUser(db, claims(B), async (tx) => {
      const r = await tx.query<{ n: number }>('select count(*)::int as n from public.consents');
      return r.rows[0]?.n;
    });
    expect(seen).toBe(0);
  });
});

describe('dados de saúde', () => {
  it('registro de saúde apagado sobe sem os valores', async () => {
    const res = await push(A, [
      body('apagado', { deleted: true }),
      pain('dor-apagada', { deleted: true }),
    ]);
    expect(res.applied).toBe(2);
    const b = await one<{ weight_kg: string | null; note: string | null }>(
      `select weight_kg, note from public.body_logs where user_id = $1 and id = 'apagado'`,
      [A],
    );
    expect(b).toEqual({ weight_kg: null, note: null });
    const p = await one<{ joint: string | null }>(
      `select joint from public.pain_reports where user_id = $1 and id = 'dor-apagada'`,
      [A],
    );
    expect(p.joint).toBeNull();
  });

  it('revogar apaga tudo de saúde e impede que volte', async () => {
    const res = await push(A, [
      body('peso-1'),
      pain('dor-1'),
      spare('poupar-1'),
      item('item-1', 'ombro'),
      profile(A, ['joelho', 'lombar']),
    ]);
    expect(res.rejected).toEqual([]);
    const seqBefore = await one<{ seq: string }>(
      `select server_seq::text as seq from public.session_items where user_id = $1 and id = 'item-1'`,
      [A],
    );

    const state = await consent(A, 'saude', false);
    expect(state.saude?.granted).toBe(false);

    const b = await one<{ deleted: boolean; weight_kg: string | null; waist_cm: string | null }>(
      `select deleted, weight_kg, waist_cm from public.body_logs where user_id = $1 and id = 'peso-1'`,
      [A],
    );
    expect(b).toEqual({ deleted: true, weight_kg: null, waist_cm: null });
    const p = await one<{ deleted: boolean; joint: string | null }>(
      `select deleted, joint from public.pain_reports where user_id = $1 and id = 'dor-1'`,
      [A],
    );
    expect(p).toEqual({ deleted: true, joint: null });
    const o = await one<{ deleted: boolean; value: string | null }>(
      `select deleted, value from public.day_overrides where user_id = $1 and id = 'poupar-1'`,
      [A],
    );
    expect(o).toEqual({ deleted: true, value: null });
    const i = await one<{ pain_joint: string | null; seq: string }>(
      `select pain_joint, server_seq::text as seq from public.session_items where user_id = $1 and id = 'item-1'`,
      [A],
    );
    expect(i.pain_joint).toBeNull();
    // The other phones pull the change.
    expect(BigInt(i.seq)).toBeGreaterThan(BigInt(seqBefore.seq));
    const pr = await one<{ joints: unknown }>(
      `select onboarding -> 'spare_joints' as joints from public.profiles where user_id = $1`,
      [A],
    );
    expect(pr.joints).toEqual([]);

    // A phone that was offline tries to send health data: refused or cleaned.
    const later = await push(A, [
      body('peso-2'),
      pain('dor-2'),
      spare('poupar-2'),
      body('peso-3', { deleted: true }),
      item('item-2', 'joelho'),
      profile(A, ['punho']),
    ]);
    expect(later.rejected.map((r) => [r.id, r.error])).toEqual([
      ['peso-2', 'saude'],
      ['dor-2', 'saude'],
      ['poupar-2', 'saude'],
    ]);
    const i2 = await one<{ pain_joint: string | null }>(
      `select pain_joint from public.session_items where user_id = $1 and id = 'item-2'`,
      [A],
    );
    expect(i2.pain_joint).toBeNull();
    const pr2 = await one<{ joints: unknown }>(
      `select onboarding -> 'spare_joints' as joints from public.profiles where user_id = $1`,
      [A],
    );
    expect(pr2.joints).toEqual([]);

    // Consent again: health data is accepted again.
    await consent(A, 'saude', true);
    const again = await push(A, [body('peso-4')]);
    expect(again.applied).toBe(1);
  });

  it('quem nunca respondeu continua sincronizando como antes', async () => {
    const res = await push(B, [body('peso-b'), pain('dor-b')]);
    expect(res.applied).toBe(2);
  });
});

describe('mensagens', () => {
  it('cria, lista só as suas e aparece no aviso quando respondida', async () => {
    const created = (await callRpc(db, claims(A), 'create_ticket', {
      p_kind: 'acesso',
      p_message: '  Quero saber quais dados vocês têm.  ',
      p_version: '2026-10-19',
      p_user_agent: 'Navegador X',
    })) as { id: string };
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    await callRpc(db, claims(A), 'create_ticket', {
      p_kind: 'problema',
      p_message: 'O botão travou.',
      p_version: '2026-10-19',
      p_user_agent: 'Navegador X',
    });
    const mine = (await callRpc(db, claims(A), 'my_tickets', {})) as {
      kind: string;
      message: string;
      status: string;
    }[];
    expect(mine.map((t) => t.kind)).toEqual(['problema', 'acesso']);
    expect(mine[1]?.message).toBe('Quero saber quais dados vocês têm.');
    expect(mine[1]?.status).toBe('aberto');
    const ua = await db.query<{ kind: string; user_agent: string | null }>(
      `select kind, user_agent from public.tickets where user_id = $1 order by kind`,
      [A],
    );
    expect(ua.rows).toEqual([
      { kind: 'acesso', user_agent: null },
      { kind: 'problema', user_agent: 'Navegador X' },
    ]);
    expect(await callRpc(db, claims(B), 'my_tickets', {})).toEqual([]);

    await db.query(
      `update public.tickets set status = 'respondido', answer = 'Segue a lista.', answered_at = now() where id = $1`,
      [created.id],
    );
    const inbox = (await callRpc(db, claims(A), 'inbox', {
      p_since: new Date(Date.now() - 86400000).toISOString(),
    })) as { kind: string; id?: string }[];
    expect(inbox.find((i) => i.kind === 'ticket_answer')?.id).toBe(created.id);
  });

  it('assunto inválido, texto vazio e mais de 5 por dia são recusados; ninguém lê a tabela', async () => {
    const send = (kind: string, message: string) =>
      callRpc(db, claims(B), 'create_ticket', {
        p_kind: kind,
        p_message: message,
        p_version: null,
        p_user_agent: null,
      });
    await expect(send('spam', 'oi')).rejects.toThrow(/Assunto/);
    await expect(send('outro', '   ')).rejects.toThrow(/caracteres/);
    for (let i = 0; i < 5; i += 1) await send('sugestao', `ideia ${i}`);
    await expect(send('sugestao', 'mais uma')).rejects.toThrow(/5 mensagens/);
    const n = await asUser(db, claims(B), async (tx) => {
      const r = await tx.query<{ n: number }>('select count(*)::int as n from public.tickets');
      return r.rows[0]?.n;
    });
    expect(n).toBe(0);
  });
});

describe('retenção', () => {
  it('apaga registros apagados há mais de 30 dias e avisa os aparelhos atrasados', async () => {
    const old = Date.now() - 31 * 86400000;
    await push(B, [
      {
        table: 'runs',
        row: {
          id: 'corrida-velha',
          updated_at: old,
          deleted: true,
          local_date: '2026-09-01',
          distance_km: 5,
          duration_sec: 1800,
          run_type: 'leve',
          source: 'manual',
        },
      },
      {
        table: 'runs',
        row: {
          id: 'corrida-recente',
          updated_at: Date.now(),
          deleted: true,
          local_date: '2026-10-18',
          distance_km: 5,
          duration_sec: 1800,
          run_type: 'leve',
          source: 'manual',
        },
      },
      {
        table: 'runs',
        row: {
          id: 'corrida-viva',
          updated_at: old,
          deleted: false,
          local_date: '2026-09-01',
          distance_km: 5,
          duration_sec: 1800,
          run_type: 'leve',
          source: 'manual',
        },
      },
    ]);
    const oldSeq = await one<{ seq: string }>(
      `select server_seq::text as seq from public.runs where user_id = $1 and id = 'corrida-velha'`,
      [B],
    );
    await db.query(
      `insert into public.code_attempts (user_id, at) values ($1, now() - interval '2 days'), ($1, now())`,
      [B],
    );

    const out = (
      await db.query<{ r: { tombstones: number } }>('select public.purge_old_data() as r')
    ).rows[0]?.r;
    expect(out?.tombstones).toBeGreaterThanOrEqual(1);

    const runs = await db.query<{ id: string }>(
      `select id from public.runs where user_id = $1 order by id`,
      [B],
    );
    expect(runs.rows.map((r) => r.id)).toEqual(['corrida-recente', 'corrida-viva']);
    const attempts = await one<{ n: number }>(
      `select count(*)::int as n from public.code_attempts where user_id = $1`,
      [B],
    );
    expect(attempts.n).toBe(1);

    const pulled = (await callRpc(db, claims(B), 'sync_pull', { since: 0 })) as {
      horizon: number;
    };
    expect(String(pulled.horizon)).toBe(oldSeq.seq);
    const ids = (await callRpc(db, claims(B), 'sync_ids', {})) as Record<string, string[]>;
    expect(ids.runs?.sort()).toEqual(['corrida-recente', 'corrida-viva']);
    // A has no purged rows: horizon 0.
    const a = (await callRpc(db, claims(A), 'sync_pull', { since: 0, max_rows: 1 })) as {
      horizon: number;
    };
    expect(a.horizon).toBe(0);
    await expect(callRpc(db, claims(B), 'purge_old_data', {})).rejects.toThrow();
  });
});
