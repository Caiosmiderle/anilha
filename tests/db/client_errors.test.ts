/**
 * Error log of the app: the same error counts up instead of piling rows, at most 30
 * new errors per person per hour, nobody reads the table, anonymous cannot write.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, callRpc, createUser, openDatabase, type Claims } from '../../server/pg';

const U = '00000000-0000-4000-8000-0000000000e1';
const claims: Claims = { sub: U, role: 'authenticated' };
let db: PGlite;

const log = (message: string, stack: string | null = 'at x') =>
  callRpc(db, claims, 'log_client_error', {
    p_message: message,
    p_stack: stack,
    p_url: '/treino/1',
    p_version: '2026-10-19T06:00',
    p_user_agent: 'teste',
  }) as Promise<{ ok: boolean }>;

beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, U, 'erro@test.dev');
});

afterAll(async () => {
  await db.close();
});

describe('registro de erros', () => {
  it('o mesmo erro conta em vez de repetir linha', async () => {
    await log('x is undefined');
    await log('x is undefined');
    const r = await db.query<{ count: number; n: number }>(
      `select max(count)::int as count, count(*)::int as n from public.client_errors where message = 'x is undefined'`,
    );
    expect(r.rows[0]).toEqual({ count: 2, n: 1 });
  });

  it('no máximo 30 erros novos por hora', async () => {
    for (let i = 0; i < 35; i += 1) await log(`erro ${i}`);
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from public.client_errors where user_id = $1`,
      [U],
    );
    expect(r.rows[0]?.n).toBe(30);
  });

  it('ninguém lê a tabela; anônimo não registra', async () => {
    const n = await asUser(db, claims, async (tx) => {
      const r = await tx.query<{ n: number }>(
        'select count(*)::int as n from public.client_errors',
      );
      return r.rows[0]?.n;
    });
    expect(n).toBe(0);
    await expect(
      callRpc(db, null, 'log_client_error', {
        p_message: 'a',
        p_stack: null,
        p_url: '/',
        p_version: 'v',
        p_user_agent: 'u',
      }),
    ).rejects.toThrow();
  });
});
