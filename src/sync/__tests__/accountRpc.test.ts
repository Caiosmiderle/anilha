import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnilhaDB } from '../../data/db';
import { setCurrent, type CurrentStore } from '../../data/store';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn(), setHeader: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getSession: mocks.getSession }, rpc: mocks.rpc }),
}));
vi.mock('../../lib/env', () => ({
  env: { supabaseUrl: 'http://local.invalid', supabaseKey: 'test' },
}));
const { accountRpc, AccountChangedError } = await import('../client');

let a: CurrentStore;
let b: CurrentStore;

beforeEach(() => {
  a = { db: {} as AnilhaDB, userId: 'a' };
  b = { db: {} as AnilhaDB, userId: 'b' };
  setCurrent(a);
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: 'a' }, access_token: 'token-a' } },
  });
  mocks.rpc.mockReturnValue({ setHeader: mocks.setHeader });
  mocks.setHeader.mockResolvedValue({ data: { ok: true }, error: null, status: 200 });
});

afterEach(() => setCurrent(null));

describe('identidade das RPCs de conta', () => {
  it('recusa a chamada quando a sessão não corresponde ao banco aberto', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'b' }, access_token: 'token-b' } },
    });
    await expect(accountRpc(a, 'sync_push', { changes: [] })).rejects.toBeInstanceOf(
      AccountChangedError,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fixa o token da conta e descarta a resposta depois de uma troca', async () => {
    mocks.setHeader.mockImplementationOnce(async () => {
      setCurrent(b);
      return { data: { private: 'a' }, error: null, status: 200 };
    });
    await expect(accountRpc(a, 'friends_overview')).rejects.toBeInstanceOf(AccountChangedError);
    expect(mocks.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer token-a');
  });

  it('devolve a resposta quando banco e sessão continuam na mesma conta', async () => {
    await expect(accountRpc(a, 'sync_pull')).resolves.toEqual({ ok: true });
  });
});
