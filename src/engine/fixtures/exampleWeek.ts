/**
 * Synthetic week for development and engine regression tests (October 2026).
 * Names, loads, repetitions, effort and session times are invented for these scenarios.
 * Summary sessions exercise incomplete history; Sunday exercises substitutions and skips.
 */
import { generatePlan } from '../generator';
import type {
  OnboardingParams,
  PlanRow,
  RoutineItemRow,
  RoutineRow,
  SessionItemRow,
  SessionRow,
  SetRow,
  SplitKey,
} from '../types';
import { splitLabel } from '../taxonomy';

export const EXAMPLE_TODAY = '2026-10-18';

export const EXAMPLE_PARAMS: OnboardingParams = {
  first_name: 'Rafa',
  last_name: 'Exemplo',
  goal: 'corrida',
  gym_days: 3,
  run_days: 2,
  force_gym_days: false,
  minutes: 60,
  equipment: ['halteres', 'barra', 'polia', 'maquina', 'peso_corporal', 'kettlebell', 'barra_fixa'],
  level: 'intermediario',
  spare_joints: [],
  returning: true,
  time: '06:00',
};

function at(day: string, hh: number, mm = 0): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hh, mm).getTime();
}

export interface ExampleData {
  plan: PlanRow;
  routines: RoutineRow[];
  routineItems: RoutineItemRow[];
  sessions: SessionRow[];
  items: SessionItemRow[];
  sets: SetRow[];
}

export function exampleWeek(userId: string, updatedAt = at('2026-10-11', 20)): ExampleData {
  const base = { user_id: userId, updated_at: updatedAt, deleted: false };
  const generated = generatePlan(EXAMPLE_PARAMS);
  const plan: PlanRow = {
    ...base,
    id: 'demo-plan',
    active_from: '2026-10-12',
    gym_per_week: generated.gym_per_week,
    run_per_week: generated.run_per_week,
    days: generated.days,
    rules: generated.rules,
    params: EXAMPLE_PARAMS,
    reasons: generated.reasons,
  };

  const routines: RoutineRow[] = [];
  const routineItems: RoutineItemRow[] = [];
  generated.routines.forEach((r, ri) => {
    const id = `demo-routine-${r.split_key}`;
    routines.push({
      ...base,
      id,
      name: r.name,
      split_key: r.split_key,
      position: ri,
      reason: r.reason,
      archived: false,
      origin: 'plano',
    });
    r.items.forEach((it, ii) => {
      routineItems.push({
        ...base,
        id: `${id}-${ii}`,
        routine_id: id,
        position: ii,
        note: null,
        ...it,
      });
    });
  });

  // An invented personal routine covers exercises outside the generated plan.
  const oaId = 'demo-routine-ombro_abdomen';
  routines.push({
    ...base,
    id: oaId,
    name: 'Ombro e abdômen',
    split_key: 'ombro_abdomen',
    position: routines.length,
    reason: null,
    archived: false,
    origin: 'pessoa',
  });
  const oaPlan: [string, number, number, number, number, number][] = [
    // exercise, sets, min, max, rest, warmups
    ['desenvolvimento-halteres-sentado', 3, 10, 12, 90, 0],
    ['elevacao-lateral', 3, 12, 15, 60, 2],
    ['face-pull', 3, 12, 15, 60, 0],
    ['crucifixo-inverso', 3, 12, 15, 60, 0],
    ['prancha', 3, 30, 45, 45, 0],
    ['elevacao-pernas-cadeira', 3, 12, 15, 60, 0],
    ['abdominal-polia', 3, 15, 15, 60, 0],
    ['prancha-lateral', 2, 20, 30, 45, 0],
  ];
  oaPlan.forEach(([exercise_id, sets, min, max, rest, warm], i) => {
    routineItems.push({
      ...base,
      id: `${oaId}-${i}`,
      routine_id: oaId,
      position: i,
      exercise_id,
      sets,
      target_min: min,
      target_max: max,
      rest_sec: rest,
      warmup_sets: warm,
      note: null,
      reason: null,
    });
  });

  const sessions: SessionRow[] = [];
  const items: SessionItemRow[] = [];
  const sets: SetRow[] = [];

  const summary = (day: string, split: SplitKey): SessionRow => ({
    ...base,
    id: `demo-session-${day}`,
    local_date: day,
    started_at: at(day, 8, 10),
    ended_at: at(day, 8, 55),
    status: 'done',
    split_key: split,
    title: splitLabel(split),
    routine_id: null,
    source: 'summary',
    note: null,
    detail: 'summary',
    rest_started_at: null,
    rest_duration_sec: null,
    adjustments: [],
  });
  sessions.push(summary('2026-10-12', 'costas_biceps'));
  sessions.push(summary('2026-10-14', 'peito_triceps'));
  sessions.push(summary('2026-10-16', 'perna'));
  const sat = summary('2026-10-17', 'costas_biceps');
  sessions.push(sat);

  const itemBase = {
    ...base,
    original_exercise_id: null,
    substitution_reason: null,
    skip_reason: null,
    note: null,
    pain_joint: null,
    added: false,
  };
  // A summary item makes the overlap warning reproducible without detailed sets.
  items.push({
    ...itemBase,
    id: 'demo-item-sat-crucifixo',
    session_id: sat.id,
    position: 0,
    exercise_id: 'crucifixo-inverso',
    status: 'done',
    planned_sets: 3,
    target_min: 12,
    target_max: 15,
    rest_sec: 60,
    warmup_sets: 0,
  });

  const day = EXAMPLE_TODAY;
  const sun: SessionRow = {
    ...summary(day, 'ombro_abdomen'),
    id: 'demo-session-2026-10-18',
    started_at: at(day, 8, 10),
    ended_at: at(day, 9, 2),
    source: 'routine',
    routine_id: oaId,
    detail: 'full',
    title: 'Ombro e abdômen',
  };
  sessions.push(sun);

  let clock = at(day, 8, 13);
  const tick = () => (clock += 90_000);
  const addItem = (
    id: string,
    position: number,
    exercise_id: string,
    status: SessionItemRow['status'],
    planned_sets: number,
    min: number,
    max: number,
    extra: Partial<SessionItemRow> = {},
  ) => {
    items.push({
      ...itemBase,
      id,
      session_id: sun.id,
      position,
      exercise_id,
      status,
      planned_sets,
      target_min: min,
      target_max: max,
      rest_sec: 60,
      warmup_sets: 0,
      ...extra,
    });
  };
  const addSet = (
    item_id: string,
    exercise_id: string,
    position: number,
    kind: SetRow['kind'],
    load: number | null,
    reps: number | null,
    seconds: number | null,
    rir: number | null,
  ) => {
    sets.push({
      ...base,
      id: `${item_id}-set-${position}`,
      session_id: sun.id,
      item_id,
      exercise_id,
      position,
      kind,
      load_kg: load,
      reps,
      seconds,
      rir,
      note: null,
      completed_at: tick(),
    });
  };

  // Synthetic warm-ups differ from work sets so the tests detect accidental inclusion.
  addItem('demo-item-lateral', 1, 'elevacao-lateral', 'done', 3, 12, 15, { warmup_sets: 2 });
  addSet('demo-item-lateral', 'elevacao-lateral', 0, 'warmup', 2, 12, null, null);
  addSet('demo-item-lateral', 'elevacao-lateral', 1, 'warmup', 2, 12, null, null);

  addItem('demo-item-desenvolvimento', 0, 'desenvolvimento-halteres-sentado', 'done', 3, 10, 12, {
    rest_sec: 90,
  });
  [10, 10, 11].forEach((reps, i) =>
    addSet(
      'demo-item-desenvolvimento',
      'desenvolvimento-halteres-sentado',
      i,
      'work',
      10,
      reps,
      null,
      null,
    ),
  );

  // Work sets remain within the target range, with unknown effort.
  [13, 14, 15].forEach((reps, i) =>
    addSet('demo-item-lateral', 'elevacao-lateral', i + 2, 'work', 8, reps, null, null),
  );

  // An invented substitution covers effort recorded on each set.
  addItem('demo-item-encolhimento', 2, 'encolhimento-halteres', 'done', 3, 12, 15, {
    original_exercise_id: 'face-pull',
    substitution_reason: 'Trocado no dia',
  });
  [2, 1, 1].forEach((rir, i) =>
    addSet('demo-item-encolhimento', 'encolhimento-halteres', i, 'work', 24, 12 + i, null, rir),
  );

  addItem('demo-item-crucifixo', 3, 'crucifixo-inverso', 'skipped', 3, 12, 15, {
    skip_reason: 'Já feito no sábado',
  });
  addItem('demo-item-prancha', 4, 'prancha', 'skipped', 3, 30, 45, {
    skip_reason: 'Só um exercício de abdômen hoje',
  });
  addItem('demo-item-elevacao-pernas', 5, 'elevacao-pernas-cadeira', 'done', 3, 12, 15);
  [2, 2, 1].forEach((rir, i) =>
    addSet('demo-item-elevacao-pernas', 'elevacao-pernas-cadeira', i, 'work', null, 12 + i, null, rir),
  );
  addItem('demo-item-abdominal-polia', 6, 'abdominal-polia', 'skipped', 3, 15, 15, {
    skip_reason: 'Só um exercício de abdômen hoje',
  });
  addItem('demo-item-prancha-lateral', 7, 'prancha-lateral', 'skipped', 2, 20, 30, {
    skip_reason: 'Só um exercício de abdômen hoje',
  });

  return { plan, routines, routineItems, sessions, items, sets };
}
