import { readFileSync } from 'node:fs';
import { weekReport } from '../src/engine/adherence';
import { bodyTrend } from '../src/engine/body';
import { activityOf, countedCardio } from '../src/engine/cardio';
import { addDays, weekStart } from '../src/engine/dates';
import { kgToUnit } from '../src/engine/format';
import { buildExerciseLogs } from '../src/engine/history';
import { planForDay } from '../src/engine/recommend';
import { estimate1RM, sessionBest } from '../src/engine/records';
import { weeklyGroupSets } from '../src/engine/volume';
import { EXERCISES } from '../src/engine/exercises';
import { MUSCLE_VOLUME_GROUP, VOLUME_GROUP_LABEL } from '../src/engine/taxonomy';
import type {
  BodyLogRow,
  ExerciseRow,
  Goal,
  PlanRow,
  RunRow,
  SessionItemRow,
  SessionRow,
  SetRow,
  Unit,
} from '../src/engine/types';

export type HistoryTables = {
  sessions?: SessionRow[];
  runs?: RunRow[];
  plans?: PlanRow[];
  sets?: SetRow[];
  session_items?: SessionItemRow[];
  exercises?: ExerciseRow[];
  body_logs?: BodyLogRow[];
};
export function historyExpected(t: HistoryTables, today: string, unit: Unit = 'kg') {
  const sessions = (t.sessions ?? []).filter((x) => !x.deleted);
  const runs = (t.runs ?? []).filter((x) => !x.deleted);
  const plans = (t.plans ?? []).filter((x) => !x.deleted);
  const sets = (t.sets ?? []).filter((x) => !x.deleted && x.completed_at != null);
  const items = (t.session_items ?? []).filter((x) => !x.deleted);
  const exercises = new Map<string, ExerciseRow>(EXERCISES.map((e) => [e.id, e as ExerciseRow]));
  for (const e of t.exercises ?? []) {
    if (e.deleted) exercises.delete(e.id);
    else exercises.set(e.id, e);
  }
  const gymDates = sessions.filter((s) => s.status === 'done').map((s) => s.local_date);
  const runDates = countedCardio(runs, (w) => planForDay(plans, w)?.run_per_week ?? 0).map(
    (r) => r.local_date,
  );
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const day = addDays(weekStart(today), -7 * i);
    const r = weekReport({ day, today, plan: planForDay(plans, day), gymDates, runDates });
    return {
      week_start: r.week_start,
      week_end: r.week_end,
      planned_gym: r.planned_gym,
      planned_run: r.planned_run,
      done_gym: r.done_gym,
      done_run: r.done_run,
      rest_days: r.rest_days,
      status: r.status,
      pct: r.pct,
      cardio: runs.some(
        (x) =>
          x.local_date >= day && x.local_date <= addDays(day, 6) && activityOf(x) !== 'corrida',
      )
        ? 'Cardio'
        : 'Corrida',
    };
  }).filter((r, i) => r.done_gym || r.done_run || r.planned_gym || i === 0);
  const sessionsOf = new Map<string, Set<string>>();
  const loaded = new Set<string>();
  for (const s of sets) {
    if (s.kind !== 'work') continue;
    const ids = sessionsOf.get(s.exercise_id) ?? new Set<string>();
    ids.add(s.session_id);
    sessionsOf.set(s.exercise_id, ids);
    if ((s.load_kg ?? 0) > 0) loaded.add(s.exercise_id);
  }
  const options = [...sessionsOf]
    .sort((a, b) => b[1].size - a[1].size || Number(loaded.has(b[0])) - Number(loaded.has(a[0])))
    .map(([id]) => exercises.get(id))
    .filter((x): x is ExerciseRow => !!x);
  const progress = options.map((e) => {
    const logs = buildExerciseLogs(e.id, sessions, items, sets),
      bests = logs.map((l) => sessionBest(l, e));
    const hasLoad = bests.some((b) => b.max_load != null);
    return {
      id: e.id,
      result: {
        count: logs.length,
        loaded: hasLoad,
        main: bests
          .map((b) => ({
            day: b.local_date,
            value:
              e.measure === 'time'
                ? (b.max_seconds ?? 0)
                : hasLoad
                  ? Math.round(kgToUnit(b.max_load ?? 0, unit) * 10) / 10
                  : (b.max_reps ?? 0),
          }))
          .filter((p) => p.value > 0),
        compare: hasLoad
          ? bests
              .filter((b) => b.best_e1rm != null)
              .map((b) => ({
                day: b.local_date,
                value: Math.round(kgToUnit(b.best_e1rm ?? 0, unit) * 10) / 10,
              }))
          : [],
        max_load: bests.reduce<number | null>(
          (n, b) => (b.max_load == null ? n : Math.max(n ?? 0, b.max_load)),
          null,
        ),
        last1rm: Math.max(
          0,
          ...(logs.at(-1)?.sets ?? [])
            .filter((s) => s.kind === 'work' && s.load_kg && s.reps)
            .map((s) => estimate1RM(s.load_kg!, s.reps!) ?? 0),
        ),
        last_volume: bests.at(-1)?.volume ?? null,
        last_date: logs.at(-1)?.local_date ?? null,
      },
    };
  });
  const days = new Map(sessions.map((s) => [s.id, s.local_date]));
  const volume = [
    ...weeklyGroupSets(
      today,
      sets
        .filter((s) => days.has(s.session_id))
        .map((s) => ({ ...s, local_date: days.get(s.session_id)! })),
      exercises,
    ),
  ]
    .sort((a, b) => b[1] - a[1])
    .map(([group, value]) => ({ group, value }));
  return { weeks, options: options.map((e) => e.id), progress, volume };
}

export function historyArtifacts() {
  const source = readFileSync('ios/App/Demo/ModoDemo.swift', 'utf8');
  const demo = JSON.parse(
    source.match(/let json = #"""\s*([\s\S]*?)\s*"""#/)![1]!,
  ) as HistoryTables;
  const today = '2026-11-12';
  const cases = [
    { name: 'empty', tables: {} as HistoryTables, unit: 'kg' as Unit },
    { name: 'demo', tables: demo, unit: 'kg' as Unit },
    { name: 'demo pounds', tables: demo, unit: 'lb' as Unit },
  ];
  for (const [name, gym, run] of [
    ['fulfilled', 2, 1],
    ['excess', 1, 0],
    ['partial', 5, 2],
    ['no plan', 0, 0],
  ] as const) {
    const t = structuredClone(demo);
    t.plans =
      name === 'no plan'
        ? []
        : [{ ...t.plans![0]!, active_from: '2026-10-01', gym_per_week: gym, run_per_week: run }];
    t.runs = [
      ...t.runs!,
      { ...t.runs![0]!, id: 'bike', activity: 'bike' },
      { ...t.runs![0]!, id: 'old', local_date: '2026-11-02' },
    ];
    cases.push({ name, tables: t, unit: 'kg' });
  }
  const edge = structuredClone(demo);
  edge.sessions = edge.sessions!.map((s, i) => ({ ...s, deload: i === 0 }));
  edge.sets = edge.sets!.map((s, i) => ({
    ...s,
    deleted: i === 0,
    load_kg: i === 1 ? null : s.load_kg,
  }));
  cases.push({ name: 'deleted deload null pending', tables: edge, unit: 'kg' });
  const midweek = structuredClone(demo);
  midweek.plans = [{ ...midweek.plans![0]!, active_from: '2026-11-11' }];
  cases.push({ name: 'plan begins midweek', tables: midweek, unit: 'kg' });
  for (const ex of [
    EXERCISES.find((e) => e.measure === 'time')!,
    EXERCISES.find((e) => e.bodyweight && e.measure !== 'time')!,
  ]) {
    const t = structuredClone(demo);
    t.sets = t.sets!.map((s, i) => ({
      ...s,
      exercise_id: ex.id,
      load_kg: null,
      seconds: ex.measure === 'time' ? 20 + i * 5 : null,
      reps: ex.measure === 'time' ? null : 8 + i,
    }));
    t.session_items = t.session_items!.map((item) => ({ ...item, exercise_id: ex.id }));
    cases.push({ name: `unloaded ${ex.measure}`, tables: t, unit: 'kg' });
  }
  const tie = structuredClone(demo);
  tie.sessions = tie.sessions!.map((s) => ({ ...s, local_date: today }));
  tie.sets = tie.sets!.map((s, i) => ({
    ...s,
    kind: i === 0 ? 'warmup' : s.kind,
    reps: i === 1 ? 15 : s.reps,
  }));
  cases.push({ name: 'same day warmup above Epley range', tables: tie, unit: 'kg' });
  const bodyCases: {
    name: string;
    logs: BodyLogRow[];
    goal: Goal | null;
    today: string;
    expected: ReturnType<typeof bodyTrend>;
  }[] = [];
  const body = (
    name: string,
    values: [string, number | null, number | null, boolean?][],
    goal: Goal | null,
  ) => {
    const logs = values.map(([local_date, weight_kg, waist_cm, deleted], i) => ({
      id: `body-${i}`,
      local_date,
      weight_kg,
      waist_cm,
      deleted: !!deleted,
    })) as BodyLogRow[];
    bodyCases.push({ name, logs, goal, today, expected: bodyTrend(logs, goal, today) });
  };
  body('empty', [], null);
  body('waist only', [['2026-11-12', null, 80]], null);
  body(
    'one week average',
    [
      ['2026-11-09', 80, 80],
      ['2026-11-12', 82, null],
    ],
    'hipertrofia',
  );
  for (const [name, kg, cm, goal] of [
    ['gain flat', 80, 80, 'hipertrofia'],
    ['gain normal', 80.3, 81, 'hipertrofia'],
    ['gain fast waist', 82, 83, 'hipertrofia'],
    ['loss flat waist', 80, 78, 'emagrecimento'],
    ['loss normal', 79.4, 80, 'emagrecimento'],
    ['loss fast', 77, 80, 'emagrecimento'],
    ['no target', 81, 81, 'forca'],
  ] as const) {
    body(
      name,
      [
        ['2026-11-02', 80, 80],
        ['2026-11-12', kg, cm],
      ],
      goal,
    );
  }
  body(
    'old future tombstone gaps',
    [
      ['2026-01-01', 70, 70],
      ['2026-10-12', 80, 80],
      ['2026-11-12', 81, null],
      ['2026-11-13', 99, 99],
      ['2026-11-09', 99, 99, true],
    ],
    'hipertrofia',
  );
  return {
    taxonomy: { muscles: MUSCLE_VOLUME_GROUP, labels: VOLUME_GROUP_LABEL },
    cases: cases.map((c) => ({ ...c, today, expected: historyExpected(c.tables, today, c.unit) })),
    bodyCases,
  };
}
