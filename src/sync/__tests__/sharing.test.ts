/**
 * Sending a ficha on the phone: what travels (items in order, only exercises the sender
 * created) and adding it twice writes the same rows.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, type AnilhaDB } from '../../data/db';
import { setCurrent } from '../../data/store';
import type { ExerciseRow, RoutineItemRow } from '../../engine/types';

vi.mock('../client', () => ({ rpc: vi.fn(async () => ({ ok: true })), getClient: vi.fn() }));
const { rpc } = await import('../client');
const { addSharedRoutine, receivedRoutineId, routinePayload } = await import('../sharing');

let d: AnilhaDB;
let n = 0;

beforeEach(async () => {
  n += 1;
  d = openDb(`ficha-${n}`);
  await d.open();
  setCurrent({ db: d, userId: 'u1' });
  vi.mocked(rpc).mockClear();
});

afterEach(async () => {
  setCurrent(null);
  d.close();
  await d.delete();
});

const item = (id: string, position: number, exercise_id: string, extra = {}) =>
  ({
    id,
    user_id: 'u0',
    updated_at: 1,
    deleted: false,
    routine_id: 'r',
    position,
    exercise_id,
    sets: 3,
    target_min: 8,
    target_max: 12,
    rest_sec: 90,
    warmup_sets: 0,
    note: null,
    reason: 'gerado pelo plano',
    superset: null,
    ...extra,
  }) as RoutineItemRow;

const custom = {
  id: 'meu-crucifixo',
  name: 'Crucifixo da Lia',
  primary_group: 'peito',
  builtin: false,
  equipment: 'halteres',
  measure: 'weight_reps',
  increment_kg: 2,
  pattern: 'crucifixo',
} as unknown as ExerciseRow;

describe('mandar ficha', () => {
  it('leva os exercícios em ordem e só os criados pela pessoa', () => {
    const exMap = new Map<string, ExerciseRow>([
      ['supino-reto', { id: 'supino-reto', name: 'Supino reto', builtin: true } as ExerciseRow],
      ['meu-crucifixo', custom],
    ]);
    const p = routinePayload(
      [
        item('b', 1, 'meu-crucifixo', { superset: 'x' }),
        item('a', 0, 'supino-reto'),
        item('c', 2, 'supino-reto', { deleted: true }),
      ],
      exMap,
    );
    expect(p.items.map((i) => i.exercise_id)).toEqual(['supino-reto', 'meu-crucifixo']);
    expect(p.items[1]).toEqual({
      exercise_id: 'meu-crucifixo',
      sets: 3,
      target_min: 8,
      target_max: 12,
      rest_sec: 90,
      warmup_sets: 0,
      note: null,
      superset: 'x',
    });
    // The reason of the sender's plan stays with the sender.
    expect(p.items[0]).not.toHaveProperty('reason');
    expect(p.exercises.map((e) => e.id)).toEqual(['meu-crucifixo']);
  });

  it('adicionar cria rotina, itens e o exercício que falta; repetir não duplica', async () => {
    const shared = {
      id: '11111111-2222-4333-8444-555555555555',
      from_team: false,
      sender_name: 'Lia',
      name: 'Peito pesado',
      note: null,
      items: [
        {
          exercise_id: 'supino-reto',
          sets: 4,
          target_min: 6,
          target_max: 8,
          rest_sec: 120,
          warmup_sets: 2,
          note: null,
          superset: null,
        },
        {
          exercise_id: 'meu-crucifixo',
          sets: 3,
          target_min: 10,
          target_max: 12,
          rest_sec: 60,
          warmup_sets: 0,
          note: 'Devagar',
          superset: null,
        },
      ],
      exercises: [
        { id: 'meu-crucifixo', name: 'Crucifixo da Lia', primary_group: 'peito' as const },
      ],
      status: 'pending' as const,
      created_at: '2026-10-19T12:00:00Z',
      mine: false,
    };
    const id = await addSharedRoutine(shared);
    await addSharedRoutine(shared);
    expect(id).toBe(receivedRoutineId(shared.id));
    expect(await d.routines.count()).toBe(1);
    expect(await d.routines.get(id)).toMatchObject({
      name: 'Peito pesado',
      split_key: 'livre',
      reason: 'Enviada por Lia',
      user_id: 'u1',
    });
    const items = (await d.routine_items.toArray()).sort((a, b) => a.position - b.position);
    expect(items.map((i) => [i.exercise_id, i.sets])).toEqual([
      ['supino-reto', 4],
      ['meu-crucifixo', 3],
    ]);
    const ex = await d.exercises.get('meu-crucifixo');
    expect(ex).toMatchObject({
      name: 'Crucifixo da Lia',
      builtin: false,
      pattern: 'empurrar_horizontal',
    });
    // Everything goes up with the next sync.
    expect(await d.outbox.count()).toBe(4);
    expect(rpc).toHaveBeenCalledWith('answer_shared_routine', { p_id: shared.id, p_accept: true });
  });
});
