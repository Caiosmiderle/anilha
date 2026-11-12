import { describe, expect, it } from 'vitest';
import type { SetRow } from '../../engine/types';
import { EXERCISES_BY_ID } from '../../engine/exercises';
import { suggestNext } from '../../engine/progression';
import { lastTimeUpdates, setStartValues, setValuesToSave } from './setValues';

function set(changes: Partial<SetRow> = {}): SetRow {
  return {
    id: 'next',
    user_id: 'user',
    updated_at: 0,
    deleted: false,
    session_id: 'session',
    item_id: 'item',
    exercise_id: 'barra-fixa',
    position: 1,
    kind: 'work',
    load_kg: null,
    reps: null,
    seconds: null,
    rir: null,
    note: null,
    completed_at: null,
    ...changes,
  };
}

const exercise = { measure: 'reps', bodyweight: true } as const;

describe('recusar progressão depois de concluir parte do exercício', () => {
  it('mantém as posições da pirâmide e não altera séries feitas nem aquecimentos', () => {
    const pyramid = [40, 30, 20].map((load_kg) => ({
      kind: 'work' as const,
      load_kg,
      reps: 12,
      seconds: null,
      rir: 3,
    }));
    const suggestion = suggestNext({
      exercise: EXERCISES_BY_ID.get('supino-reto-barra')!,
      logs: ['2026-10-15', '2026-10-18'].map((local_date) => ({
        local_date,
        session_id: local_date,
        target_min: 8,
        target_max: 12,
        sets: pyramid,
      })),
      target: { sets: 3, min: 8, max: 12 },
      today: '2026-10-25',
    });
    expect(suggestion.kind).toBe('increase');

    const rows = [
      set({ id: 'warmup', position: 0, kind: 'warmup' }),
      set({ id: 'first', position: 1, load_kg: 42, reps: 8, completed_at: 1 }),
      set({ id: 'second', position: 2, load_kg: 30, reps: 12 }),
      set({ id: 'third', position: 3, load_kg: 20, reps: 12 }),
    ];
    expect(lastTimeUpdates(suggestion, rows, 'weight_reps')).toEqual([
      { id: 'second', load_kg: 30, reps: 12, seconds: null },
      { id: 'third', load_kg: 20, reps: 12, seconds: null },
    ]);
    expect(rows[1]).toMatchObject({ load_kg: 42, reps: 8, completed_at: 1 });

    // Completing a middle set out of order must not shift the third set to its values.
    rows[1]!.completed_at = null;
    rows[2]!.completed_at = 2;
    expect(lastTimeUpdates(suggestion, rows, 'weight_reps')).toEqual([
      { id: 'first', load_kg: 40, reps: 12, seconds: null },
      { id: 'third', load_kg: 20, reps: 12, seconds: null },
    ]);
  });

  it('restaura segundos por posição sem converter a série feita nem criar repetições', () => {
    const suggestion = suggestNext({
      exercise: { measure: 'time', bodyweight: false, increment_kg: 2, progression_hint: null },
      logs: [
        {
          local_date: '2026-10-18',
          session_id: 'last',
          target_min: 30,
          target_max: 60,
          sets: [40, 30, 20].map((load_kg, index) => ({
            kind: 'work' as const,
            load_kg,
            reps: null,
            seconds: [45, 50, 55][index]!,
            rir: 3,
          })),
        },
      ],
      target: { sets: 3, min: 30, max: 60 },
      today: '2026-10-25',
    });
    expect(
      lastTimeUpdates(
        suggestion,
        [set({ id: 'first', completed_at: 1 }), set({ id: 'second' }), set({ id: 'third' })],
        'time',
      ),
    ).toEqual([
      { id: 'second', load_kg: 30, reps: null, seconds: 50 },
      { id: 'third', load_kg: 20, reps: null, seconds: 55 },
    ]);
  });
});

describe('carga extra entre séries de peso corporal', () => {
  it('mostra e salva a carga extra herdada da série anterior', () => {
    const previous = set({ id: 'previous', load_kg: 10, reps: 8, completed_at: 1 });
    const pending = set();
    const start = setStartValues(pending, [previous, pending], exercise, 'kg');

    expect(start).toEqual({ load: 10, value: 8, showLoad: true });
    expect(setValuesToSave({ ...start, kind: pending.kind }, exercise, 'kg')).toEqual({
      kind: 'work',
      load_kg: 10,
      reps: 8,
      seconds: null,
    });
  });

  it('mantém oculta a carga extra quando nenhuma série tem carga', () => {
    const previous = set({ id: 'previous', reps: 8, completed_at: 1 });
    const pending = set();

    expect(setStartValues(pending, [previous, pending], exercise, 'kg')).toEqual({
      load: null,
      value: 8,
      showLoad: false,
    });
  });

  it('respeita uma série marcada com zero em vez de herdar a carga anterior', () => {
    const previous = set({ id: 'previous', load_kg: 10, reps: 8, completed_at: 1 });
    const pending = set({ load_kg: 0 });
    const start = setStartValues(pending, [previous, pending], exercise, 'kg');

    expect(start).toEqual({ load: 0, value: 8, showLoad: false });
    expect(setValuesToSave({ ...start, kind: pending.kind }, exercise, 'kg').load_kg).toBeNull();
  });
});
