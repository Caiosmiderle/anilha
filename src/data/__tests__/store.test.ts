import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, type AnilhaDB } from '../db';
import { patch, setCurrent } from '../store';

let a: AnilhaDB;
let b: AnilhaDB;
let sequence = 0;

beforeEach(async () => {
  a = openDb(`store-a-${++sequence}`);
  b = openDb(`store-b-${sequence}`);
  await Promise.all([a.open(), b.open()]);
  setCurrent({ db: a, userId: 'a' });
  await a.runs.put({ id: 'corrida', user_id: 'a', note: 'Privado', updated_at: 1 } as never);
});

afterEach(async () => {
  setCurrent(null);
  vi.restoreAllMocks();
  await Promise.all([a.delete(), b.delete()]);
});

describe('editar na conta que iniciou a leitura', () => {
  it('não copia a linha da conta anterior se o login muda durante a leitura', async () => {
    let continueRead!: () => void;
    let reading!: () => void;
    const paused = new Promise<void>((resolve) => {
      continueRead = resolve;
    });
    const started = new Promise<void>((resolve) => {
      reading = resolve;
    });
    const row = await a.runs.get('corrida');
    vi.spyOn(a, 'table').mockReturnValueOnce({
      get: async () => {
        reading();
        await paused;
        return row;
      },
    } as never);
    const edit = patch('runs', 'corrida', { note: 'Corrigida' });
    const failure = edit.catch((error: unknown) => error);
    await started;
    setCurrent({ db: b, userId: 'b' });
    continueRead();
    expect(await failure).toBeInstanceOf(Error);
    expect(((await failure) as Error).message).toContain('A conta mudou');

    expect(await b.runs.count()).toBe(0);
    expect(await b.outbox.count()).toBe(0);
    expect((await a.runs.get('corrida'))?.note).toBe('Privado');
  });

  it('continua gravando a edição e sua fila juntas quando a conta não muda', async () => {
    await patch('runs', 'corrida', { note: 'Corrigida' });
    const row = await a.runs.get('corrida');
    expect(row).toMatchObject({ user_id: 'a', note: 'Corrigida' });
    expect(await a.outbox.get('runs:corrida')).toMatchObject({ ts: row?.updated_at });
  });
});
