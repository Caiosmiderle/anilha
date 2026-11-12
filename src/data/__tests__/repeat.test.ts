import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type AnilhaDB } from '../db';
import { itemsFromLastSession, itemsFromSession } from '../ops';
import { saveMany, setCurrent, type Change } from '../store';

let database: AnilhaDB;
let sequence = 0;

function session(id: string, startedAt: number, exerciseId: string): Change[] {
  return [
    {
      table: 'sessions',
      row: {
        id,
        deleted: false,
        local_date: '2026-10-20',
        started_at: startedAt,
        ended_at: startedAt + 1,
        status: 'done',
        split_key: 'peito_triceps',
        title: 'Ficha A',
        routine_id: null,
        source: 'plan',
        note: null,
        detail: 'full',
        rest_started_at: null,
        rest_duration_sec: null,
        adjustments: [],
      },
    },
    {
      table: 'session_items',
      row: {
        id: `${id}-item`,
        deleted: false,
        session_id: id,
        position: 0,
        exercise_id: exerciseId,
        original_exercise_id: null,
        substitution_reason: null,
        status: 'done',
        skip_reason: null,
        planned_sets: 3,
        target_min: 8,
        target_max: 12,
        rest_sec: 90,
        warmup_sets: 0,
        note: null,
        pain_joint: null,
        added: false,
      },
    },
  ] as Change[];
}

beforeEach(async () => {
  database = openDb(`repeat-${++sequence}`);
  await database.open();
  setCurrent({ db: database, userId: 'repeat-test' });
  await saveMany([...session('old', 1, 'supino-reto-barra'), ...session('new', 2, 'remada-baixa')]);
});

afterEach(async () => {
  setCurrent(null);
  await database.delete();
});

describe('repetir um treino', () => {
  it('repete a sessão escolhida, não a mais recente da mesma divisão', async () => {
    expect((await itemsFromSession('old')).map((i) => i.exercise_id)).toEqual([
      'supino-reto-barra',
    ]);
    expect((await itemsFromLastSession('peito_triceps'))?.map((i) => i.exercise_id)).toEqual([
      'remada-baixa',
    ]);
  });
});
