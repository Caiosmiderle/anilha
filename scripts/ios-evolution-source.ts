import { buildEvolution, exerciseNext } from '../src/analysis/evolution';
import type { AnalysisInput, LocalRow } from '../src/analysis/context';
import { EXERCISES } from '../src/engine/exercises';

/** Fictitious cases shared verbatim with the native port. */
export function evolutionCases() {
  const make = (timed = false): AnalysisInput => {
    const exercise = timed ? 'prancha' : 'supino-reto-barra';
    const sessions = Array.from({ length: 8 }, (_, n) => ({
      id: `s${n}`,
      deleted: false,
      status: 'done',
      detail: 'full',
      local_date: `2026-11-${String(n + 1).padStart(2, '0')}`,
      started_at: n * 10000,
      routine_id: n === 6 ? 'routine' : 'other',
      deload: false,
    }));
    const items = sessions.map((s) => ({
      id: `i${s.id}`,
      session_id: s.id,
      deleted: false,
      exercise_id: exercise,
      original_exercise_id: null,
      status: 'done',
      position: 0,
      planned_sets: 2,
      target_min: timed ? 20 : 8,
      target_max: timed ? 40 : 12,
      warmup_sets: 1,
    }));
    const sets = items.flatMap((i, n) =>
      [0, 1, 2].map((position) => ({
        id: `${i.id}-${position}`,
        item_id: i.id,
        session_id: i.session_id,
        exercise_id: exercise,
        deleted: false,
        kind: position === 0 ? 'warmup' : 'work',
        position,
        completed_at: n * 10000 + position + 1,
        load_kg: timed ? null : position === 0 ? 10 : position === 1 ? (n === 6 ? 42.5 : 40) : 30,
        reps: timed ? null : position === 2 && n === 6 ? 14 : 12,
        seconds: timed ? 20 + n * 5 : null,
        rir: position === 0 ? null : 2,
      })),
    );
    return {
      sessionID: 's6',
      tables: {
        sessions,
        session_items: items,
        sets,
        routines: [{ id: 'routine', deleted: false, archived: false }],
        routine_items: [
          {
            id: 'ri',
            routine_id: 'routine',
            exercise_id: exercise,
            deleted: false,
            sets: 2,
            target_min: timed ? 20 : 8,
            target_max: timed ? 40 : 12,
            warmup_sets: 0,
            rest_sec: 90,
          },
        ],
        profiles: [
          {
            id: 'synthetic-owner',
            deleted: false,
            unit: 'kg',
            return_mode: 'off',
            deload_week: null,
          },
        ],
      },
    };
  };
  const base = make(),
    time = make(true);
  const first = structuredClone(base);
  first.tables.sessions = first.tables.sessions!.filter((s) => s.id === first.sessionID);
  const swapped = structuredClone(base);
  swapped.tables.session_items = swapped.tables.session_items!.map((i) =>
    i.session_id === swapped.sessionID
      ? { ...i, exercise_id: 'remada-baixa', original_exercise_id: 'supino-reto-barra' }
      : i,
  );
  swapped.tables.sets!.push({
    id: 'replacement',
    session_id: 's6',
    item_id: 'is6',
    exercise_id: 'remada-baixa',
    position: 3,
    kind: 'work',
    completed_at: 60005,
    load_kg: 25,
    reps: 10,
    seconds: null,
    rir: 1,
    deleted: false,
  });
  const light = structuredClone(base);
  light.tables.profiles![0]!.deload_week = '2026-11-02';
  const pounds = structuredClone(base);
  pounds.tables.profiles![0]!.unit = 'lb';
  const unknown = structuredClone(base);
  unknown.tables.routines = [];
  const missing = structuredClone(base);
  missing.tables.sets = missing.tables.sets!.map((s) =>
    s.session_id === 's6' ? { ...s, load_kg: null, reps: null } : s,
  );
  const lower = structuredClone(base);
  lower.tables.sets = lower.tables.sets!.map((s) =>
    s.session_id === 's6' && s.kind === 'work' ? { ...s, load_kg: 30, reps: 8 } : s,
  );
  const equal = structuredClone(base);
  equal.tables.sets = equal.tables.sets!.map((s) =>
    s.session_id === 's6' && s.kind === 'work'
      ? { ...s, load_kg: s.position === 1 ? 40 : 30, reps: 12 }
      : s,
  );
  const oldRecord = structuredClone(base);
  oldRecord.tables.sets = oldRecord.tables.sets!.map((s) =>
    s.session_id === 's0' && s.kind === 'work'
      ? { ...s, load_kg: s.position === 1 ? 100 : 30, reps: 30 }
      : s,
  );
  const increase = structuredClone(base);
  increase.tables.sets = increase.tables.sets!.map((s) =>
    s.session_id === 's6' && s.kind === 'work' ? { ...s, load_kg: 40, reps: 14 } : s,
  );
  const decrease = structuredClone(base);
  decrease.tables.sets = decrease.tables.sets!.map((s) =>
    ['s5', 's6'].includes(String(s.session_id)) && s.kind === 'work'
      ? { ...s, load_kg: 40, reps: 6 }
      : s,
  );
  const customTimed = structuredClone(time);
  const customID = 'custom-time';
  for (const table of ['session_items', 'sets', 'routine_items']) {
    customTimed.tables[table] = customTimed.tables[table]!.map((row) => ({
      ...row,
      exercise_id: customID,
    }));
  }
  customTimed.tables.exercises = [
    {
      ...EXERCISES.find((e) => e.id === 'prancha')!,
      id: customID,
      name: 'private-custom-name-canary',
      deleted: false,
    },
  ];
  const variants = [
    ['records', base],
    ['timed', time],
    ['first', first],
    ['swapped', swapped],
    ['deload', light],
    ['pounds', pounds],
    ['unavailable', unknown],
    ['missing', missing],
    ['lower', lower],
    ['equal', equal],
    ['oldRecord', oldRecord],
    ['increase', increase],
    ['decrease', decrease],
    ['customTimed', customTimed],
  ] as const;
  return variants.map(([name, input]) => ({
    name,
    input,
    expected: buildEvolution(input),
    next: exerciseNext(
      input,
      input.tables.session_items!.find((i) => i.session_id === input.sessionID) as LocalRow,
    ),
  }));
}
