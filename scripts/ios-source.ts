import { EXERCISES } from '../src/engine/exercises';
import { planForDay } from '../src/engine/recommend';
import { SPLITS, splitHasLegs } from '../src/engine/taxonomy';
import { projectDays, type WeekViewInput } from '../src/engine/weekView';
import type { PlanDay, SplitKey } from '../src/engine/types';

// Only synthetic inputs. Outputs always come from the production TypeScript engine.
export function iosArtifacts() {
  const catalog = EXERCISES.map((e) => ({
    id: e.id,
    name: e.name,
    primary_group: e.primary_group,
    muscles: e.muscles,
    secondary_muscles: e.secondary_muscles,
    equipment: e.equipment,
    measure: e.measure,
    increment_kg: e.increment_kg,
    bodyweight: e.bodyweight,
    progression_hint: e.progression_hint,
    pattern: e.pattern,
    compound: e.compound,
  }));
  const splits = Object.values(SPLITS).map((s) => ({
    id: s.key,
    name: s.label,
    legs: splitHasLegs(s.key),
  }));
  const plans = [
    { id: 'old', active_from: '2026-10-01', updated_at: 10 },
    { id: 'week', active_from: '2026-11-15', updated_at: 20 },
    { id: 'tie', active_from: '2026-11-15', updated_at: 30 },
    { id: 'future', active_from: '2026-11-16', updated_at: 40 },
  ];
  const planCases = ['2026-09-01', '2026-11-09', '2026-11-15', '2026-11-16', '2027-01-01'].flatMap(
    (day) =>
      [plans, [...plans].reverse(), []].map((input) => ({
        day,
        plans: input,
        expected: planForDay(input, day)?.id ?? null,
      })),
  );
  const days: PlanDay[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    kind: weekday === 6 ? 'run' : weekday === 2 ? 'rest' : 'gym',
    split_key: weekday === 0 ? 'perna' : 'costas_biceps',
    run_type: null,
    time: '18:00',
  }));
  const base: WeekViewInput = {
    today: '2026-11-12',
    plan: {
      days,
      rules: {
        no_legs_before_run: true,
        rotation: ['perna', 'costas_biceps', 'peito_triceps'],
      },
    },
    sessions: [],
    runs: [],
    overrides: [],
  };
  const projectionCases: {
    name: string;
    input: WeekViewInput;
    from: string;
    count: number;
    expected: ReturnType<typeof projectDays>;
  }[] = [];
  const add = (name: string, input: WeekViewInput, from = input.today, count = 10) => {
    projectionCases.push({ name, input, from, count, expected: projectDays(input, from, count) });
  };
  add('rotation', base);
  add('fixed', { ...base, plan: { days, rules: { no_legs_before_run: false } } });
  add('empty rotation', {
    ...base,
    plan: { days, rules: { no_legs_before_run: true, rotation: [] } },
  });
  add('no days', { ...base, plan: { ...base.plan, days: [] } });
  add('past and future', base, '2026-11-08', 16);
  add('window after today', base, '2026-11-18');
  add('history and tie', {
    ...base,
    sessions: [
      { local_date: '2026-11-10', split_key: 'perna' },
      { local_date: '2026-11-10', split_key: 'costas_biceps' },
      { local_date: '2026-11-20', split_key: 'peito_triceps' },
    ],
  });
  add(
    'done today and run',
    {
      ...base,
      sessions: [{ local_date: base.today, split_key: 'perna' }],
      runs: [{ local_date: base.today, run_type: 'longo' }],
    },
    '2026-11-10',
  );
  add('run today', { ...base, runs: [{ local_date: base.today, run_type: 'intervalado' }] });
  add('overrides', {
    ...base,
    overrides: [
      { local_date: base.today, action: 'rest' },
      { local_date: '2026-11-13', action: 'run' },
      { local_date: '2026-11-14', action: 'time' },
    ],
  });
  for (const kind of ['gym', 'run', 'rest', 'light'] as const) {
    add(`todayRec ${kind}`, {
      ...base,
      todayRec: { kind, split_key: 'peito_triceps', run_type: 'longo' },
    });
    add(
      `future todayRec ${kind}`,
      { ...base, todayRec: { kind, split_key: 'peito_triceps', run_type: null } },
      '2026-11-16',
    );
  }
  for (const today of ['2028-02-28', '2026-12-31', '2026-03-07', '2026-11-01']) {
    add(`calendar ${today}`, { ...base, today });
  }
  for (const s of Object.keys(SPLITS) as SplitKey[]) {
    add(`legs ${s}`, {
      ...base,
      today: '2026-11-14',
      plan: {
        days,
        rules: { no_legs_before_run: true, rotation: [s, 'costas_biceps'] },
      },
    });
  }
  return { catalog, splits, planCases, projectionCases };
}
