import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, type AnilhaDB } from '../../data/db';
import { setCurrent, type CurrentStore } from '../../data/store';

vi.mock('../../lib/env', () => ({ backendConfigured: () => true }));
vi.mock('../client', () => ({
  getClient: vi.fn(),
  rpc: vi.fn(),
  accountRpc: vi.fn(),
  AccountChangedError: class extends Error {},
}));
const { getClient, accountRpc } = await import('../client');
const { syncNow } = await import('../sync');

let a: AnilhaDB;
let b: AnilhaDB;
let ownerA: CurrentStore;
let ownerB: CurrentStore;
let authId: string;
let sequence = 0;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const emptyPull = { rows: [], cursor: 0, more: false };
const pushed = { applied: 1, stale: 0, rejected: [] };

beforeEach(async () => {
  a = openDb(`sync-a-${++sequence}`);
  b = openDb(`sync-b-${sequence}`);
  await Promise.all([a.open(), b.open()]);
  ownerA = { db: a, userId: 'a' };
  ownerB = { db: b, userId: 'b' };
  authId = 'a';
  setCurrent(ownerA);
  vi.stubGlobal('navigator', { onLine: true });
  vi.mocked(getClient).mockResolvedValue({
    auth: { getSession: async () => ({ data: { session: { user: { id: authId } } } }) },
  } as never);
  vi.mocked(accountRpc).mockReset();
  vi.mocked(accountRpc).mockImplementation(async (_owner, fn) =>
    fn === 'sync_push' ? pushed : emptyPull,
  );
});

afterEach(async () => {
  setCurrent(null);
  await syncNow();
  vi.unstubAllGlobals();
  await Promise.all([a.delete(), b.delete()]);
});

describe('sincronização vinculada à conta', () => {
  it('não usa a sessão B para sincronizar o banco local A', async () => {
    authId = 'b';
    await syncNow();
    expect(accountRpc).not.toHaveBeenCalled();
    expect(await a.meta.get('initial_pull_done')).toBeUndefined();
  });

  it('trocar a conta durante o push preserva a fila anterior e não puxa no banco novo', async () => {
    await a.runs.put({ id: 'corrida-a', user_id: 'a', updated_at: 1 } as never);
    await a.outbox.put({ key: 'runs:corrida-a', table: 'runs', id: 'corrida-a', ts: 1 });
    const started = deferred<void>();
    const response = deferred<typeof pushed>();
    vi.mocked(accountRpc).mockImplementationOnce(async (_owner, fn) => {
      expect(fn).toBe('sync_push');
      started.resolve();
      return response.promise;
    });
    const oldSync = syncNow();
    await started.promise;
    setCurrent(ownerB);
    authId = 'b';
    response.resolve(pushed);
    await oldSync;

    expect(await a.outbox.count()).toBe(1);
    expect(await b.runs.count()).toBe(0);
    expect(await b.meta.count()).toBe(0);
    expect(accountRpc).toHaveBeenCalledTimes(1);
    await syncNow();
    expect(accountRpc).toHaveBeenLastCalledWith(ownerB, 'sync_pull', { since: 0, max_rows: 500 });
    expect((await b.meta.get('initial_pull_done'))?.value).toBe(true);
  });

  it('uma resposta de pull anterior não entra no banco nem avança cursor após sair', async () => {
    const started = deferred<void>();
    const response = deferred<unknown>();
    vi.mocked(accountRpc).mockImplementationOnce(async () => {
      started.resolve();
      return response.promise;
    });
    const oldSync = syncNow();
    await started.promise;
    setCurrent(ownerB);
    authId = 'b';
    response.resolve({
      rows: [{ table: 'runs', row: { id: 'de-a', user_id: 'a', updated_at: 1 } }],
      cursor: 12,
      more: false,
    });
    await oldSync;
    expect(await a.runs.count()).toBe(0);
    expect(await a.meta.get('cursor')).toBeUndefined();
    expect(await b.runs.count()).toBe(0);
    expect(await b.meta.count()).toBe(0);
  });

  it('uma chamada sem conta não impede sincronizar depois do login', async () => {
    setCurrent(null);
    await syncNow();
    setCurrent(ownerA);
    await syncNow();
    expect((await a.meta.get('initial_pull_done'))?.value).toBe(true);
  });

  it('a conta nova sincroniza mesmo se a conexão da anterior ficar pendurada', async () => {
    const started = deferred<void>();
    const response = deferred<typeof emptyPull>();
    vi.mocked(accountRpc).mockImplementationOnce(async () => {
      started.resolve();
      return response.promise;
    });
    const oldSync = syncNow();
    await started.promise;
    setCurrent(ownerB);
    authId = 'b';
    try {
      await syncNow();
      expect((await b.meta.get('initial_pull_done'))?.value).toBe(true);
    } finally {
      response.resolve(emptyPull);
      await oldSync;
    }
    expect(await a.meta.get('cursor')).toBeUndefined();
  });
});
