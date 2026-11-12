import type { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { asUser, callRpc, createUser, openDatabase, type Claims } from '../../server/pg';
import { handleCrunning } from '../../supabase/functions/troca-crunning/core';
import { exampleWeek } from '../../src/engine/fixtures/exampleWeek';
import { EXERCISES } from '../../src/engine/exercises';

const A = '00000000-0000-4000-8000-000000000021';
const B = '00000000-0000-4000-8000-000000000022';
const claims = (sub: string): Claims => ({ sub, role: 'authenticated' });
const today = new Date().toISOString().slice(0, 10);
let db: PGlite;
let token: string;
const run = (extra = {}) => ({
  origem_id: '00000000-0000-4000-8000-000000000001',
  atualizado_em: '2026-11-12T10:00:00Z',
  inicio: '2026-11-12T06:00:00-03:00',
  data_local: '2026-11-12',
  tipo: 'longo',
  distancia_m: 16001,
  duracao_movimento_s: 5400,
  esforco: null,
  ...extra,
});
const plan = (day = today, dayOfWeek = 0) => ({
  origem_id: `plano:2026-11-09:1-${dayOfWeek}`,
  data_local: day,
  tipo: 'longo',
  nome: 'Longão 16 km',
  distancia_m: null,
  duracao_s: null,
  importante: true,
  status: 'planejada',
});
async function generate(user = A) {
  return (await callRpc(db, claims(user), 'crunning_generate_token', {})) as { token: string };
}
async function exchange(hash: string, operation: string, payload: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    const r = await tx.query<{ value: Record<string, unknown> }>(
      'select public.crunning_exchange($1,$2,$3::jsonb) as value',
      [hash, operation, JSON.stringify(payload)],
    );
    return r.rows[0]!.value;
  });
}
async function request(path: string, method = 'GET', body?: unknown, credential = token) {
  const response = await handleCrunning(
    new Request(`http://local/functions/v1/troca-crunning${path}`, {
      method,
      headers: { authorization: `Bearer ${credential}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    exchange,
    today,
  );
  return { status: response.status, body: await response.json() };
}
beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, A, 'troca-a@test.dev');
  await createUser(db, B, 'troca-b@test.dev');
});
beforeEach(async () => {
  token = (await generate()).token;
});
afterAll(async () => {
  await db?.close();
});

describe('troca CRUNNING com migrações reais e handler de produção', () => {
  it('gera 32 bytes, guarda só SHA-256, consulta estado sem hash e impede leitura direta', async () => {
    expect(token.startsWith('anl_')).toBe(true);
    expect(Buffer.from(token.slice(4), 'base64url').byteLength).toBe(32);
    const hash = createHash('sha256').update(token).digest('hex');
    const stored = await db.query<{ token_hash: string }>(
      'select token_hash from public.crunning_tokens where user_id=$1 and revoked_at is null',
      [A],
    );
    expect(stored.rows[0]?.token_hash === hash).toBe(true);
    const state = await callRpc(db, claims(A), 'crunning_token_state', {});
    expect(Object.keys(state as object).sort()).toEqual([
      'created_at',
      'last_used_at',
      'revoked_at',
    ]);
    await expect(
      asUser(db, claims(A), (tx) => tx.query('select token_hash from public.crunning_tokens')),
    ).rejects.toThrow(/permission denied/);
    await expect(callRpc(db, null, 'crunning_generate_token', {})).rejects.toThrow(
      /permission denied/,
    );
  });
  it('usa, troca, revoga e sempre responde 401 genérico', async () => {
    expect((await request('/forca')).status).toBe(200);
    expect(
      ((await callRpc(db, claims(A), 'crunning_token_state', {})) as { last_used_at: string })
        .last_used_at,
    ).toBeTruthy();
    const old = token;
    token = (await generate()).token;
    expect(await request('/forca', 'GET', undefined, old)).toEqual({
      status: 401,
      body: { erro: 'token' },
    });
    await callRpc(db, claims(A), 'crunning_revoke_token', {});
    for (const credential of [token, '', `anl_${'a'.repeat(43)}`])
      expect(await request('/forca', 'GET', undefined, credential)).toEqual({
        status: 401,
        body: { erro: 'token' },
      });
    expect(await request('/corridas', 'POST', { versao: 9 }, old)).toEqual({
      status: 401,
      body: { erro: 'token' },
    });
  });
  it('limita em 60 por hora, incluindo chamadas inválidas, e libera depois da janela', async () => {
    for (let i = 0; i < 60; i++)
      expect((await request('/corridas', 'POST', { versao: 9 })).status).toBe(400);
    expect(await request('/forca')).toEqual({ status: 429, body: { erro: 'limite' } });
    await db.query(
      "update public.crunning_tokens set calls=array[clock_timestamp()-interval '61 minutes'] where user_id=$1",
      [A],
    );
    expect((await request('/forca')).status).toBe(200);
  });
  it('aceita lote parcial, ignora reenvio, aplica edição e lápide sem duplicar', async () => {
    const batch = {
      versao: 1,
      itens: [
        run(),
        run({ origem_id: 'invalido' }),
        run({ origem_id: '00000000-0000-4000-8000-000000000003', distancia_m: -1 }),
      ],
    };
    const first = await request('/corridas', 'POST', batch);
    expect(first.status).toBe(200);
    expect(first.body.aceitos).toBe(1);
    expect(first.body.rejeitados).toHaveLength(2);
    expect((await request('/corridas', 'POST', { versao: 1, itens: [run()] })).body.ignorados).toBe(
      1,
    );
    expect(
      (
        await request('/corridas', 'POST', {
          versao: 1,
          itens: [run({ atualizado_em: '2026-11-12T10:00:00.001Z', apagado: true })],
        })
      ).body.aceitos,
    ).toBe(1);
    const rows = await db.query<{
      deleted: boolean;
      distance_km: number;
      started_at: number;
      source: string;
      activity: null;
    }>('select * from public.runs where user_id=$1', [A]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      deleted: true,
      distance_km: '16.00',
      source: 'crunning',
      activity: null,
    });
    expect(Number(rows.rows[0]!.started_at)).toBe(Date.parse(run().inicio));
    expect(
      (
        await request('/corridas', 'POST', {
          versao: 1,
          itens: [run({ atualizado_em: '2026-11-12T10:00:00.0009Z' })],
        })
      ).body.ignorados,
    ).toBe(1);
  });
  it('lápide mínima apaga a corrida existente e preserva seus outros dados', async () => {
    const item = run({ origem_id: '00000000-0000-4000-8000-000000000010' });
    await request('/corridas', 'POST', { versao: 1, itens: [item] });
    const before = (
      await db.query<Record<string, unknown>>(
        'select * from public.runs where user_id=$1 and id=$2',
        [A, `crunning-${item.origem_id}`],
      )
    ).rows[0]!;
    const tombstone = {
      origem_id: item.origem_id,
      atualizado_em: '2026-11-12T10:00:00.001Z',
      apagado: true,
    };
    expect(await request('/corridas', 'POST', { versao: 1, itens: [tombstone] })).toEqual({
      status: 200,
      body: { versao: 1, aceitos: 1, ignorados: 0, rejeitados: [] },
    });
    const after = (
      await db.query<Record<string, unknown>>(
        'select * from public.runs where user_id=$1 and id=$2',
        [A, `crunning-${item.origem_id}`],
      )
    ).rows[0]!;
    expect(after).toEqual({
      ...before,
      deleted: true,
      updated_at: Date.parse(tombstone.atualizado_em),
      crunning_updated_at: new Date(tombstone.atualizado_em),
      server_seq: after.server_seq,
    });
    expect(Number(after.server_seq)).toBeGreaterThan(Number(before.server_seq));
    expect((await request('/corridas', 'POST', { versao: 1, itens: [tombstone] })).body).toEqual({
      versao: 1,
      aceitos: 0,
      ignorados: 1,
      rejeitados: [],
    });
  });
  it('lápide mínima de corrida inexistente conta em ignorados sem criar linha', async () => {
    const tombstone = {
      origem_id: '00000000-0000-4000-8000-000000000011',
      atualizado_em: run().atualizado_em,
      apagado: true,
    };
    expect((await request('/corridas', 'POST', { versao: 1, itens: [tombstone] })).body).toEqual({
      versao: 1,
      aceitos: 0,
      ignorados: 1,
      rejeitados: [],
    });
    expect(
      (
        await db.query('select * from public.runs where user_id=$1 and id=$2', [
          A,
          `crunning-${tombstone.origem_id}`,
        ])
      ).rows,
    ).toEqual([]);
  });
  it('lápide mais velha ou igual não apaga nem muda a corrida', async () => {
    const item = run({ origem_id: '00000000-0000-4000-8000-000000000012' });
    await request('/corridas', 'POST', { versao: 1, itens: [item] });
    const before = await db.query('select * from public.runs where user_id=$1 and id=$2', [
      A,
      `crunning-${item.origem_id}`,
    ]);
    for (const atualizado_em of ['2026-11-12T09:59:59Z', item.atualizado_em]) {
      expect(
        (
          await request('/corridas', 'POST', {
            versao: 1,
            itens: [{ origem_id: item.origem_id, atualizado_em, apagado: true }],
          })
        ).body,
      ).toEqual({ versao: 1, aceitos: 0, ignorados: 1, rejeitados: [] });
    }
    expect(
      (
        await db.query('select * from public.runs where user_id=$1 and id=$2', [
          A,
          `crunning-${item.origem_id}`,
        ])
      ).rows,
    ).toEqual(before.rows);
  });
  it('corrida reenviada mais nova volta a existir após lápide com outros campos inválidos', async () => {
    const item = run({ origem_id: '00000000-0000-4000-8000-000000000013' });
    await request('/corridas', 'POST', { versao: 1, itens: [item] });
    expect(
      (
        await request('/corridas', 'POST', {
          versao: 1,
          itens: [
            {
              origem_id: item.origem_id,
              atualizado_em: '2026-11-12T10:00:00.001Z',
              apagado: true,
              inicio: 'inválido',
              data_local: false,
              tipo: [],
              distancia_m: -1,
              duracao_movimento_s: null,
              esforco: {},
              planejado: { semana: -1 },
            },
          ],
        })
      ).body,
    ).toEqual({ versao: 1, aceitos: 1, ignorados: 0, rejeitados: [] });
    const newer = { ...item, atualizado_em: '2026-11-12T10:00:00.002Z', distancia_m: 17000 };
    expect((await request('/corridas', 'POST', { versao: 1, itens: [newer] })).body).toEqual({
      versao: 1,
      aceitos: 1,
      ignorados: 0,
      rejeitados: [],
    });
    const rows = await db.query('select * from public.runs where user_id=$1 and id=$2', [
      A,
      `crunning-${item.origem_id}`,
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      deleted: false,
      distance_km: '17.00',
      updated_at: Date.parse(newer.atualizado_em),
    });
  });
  it('valida limites antes da RPC e aceita a borda de 5 m', async () => {
    const spy = vi.fn(exchange);
    const minimum = run({ origem_id: '00000000-0000-4000-8000-000000000014', distancia_m: 5 });
    const maximum = run({
      origem_id: '00000000-0000-4000-8000-000000000015',
      distancia_m: 300000,
      duracao_movimento_s: 172800,
    });
    const invalid = [
      run({ distancia_m: 4.999 }),
      run({ distancia_m: 300000.001 }),
      run({ duracao_movimento_s: 172801 }),
      run({ duracao_movimento_s: 0 }),
    ];
    const response = await handleCrunning(
      new Request('http://local/functions/v1/troca-crunning/corridas', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ versao: 1, itens: [minimum, maximum, ...invalid] }),
      }),
      spy,
      today,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      versao: 1,
      aceitos: 2,
      ignorados: 0,
      rejeitados: invalid.map((x) => ({ origem_id: x.origem_id, motivo: 'campos' })),
    });
    expect(spy.mock.calls).toHaveLength(1);
    expect(spy.mock.calls[0]![2].itens).toHaveLength(2);
    const rows = await db.query<{ distance_km: string }>(
      'select distance_km from public.runs where user_id=$1 and id=$2',
      [A, `crunning-${minimum.origem_id}`],
    );
    expect(rows.rows[0]?.distance_km).toBe('0.01');
  });
  it('GET aceita versão 1 explícita ou ausente e rejeita outra versão', async () => {
    for (const path of ['/forca', '/forca?versao=1']) {
      const response = await request(path);
      expect(response.status).toBe(200);
      expect(response.body.versao).toBe(1);
    }
    expect(await request('/forca?versao=2')).toEqual({ status: 400, body: { erro: 'versao' } });
  });
  it('substitui só a janela, sincroniza lápides e rejeita snapshot inválido inteiro', async () => {
    const snapshot = { versao: 1, de: today, ate: today, itens: [plan()] };
    expect((await request('/planejados/corrida', 'PUT', snapshot)).body.gravados).toBe(1);
    expect(
      (
        await request('/planejados/corrida', 'PUT', {
          ...snapshot,
          itens: [plan(), { ...plan(today, 1), nome: 'x'.repeat(61) }],
        })
      ).status,
    ).toBe(400);
    const before = await db.query(
      'select * from public.external_plan_items where user_id=$1 and not deleted',
      [A],
    );
    expect(before.rows).toHaveLength(1);
    expect(
      (await request('/planejados/corrida', 'PUT', { ...snapshot, itens: [] })).body.apagados,
    ).toBe(1);
    const pull = (await callRpc(db, claims(A), 'sync_pull', { since: 0 })) as {
      rows: { table: string; row: { deleted: boolean } }[];
    };
    expect(pull.rows.some((r) => r.table === 'external_plan_items' && r.row.deleted)).toBe(true);
  });
  it('RLS isola duas contas e bloqueia escrita do cliente, inclusive sync_push', async () => {
    await request('/planejados/corrida', 'PUT', {
      versao: 1,
      de: today,
      ate: today,
      itens: [plan()],
    });
    expect(
      (await asUser(db, claims(B), (tx) => tx.query('select * from public.external_plan_items')))
        .rows,
    ).toHaveLength(0);
    const pull = (await callRpc(db, claims(B), 'sync_pull', { since: 0 })) as { rows: unknown[] };
    expect(pull.rows).toHaveLength(0);
    const result = (await callRpc(db, claims(A), 'sync_push', {
      changes: [
        { table: 'external_plan_items', row: { id: 'forjado', updated_at: 1, deleted: false } },
      ],
    })) as { rejected: unknown[] };
    expect(result.rejected).toHaveLength(1);
    await expect(
      callRpc(db, claims(A), 'crunning_exchange', {
        p_hash: 'x',
        p_operation: 'forca',
        p_payload: {},
      }),
    ).rejects.toThrow(/permission denied/);
    const other = (await generate(B)).token;
    expect((await request('/forca', 'GET', undefined, other)).body.feitas).toEqual([]);
    await request(
      '/corridas',
      'POST',
      { versao: 1, itens: [run({ origem_id: '00000000-0000-4000-8000-000000000002' })] },
      other,
    );
    const rows = await asUser(db, claims(A), (tx) =>
      tx.query(
        "select id from public.runs where id='crunning-00000000-0000-4000-8000-000000000002'",
      ),
    );
    expect(rows.rows).toHaveLength(0);
  });
  it('cursor de força reflete séries, exclui aquecimento, exporta parcial e lápide sem dados privados', async () => {
    const fixture = exampleWeek(A);
    const session = {
      ...fixture.sessions[0]!,
      id: 'forca-teste',
      local_date: today,
      updated_at: 100,
      note: 'privado',
    };
    const leg = EXERCISES.find((e) => e.primary_group === 'pernas')!;
    const baseSet = {
      ...fixture.sets[0]!,
      session_id: session.id,
      exercise_id: leg.id,
      updated_at: 101,
      completed_at: Date.now(),
    };
    const item = {
      ...fixture.items[0]!,
      id: 'item-forca',
      session_id: session.id,
      status: 'skipped',
      updated_at: 102,
    };
    const pushed = (await callRpc(db, claims(A), 'sync_push', {
      changes: [
        { table: 'sessions', row: session },
        { table: 'sets', row: { ...baseSet, id: 'work-forca', kind: 'work' } },
        { table: 'sets', row: { ...baseSet, id: 'warm-forca', kind: 'warmup' } },
        { table: 'session_items', row: item },
      ],
    })) as { rejected: unknown[] };
    expect(pushed.rejected).toEqual([]);
    const first = await request('/forca');
    expect(first.status).toBe(200);
    expect(first.body.feitas[0]).toMatchObject({
      origem_id: session.id,
      series_pernas: 1,
      pernas: true,
      esforco: null,
      status: 'parcial',
    });
    expect(JSON.stringify(first.body)).not.toContain('privado');
    const cursor = first.body.cursor;
    expect((await request(`/forca?desde=${cursor}`)).body.feitas).toEqual([]);
    await callRpc(db, claims(A), 'sync_push', {
      changes: [
        {
          table: 'sets',
          row: { ...baseSet, id: 'work-forca', kind: 'work', updated_at: 103, deleted: true },
        },
      ],
    });
    const next = await request(`/forca?desde=${cursor}`);
    expect(next.body.feitas[0].series_pernas).toBe(0);
    expect(Date.parse(next.body.feitas[0].atualizado_em)).toBe(103);
    await callRpc(db, claims(A), 'sync_push', {
      changes: [{ table: 'sessions', row: { ...session, updated_at: 104, deleted: true } }],
    });
    expect((await request(`/forca?desde=${next.body.cursor}`)).body.feitas[0].apagado).toBe(true);
    expect((await request('/forca?desde=abc')).status).toBe(400);
  });
  it('elimina tokens e planejados na exclusão da conta', async () => {
    await db.query('delete from auth.users where id=$1', [B]);
    expect(
      (await db.query('select * from public.crunning_tokens where user_id=$1', [B])).rows,
    ).toEqual([]);
    expect(
      (await db.query('select * from public.external_plan_items where user_id=$1', [B])).rows,
    ).toEqual([]);
  });
});
