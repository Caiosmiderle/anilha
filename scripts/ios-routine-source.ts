import 'fake-indexeddb/auto';
import { openDb } from '../src/data/db';
import { setCurrent, type Change } from '../src/data/store';
import { blankRoutine, deleteRoutineChanges } from '../src/data/routineEditing';
import { fichaChanges } from '../src/agent/apply';
import { targetFor, restFor } from '../src/engine/generator';
import { brokenPairs } from '../src/engine/superset';
import { suggestNext, type Suggestion } from '../src/engine/progression';
import { lastTimeUpdates } from '../src/screens/parts/setValues';
import { EXERCISES } from '../src/engine/exercises';
import type { ContextFicha } from '../src/agent/context';
import type { ExerciseDef, RoutineItemRow, RoutineRow, SetRow } from '../src/engine/types';

/** Fictional inputs. Expectations execute the same functions called by the PWA. */
export async function routineArtifacts() {
  const base = { user_id: 'fiction-routine', updated_at: 100, deleted: false };
  const routine: RoutineRow = { ...blankRoutine('r', 2), ...base, name: 'Peito', split_key: 'peito' };
  const old: RoutineItemRow[] = ['supino-reto-barra', 'triceps-corda', 'flexao-bracos'].map((exercise_id, position) => ({
    ...base, id: `i${position}`, routine_id: 'r', exercise_id, position, sets: 3, target_min: 8,
    target_max: 12, rest_sec: 90, warmup_sets: 1, note: 'Nota fictícia', reason: null,
    superset: position < 2 ? 'pair' : null,
  }));
  const custom: ExerciseDef = { ...EXERCISES[0]!, id: 'custom-fiction', name: 'Remada fictícia' };
  const catalog = [...EXERCISES, custom];
  const params = [
    { level: 'intermediario', goal: 'hipertrofia', returning: false },
    { level: 'iniciante', goal: 'forca', returning: false },
    { level: 'avancado', goal: 'forca', returning: false },
    { level: 'avancado', goal: 'corrida', returning: false },
    { level: 'avancado', goal: 'hipertrofia', returning: true },
    { level: 'intermediario', goal: 'condicionamento', returning: false },
  ] as const;
  const defaults = catalog.filter((e) => ['supino-reto-barra', 'triceps-corda', 'prancha', 'prancha-lateral', 'abdominal-supra', custom.id].includes(e.id))
    .flatMap((exercise) => params.map((p) => {
      const t = targetFor(exercise, p);
      return { exercise, params: p, expected: { exercise_id: exercise.id, sets: 3, target_min: t.min,
        target_max: t.max, rest_sec: restFor(exercise, p.goal), warmup_sets: 0, note: null, reason: null } };
    }));
  const added = defaults.find((v) => v.exercise.id === custom.id)!.expected;
  const normalize = (items: RoutineItemRow[]) => {
    const broken = brokenPairs(items);
    return items.map((i) => ({ ...i, target_min: Math.min(i.target_min, i.target_max),
      target_max: Math.max(i.target_min, i.target_max),
      ...(i.superset && broken.has(i.superset) ? { superset: null } : {}) }));
  };
  const scenarios = [
    { name: 'criar-vazia', routine: blankRoutine('new', 2), old: [], after: [] },
    { name: 'criar-com-proprio', routine: blankRoutine('new', 2), old: [], after: [{ ...added, id: 'draft' }] },
    { name: 'editar-campos', routine: { ...routine, name: '  Peito revisado  ', split_key: 'livre' as const }, old,
      after: old.map((i, n) => n ? i : { ...i, sets: 5, target_min: 15, target_max: 6, rest_sec: 0, warmup_sets: 3, note: 'Controle na descida' }) },
    { name: 'reordenar-desfaz-par', routine, old, after: [old[0]!, old[2]!, old[1]!] },
    { name: 'remover-par', routine, old, after: old.slice(1) },
    { name: 'remover-todos', routine, old, after: [] },
    { name: 'editar-adicionar-proprio', routine, old, after: [...old, { ...added, id: 'draft' }] },
  ];
  const database = openDb('ios-routine-fixture');
  setCurrent({ db: database, userId: base.user_id });
  try {
    const applications = [];
    for (const v of scenarios) {
      await database.routine_items.clear();
      await database.routine_items.bulkPut(v.old);
      const after = normalize(v.after as RoutineItemRow[]);
      const context = { ...v.routine, items: after } as unknown as ContextFicha;
      let index = 0;
      const changes: Change[] = [
        { table: 'routines', row: { ...v.routine, name: v.routine.name.trim() } },
        ...(await fichaChanges(v.routine.id, context)).map((c) => ({ ...c,
          row: v.old.some((o) => o.id === c.row.id) ? c.row : { ...c.row, id: `new-${index++}` },
        }) as Change),
      ];
      applications.push({ ...v, changes });
    }
    const deletions = [{ routine, items: old, changes: deleteRoutineChanges([routine], old) }];
    const dismissals = (['weight_reps', 'time', 'reps'] as const).flatMap((measure) => [false, true].flatMap((done) => [false, true].map((missing) => {
      const suggestion: Suggestion = suggestNext({ exercise: { ...EXERCISES[0]!, measure }, logs: [], target: { sets: 4, min: 8, max: 12 }, today: '2026-11-12' });
      suggestion.kind = done ? 'decrease' : 'increase';
      suggestion.based_on = missing ? null : { local_date: '2026-11-09', load_kg: 20, loads: [20, null, 15], values: [12, 10, 8], last_rir: 2 };
      const sets: SetRow[] = Array.from({ length: 6 }, (_, n) => ({ ...base, id: `s${n}`, session_id: 'session', item_id: 'item', exercise_id: 'supino-reto-barra', kind: n === 0 ? 'warmup' : 'work', position: n,
        load_kg: 22.5, reps: 8, seconds: null, rir: null, note: null, completed_at: done && n === 2 ? 101 : null }));
      return { measure, suggestion, sets, expected: lastTimeUpdates(suggestion, sets, measure) };
    })));
    for (const based_on of [
      { local_date: '2026-11-09', load_kg: 20, loads: [20], values: [12, 10, 8], last_rir: 2 },
      { local_date: '2026-11-09', load_kg: 20, loads: [20], values: [], last_rir: null },
    ]) {
      const original = dismissals[0]!;
      const suggestion = { ...original.suggestion, based_on };
      dismissals.push({ ...original, suggestion, expected: lastTimeUpdates(suggestion, original.sets, original.measure) });
    }
    const queueDismissals = ['increase', 'decrease', 'hold', 'first'].map((kind) => {
      const exercise = EXERCISES.find((e) => e.id === 'supino-reto-barra')!;
      const sets = dismissals[0]!.sets.map((set, n) => n === 2 ? { ...set, completed_at: 101 } : set);
      const logs = kind === 'first' ? [] : ['2026-11-09', '2026-11-10'].map((local_date, n) => ({ local_date,
        session_id: `past-${n}`, target_min: 8, target_max: 12,
        sets: [0, 1, 2].map(() => ({ kind: 'work' as const, load_kg: 20, reps: kind === 'increase' ? 14 : kind === 'decrease' ? 6 : 10, seconds: null, rir: 2 })),
      }));
      const suggestion = suggestNext({ exercise, logs, target: { sets: 5, min: 8, max: 12 }, today: '2026-11-12' });
      const updates = suggestion.based_on && ['increase', 'decrease'].includes(suggestion.kind)
        ? lastTimeUpdates(suggestion, sets, 'weight_reps') : [];
      const tables = {
        sessions: [{ ...base, id: 'session', status: 'active', local_date: '2026-11-12' }, ...logs.map((l) => ({ ...base, id: l.session_id, status: 'done', local_date: l.local_date }))],
        session_items: [{ ...base, id: 'item', session_id: 'session', exercise_id: exercise.id, target_min: 8, target_max: 12, planned_sets: 5 }, ...logs.map((l) => ({ ...base, id: l.session_id, session_id: l.session_id, exercise_id: exercise.id, target_min: 8, target_max: 12 }))],
        sets: [...sets, ...logs.flatMap((l) => l.sets.map((s, n) => ({ ...base, ...s, id: `${l.session_id}-${n}`, session_id: l.session_id, item_id: l.session_id, exercise_id: exercise.id, position: n, completed_at: 1000 + n })))],
      };
      return { kind, tables, expectedKind: suggestion.kind, updates };
    });
    return { catalog, defaults, applications, deletions, dismissals, queueDismissals };
  } finally { setCurrent(null); database.close(); await database.delete(); }
}
