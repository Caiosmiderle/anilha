import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnilhaDB } from '../../data/db';
import { setCurrent, type CurrentStore } from '../../data/store';

vi.mock('../../lib/env', () => ({ backendConfigured: () => true }));
vi.mock('../client', () => ({ accountRpc: vi.fn() }));
const { accountRpc } = await import('../client');
const { useRemote, invalidateRemote } = await import('../remote');

let a: CurrentStore;
let b: CurrentStore;

function read(fn = 'friends_overview') {
  let result!: ReturnType<typeof useRemote<string[]>>;
  function Probe() {
    result = useRemote<string[]>(fn, {});
    return null;
  }
  renderToString(createElement(Probe));
  return result;
}

beforeEach(() => {
  a = { db: {} as AnilhaDB, userId: 'a' };
  b = { db: {} as AnilhaDB, userId: 'b' };
  setCurrent(a);
  vi.stubGlobal('navigator', { onLine: true });
  vi.mocked(accountRpc).mockReset();
});

afterEach(() => {
  setCurrent(null);
  vi.unstubAllGlobals();
});

describe('respostas remotas por conta', () => {
  it('uma conta offline não recebe o cache social ou administrativo da anterior', async () => {
    vi.mocked(accountRpc).mockResolvedValue(['Somente A']);
    await read().refresh();
    await read('admin_users').refresh();
    expect(read().data).toEqual(['Somente A']);

    setCurrent(b);
    vi.stubGlobal('navigator', { onLine: false });
    expect(read().data).toBeUndefined();
    expect(read('admin_users').data).toBeUndefined();
    await read().refresh();
    expect(accountRpc).toHaveBeenCalledTimes(2);
  });

  it('descarta uma resposta antiga que chega depois de sair da conta', async () => {
    let finish!: (value: string[]) => void;
    vi.mocked(accountRpc).mockReturnValue(
      new Promise<string[]>((resolve) => {
        finish = resolve;
      }),
    );
    const request = read().refresh();
    setCurrent(b);
    finish(['Resposta atrasada de A']);
    await request;
    expect(read().data).toBeUndefined();
    setCurrent(a);
    expect(read().data).toBeUndefined();
  });

  it('invalidar uma leitura só remove o cache da conta atual', async () => {
    vi.mocked(accountRpc).mockResolvedValue(['A']);
    await read().refresh();
    setCurrent(b);
    vi.mocked(accountRpc).mockResolvedValue(['B']);
    await read().refresh();
    invalidateRemote('friends_overview');
    expect(read().data).toBeUndefined();
    setCurrent(a);
    expect(read().data).toEqual(['A']);
  });
});
