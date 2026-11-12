import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WARMUP_REST_SEC } from '../../engine/warmup';
import { openDb, type AnilhaDB } from '../db';
import { applyParsedSets, completeSet, defaultProfile } from '../ops';
import { save, setCurrent } from '../store';

let database: AnilhaDB;
let sequence = 0;

beforeEach(async () => {
  database = openDb(`ops-rest-${++sequence}`);
  await database.open();
  setCurrent({ db: database, userId: 'rest-test' });
  await save('profiles', { ...defaultProfile('rest-test'), rest_sec: 120 });
  await save('sessions', {
    id: 'session',
    deleted: false,
    local_date: '2026-10-26',
    started_at: 1,
    ended_at: null,
    status: 'active',
    split_key: null,
    title: 'Treino de teste',
    routine_id: null,
    source: 'blank',
    note: null,
    detail: 'full',
    rest_started_at: null,
    rest_duration_sec: null,
    adjustments: [],
  });
  await save('session_items', {
    id: 'item',
    deleted: false,
    session_id: 'session',
    position: 0,
    exercise_id: 'supino-reto-barra',
    original_exercise_id: null,
    substitution_reason: null,
    status: 'pending',
    skip_reason: null,
    planned_sets: 1,
    target_min: 8,
    target_max: 12,
    rest_sec: 0,
    warmup_sets: 0,
    note: null,
    pain_joint: null,
    added: false,
  });
  await save('sets', {
    id: 'set',
    deleted: false,
    session_id: 'session',
    item_id: 'item',
    exercise_id: 'supino-reto-barra',
    position: 0,
    kind: 'work',
    load_kg: null,
    reps: null,
    seconds: null,
    rir: null,
    note: null,
    completed_at: null,
  });
  await database.outbox.clear();
});

afterEach(async () => {
  setCurrent(null);
  await database.delete();
});

describe('descanso escolhido no exercício', () => {
  it.each(['tap', 'quick'] as const)(
    'zero no exercício é sem descanso ao concluir por %s, e a sessão vai para a fila',
    async (method) => {
      if (method === 'tap') await completeSet('set', { load_kg: 20, reps: 10, seconds: null });
      else
        await applyParsedSets('item', [
          { kind: 'work', load_kg: 20, reps: 10, seconds: null, rir: null },
        ]);
      // Not the profile's 120 s, and no timer that ends (and chimes) the moment it starts.
      expect(await database.sessions.get('session')).toMatchObject({
        rest_started_at: null,
        rest_duration_sec: null,
      });
      expect((await database.sets.get('set'))?.completed_at).toBeTypeOf('number');
      expect(await database.outbox.get('sessions:session')).toBeDefined();
    },
  );

  it.each(['tap', 'quick'] as const)(
    'o descanso do exercício vale antes do perfil ao concluir por %s',
    async (method) => {
      await database.session_items.update('item', { rest_sec: 45 });
      if (method === 'tap') await completeSet('set', { load_kg: 20, reps: 10, seconds: null });
      else
        await applyParsedSets('item', [
          { kind: 'work', load_kg: 20, reps: 10, seconds: null, rir: null },
        ]);
      const session = await database.sessions.get('session');
      expect(session).toMatchObject({ rest_duration_sec: 45 });
      expect(session?.rest_started_at).toBeTypeOf('number');
    },
  );

  it('mantém o descanso específico de aquecimento', async () => {
    await completeSet('set', { load_kg: 10, reps: 6, seconds: null, kind: 'warmup' });
    expect(await database.sessions.get('session')).toMatchObject({
      rest_duration_sec: WARMUP_REST_SEC,
    });
  });

  it('não inicia descanso no meio de um bi-set', async () => {
    await completeSet('set', { load_kg: 20, reps: 10, seconds: null }, { rest: false });
    expect(await database.sessions.get('session')).toMatchObject({
      rest_started_at: null,
      rest_duration_sec: null,
    });
  });
});
