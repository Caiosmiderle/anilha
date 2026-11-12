import 'fake-indexeddb/auto';
import { liveQuery } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionRow, SetRow } from '../../engine/types';
import { openDb, type AnilhaDB } from '../db';
import { completedSetsInWeek } from '../weekSets';

let db: AnilhaDB;
let sequence = 0;

beforeEach(async () => {
  db = openDb(`week-sets-${++sequence}`);
  await db.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await db.delete();
});

function session(id: string, local_date: string, changes: Partial<SessionRow> = {}): SessionRow {
  return {
    id,
    user_id: 'user',
    updated_at: 0,
    deleted: false,
    local_date,
    started_at: 0,
    ended_at: 1,
    status: 'done',
    split_key: null,
    title: 'Treino',
    routine_id: null,
    source: 'blank',
    note: null,
    detail: 'full',
    rest_started_at: null,
    rest_duration_sec: null,
    adjustments: [],
    ...changes,
  };
}

function set(id: string, session_id: string, changes: Partial<SetRow> = {}): SetRow {
  return {
    id,
    user_id: 'user',
    updated_at: 0,
    deleted: false,
    session_id,
    item_id: `${session_id}-item`,
    exercise_id: 'supino-reto-barra',
    position: 0,
    kind: 'work',
    load_kg: 40,
    reps: 10,
    seconds: null,
    rir: 2,
    note: null,
    completed_at: 1,
    ...changes,
  };
}

describe('séries da semana para volume no retorno', () => {
  it('não acessa o banco quando a consulta está desativada', async () => {
    const unavailable = new Proxy({} as AnilhaDB, {
      get() {
        throw new Error('Banco não deveria ser acessado');
      },
    });

    expect(await completedSetsInWeek(unavailable, '2026-10-22', false)).toEqual([]);
  });

  it('inclui segunda, domingo e a sessão ativa, sem ler séries de outras semanas', async () => {
    await db.sessions.bulkPut([
      session('monday', '2026-10-19'),
      session('sunday', '2026-10-25'),
      session('active', '2026-10-22', { status: 'active', ended_at: null }),
      session('before', '2026-10-18'),
      session('after', '2026-10-26'),
      session('deleted-session', '2026-10-22', { deleted: true }),
    ]);
    await db.sets.bulkPut([
      set('monday', 'monday'),
      set('sunday', 'sunday'),
      set('active', 'active'),
      set('warmup', 'active', { kind: 'warmup' }),
      set('before', 'before'),
      set('after', 'after'),
      set('deleted-session', 'deleted-session'),
      set('orphan', 'missing-session'),
      set('pending', 'active', { completed_at: null }),
      set('deleted-set', 'active', { deleted: true }),
    ]);
    const readIds: string[] = [];
    db.sets.hook('reading', (row) => {
      readIds.push(row.id);
      return row;
    });

    const result = await completedSetsInWeek(db, '2026-10-22', true);

    expect(result.map((s) => s.id).sort()).toEqual(['active', 'monday', 'sunday', 'warmup']);
    expect(readIds).not.toEqual([]);
    expect(readIds).not.toEqual(expect.arrayContaining(['before']));
    expect(readIds).not.toEqual(expect.arrayContaining(['after']));
    expect(readIds).not.toEqual(expect.arrayContaining(['deleted-session']));
    expect(readIds).not.toEqual(expect.arrayContaining(['orphan']));
  });

  it('não consulta séries quando não há sessões na semana pedida', async () => {
    await db.sessions.put(session('older', '2026-10-18'));
    await db.sets.put(set('older', 'older'));
    const querySets = vi.spyOn(db.sets, 'where');

    expect(await completedSetsInWeek(db, '2026-10-22', true)).toEqual([]);
    expect(querySets).not.toHaveBeenCalled();
  });

  it('atualiza o volume ao concluir uma série ativa ou excluir a sessão', async () => {
    await db.sessions.put(session('active', '2026-10-22', { status: 'active', ended_at: null }));
    await db.sets.put(set('pending', 'active', { completed_at: null }));
    const snapshots: string[][] = [];
    const subscription = liveQuery(() => completedSetsInWeek(db, '2026-10-22', true)).subscribe(
      (sets) => snapshots.push(sets.map((s) => s.id)),
    );
    try {
      await vi.waitFor(() => expect(snapshots.at(-1)).toEqual([]));

      await db.sets.update('pending', { completed_at: 2 });
      await vi.waitFor(() => expect(snapshots.at(-1)).toEqual(['pending']));

      await db.sessions.update('active', { deleted: true });
      await vi.waitFor(() => expect(snapshots.at(-1)).toEqual([]));
    } finally {
      subscription.unsubscribe();
    }
  });
});
