import {
  suggestNext,
  prefillFromSuggestion,
  lastTimeFill,
  type ProgressionInput,
} from '../src/engine/progression';
import { warmupLoads } from '../src/engine/warmup';
import { returnModeState } from '../src/engine/returnMode';
import { nextSetInOrder, restAfter } from '../src/engine/superset';
import { detectRecords } from '../src/engine/records';
import type { ExerciseLog } from '../src/engine/progression';
import { setStartValues, setValuesToSave } from '../src/screens/parts/setValues';
import { withMandatoryWarmup } from '../src/engine/warmup';
import { deloadSets } from '../src/engine/deload';
import { moveInWorkout } from '../src/engine/workoutOrder';
import type { SetRow } from '../src/engine/types';

export function trainingArtifacts() {
  const progression = [];
  for (const measure of ['weight_reps', 'reps', 'time'] as const)
    for (const unit of ['kg', 'lb'] as const)
      for (const load of [null, 6, 40])
        for (const values of [
          [8, 9],
          [10, 10],
          [12, 12],
          [6, 6],
          [10, 8],
        ])
          for (const rir of [null, 0, 2])
            for (const count of [0, 1, 2]) {
              const logs: ExerciseLog[] = Array.from({ length: count }, (_, i) => ({
                local_date: `2026-11-${10 + i}`,
                session_id: `history-${i}`,
                target_min: 8,
                target_max: 10,
                sets: values.map((v, j) => ({
                  kind: 'work',
                  load_kg: j === 1 && load === 40 ? 30 : load,
                  reps: measure === 'time' ? null : v,
                  seconds: measure === 'time' ? v : null,
                  rir,
                })),
              }));
              const input: ProgressionInput = {
                exercise: {
                  measure,
                  increment_kg: 2,
                  bodyweight: measure === 'reps',
                  progression_hint: null,
                },
                logs,
                target: { sets: 2, min: 8, max: 10 },
                today: '2026-11-12',
                unit,
              };
              const s = suggestNext(input);
              const {
                kind,
                load_kg,
                target_min,
                target_max,
                confidence,
                missing_effort,
                based_on,
              } = s;
              progression.push({
                input,
                expected: {
                  kind,
                  load_kg,
                  target_min,
                  target_max,
                  confidence,
                  missing_effort,
                  based_on,
                },
                prefill: [0, 1, 3].map((i) => prefillFromSuggestion(s, i)),
                last: [0, 1, 3].map((i) => lastTimeFill(s, i)),
                records: detectRecords(logs, input.exercise),
              });
            }
  // Gap boundary and warm-up-only histories.
  for (const measure of ['weight_reps', 'reps', 'time'] as const) {
    for (const useLoad of [true, false]) {
      const logs: ExerciseLog[] = [0, 1].map((i) => ({
        local_date: `2026-11-${10 + i}`,
        session_id: `record-${i}`,
        target_min: 8,
        target_max: 10,
        sets: [
          { kind: 'warmup', load_kg: 100, reps: 50, seconds: 120, rir: 2 },
          {
            kind: 'work',
            load_kg: useLoad ? 40 + i * 2 : null,
            reps: measure === 'time' ? null : 8 + i * 4,
            seconds: measure === 'time' ? 30 + i * 15 : null,
            rir: 2,
          },
        ],
      }));
      const input: ProgressionInput = {
        exercise: {
          measure,
          increment_kg: 2,
          bodyweight: measure === 'reps',
          progression_hint: null,
        },
        logs,
        target: { sets: 1, min: 8, max: 10 },
        today: '2026-11-12',
        unit: 'kg',
      };
      const s = suggestNext(input);
      const { kind, load_kg, target_min, target_max, confidence, missing_effort, based_on } = s;
      progression.push({
        input,
        expected: { kind, load_kg, target_min, target_max, confidence, missing_effort, based_on },
        prefill: [0, 1, 3].map((i) => prefillFromSuggestion(s, i)),
        last: [0, 1, 3].map((i) => lastTimeFill(s, i)),
        records: detectRecords(logs, input.exercise),
      });
    }
  }
  for (const gap of [21, 22, 28]) {
    const input: ProgressionInput = {
      exercise: {
        measure: 'weight_reps',
        increment_kg: 2.5,
        bodyweight: false,
        progression_hint: null,
      },
      logs: [
        {
          local_date: '2026-10-21',
          session_id: 'gap',
          target_min: 8,
          target_max: 10,
          sets: [{ kind: 'work', load_kg: 80, reps: 12, seconds: null, rir: 2 }],
        },
      ],
      target: { sets: 1, min: 8, max: 10 },
      today: `2026-11-${gap - 10}`,
      unit: 'kg',
    };
    const s = suggestNext(input);
    const { kind, load_kg, target_min, target_max, confidence, missing_effort, based_on } = s;
    progression.push({
      input,
      expected: { kind, load_kg, target_min, target_max, confidence, missing_effort, based_on },
      prefill: [0, 1, 3].map((i) => prefillFromSuggestion(s, i)),
      last: [0, 1, 3].map((i) => lastTimeFill(s, i)),
      records: detectRecords(input.logs, input.exercise),
    });
  }
  const warmups = [null, 0, 6, 42.5, 100].flatMap((load) =>
    [0, 1, 2, 3].flatMap((count) =>
      [0, 2, 2.5].flatMap((step) =>
        [true, false].map((simple) => ({
          load,
          count,
          step,
          simple,
          expected: warmupLoads(load, count, step, simple ? 'simple' : 'progressive'),
        })),
      ),
    ),
  );
  const returns = ['auto', 'on', 'off'].flatMap((setting) =>
    [[], ['2026-10-01'], ['2026-10-01', '2026-11-01'], ['2026-11-01', '2026-12-01']].map(
      (trainingDates) => {
        const input = {
          today: '2026-11-12',
          setting: setting as 'auto' | 'on' | 'off',
          trainingDates,
          manualStartedOn: '2026-10-15',
        };
        return { input, expected: returnModeState(input).active };
      },
    ),
  );
  const supersets = [];
  const items = [
    { id: 'a', position: 0, status: 'done', superset: 'pair' },
    { id: 'b', position: 1, status: 'pending', superset: 'pair' },
    { id: 'c', position: 2, status: 'pending', superset: null },
  ];
  for (const warmup of [true, false]) {
    const sets = items.flatMap((item) =>
      Array.from({ length: item.id === 'b' ? 2 : 3 }, (_, position) => ({
        id: `${item.id}-${position}`,
        item_id: item.id,
        position,
        kind: (warmup && position === 0 ? 'warmup' : 'work') as 'warmup' | 'work',
        completed_at: null as number | null,
      })),
    );
    for (let step = 0; step < sets.length; step++) {
      const byItem = new Map(
        items.map((item) => [item.id, sets.filter((s) => s.item_id === item.id)]),
      );
      const next = nextSetInOrder(items, byItem);
      if (!next) break;
      const before = structuredClone(sets);
      next.completed_at = step + 1;
      supersets.push({ items, sets: before, next: next.id, rest: restAfter(next, items, byItem) });
    }
  }
  const editors = ['kg', 'lb'].flatMap((unit) =>
    [null, 6.25, 42.38].flatMap((load_kg) =>
      ['weight_reps', 'reps', 'time'].map((measure) => {
        const set: SetRow = {
          id: 's',
          user_id: 'fiction',
          updated_at: 1,
          deleted: false,
          session_id: 'session',
          item_id: 'item',
          exercise_id: 'exercise',
          position: 1,
          kind: 'work',
          load_kg: null,
          reps: null,
          seconds: null,
          rir: null,
          note: null,
          completed_at: null,
        };
        const previous: SetRow = {
          ...set,
          id: 'previous',
          position: 0,
          load_kg,
          reps: measure === 'time' ? null : 8,
          seconds: measure === 'time' ? 35 : null,
          completed_at: 1,
        };
        const exercise = {
          measure: measure as 'weight_reps' | 'reps' | 'time',
          bodyweight: measure !== 'weight_reps',
        };
        const input = { set, sets: [previous, set], exercise, unit: unit as 'kg' | 'lb' };
        const start = { ...setStartValues(set, input.sets, exercise, input.unit), kind: set.kind };
        return { input, start, saved: setValuesToSave(start, exercise, input.unit) };
      }),
    ),
  );
  const moves = ['agora', 'fim'].flatMap((where) =>
    items.map((item) => {
      const input = items.map((i) => ({ ...i, pending: i.id !== 'a' }));
      return {
        input,
        id: item.id,
        end: where === 'fim',
        expected: moveInWorkout(input, item.id, where as 'agora' | 'fim'),
      };
    }),
  );
  const prescription = [true, false].flatMap((simple) =>
    [true, false].flatMap((deload) =>
      [1, 2, 3, 5].map((sets) => {
        const input = [
          { exercise_id: 'time', warmup_sets: 0, sets },
          { exercise_id: 'load', warmup_sets: 0, sets },
        ];
        return {
          simple,
          deload,
          sets,
          expected: withMandatoryWarmup(
            deload ? input.map((i) => ({ ...i, sets: deloadSets(i.sets) })) : input,
            (id) => (id === 'load' ? 'weight_reps' : 'time'),
            simple ? 'simple' : 'progressive',
          ),
        };
      }),
    ),
  );
  return { progression, warmups, returns, supersets, editors, moves, prescription };
}
