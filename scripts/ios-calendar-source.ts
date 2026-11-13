import { calendarDays, type CalendarInput } from '../src/engine/calendar';
import type { ExternalPlanItemRow, PlanRow, RunRow, SessionRow } from '../src/engine/types';

// Fictional rows, including nullable columns from older clients.
export function calendarArtifacts() {
  const row = { user_id: 'calendar-fixture', updated_at: 1, deleted: false };
  const plan: PlanRow = {
    ...row,
    id: 'plan',
    active_from: '2026-11-09',
    gym_per_week: 5,
    run_per_week: 0,
    days: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      kind: weekday < 5 ? 'gym' : 'rest',
      split_key: null,
      run_type: null,
      time: '18:00',
    })),
    rules: { no_legs_before_run: true, rotation: ['perna', 'costas_biceps', 'peito_triceps'] },
    params: null,
    reasons: [],
  };
  const session: SessionRow = {
    ...row,
    id: 'session',
    local_date: '2026-11-12',
    started_at: 10,
    ended_at: 20,
    status: 'done',
    split_key: 'peito_triceps',
    title: 'Peito e tríceps',
    routine_id: null,
    source: 'summary',
    note: null,
    detail: 'summary',
    rest_started_at: null,
    rest_duration_sec: null,
    adjustments: [],
  };
  const run: RunRow = {
    ...row,
    id: 'run',
    local_date: '2026-11-12',
    distance_km: 5,
    duration_sec: 1800,
    run_type: 'leve',
    rpe: null,
    note: null,
    source: 'crunning',
    external_id: 'crunning:synthetic',
  };
  const external: ExternalPlanItemRow = {
    ...row,
    id: 'external',
    source: 'crunning',
    kind: 'corrida',
    origin_id: 'synthetic',
    local_date: '2026-11-13',
    run_type: 'longo',
    source_type: null,
    name: 'Longão',
    distance_m: 12000,
    duration_sec: null,
    important: true,
    status: 'planejada',
  };
  const base: CalendarInput = {
    month: '2026-11',
    today: '2026-11-12',
    plans: [plan],
    routines: [],
    sessions: [],
    runs: [],
    externalPlans: [external],
    overrides: [],
  };
  const inputs: [string, CalendarInput][] = [
    ['véspera importante', base],
    ['força e corrida no mesmo dia', { ...base, sessions: [session], runs: [run] }],
    [
      'várias sessões, ordem, ativo e apagado',
      {
        ...base,
        sessions: [
          session,
          { ...session, id: 'second', started_at: 30 },
          { ...session, id: 'active', status: 'active' },
          { ...session, id: 'deleted', deleted: true },
        ],
      },
    ],
    ['sem plano', { ...base, plans: [], sessions: [session], runs: [run] }],
    [
      'outro cardio e lápides',
      {
        ...base,
        runs: [
          { ...run, activity: 'bike' },
          { ...run, id: 'deleted', deleted: true },
        ],
        externalPlans: [{ ...external, deleted: true }],
        plans: [{ ...plan, deleted: true }],
      },
    ],
    [
      'distância ausente, zero e status',
      {
        ...base,
        runs: [{ ...run, distance_km: null }],
        externalPlans: [
          { ...external, distance_m: 0 },
          { ...external, id: 'missed', status: 'perdida', distance_m: null },
          { ...external, id: 'done', status: 'feita' },
          { ...external, id: 'invalid', local_date: null },
        ],
      },
    ],
    [
      'regra desligada',
      { ...base, plans: [{ ...plan, rules: { ...plan.rules, no_legs_before_run: false } }] },
    ],
    ['corrida sem importância', { ...base, externalPlans: [{ ...external, important: false }] }],
    [
      'troca para descanso',
      {
        ...base,
        overrides: [
          { ...row, id: 'override', local_date: base.today, action: 'rest', value: null },
        ],
      },
    ],
    [
      'plano fixo e corrida local',
      {
        ...base,
        plans: [
          {
            ...plan,
            rules: { no_legs_before_run: true },
            days: [
              { weekday: 3, kind: 'gym', split_key: 'perna', run_type: null, time: '18:00' },
              { weekday: 4, kind: 'run', split_key: null, run_type: 'intervalado', time: '06:00' },
            ],
          },
        ],
        externalPlans: [],
      },
    ],
    ['mês seguinte', { ...base, month: '2026-12' }],
    [
      'mês passado',
      { ...base, month: '2026-10', sessions: [{ ...session, local_date: '2026-10-31' }] },
    ],
    ['fevereiro bissexto', { ...base, month: '2028-02', today: '2028-02-28' }],
    [
      'ficha do plano e antiga',
      {
        ...base,
        routines: [
          {
            ...row,
            id: 'own',
            name: 'Minha perna',
            split_key: 'perna',
            position: 0,
            archived: false,
            reason: null,
            origin: 'pessoa',
          },
          {
            ...row,
            id: 'generated',
            name: 'Perna do plano',
            split_key: 'perna',
            position: 1,
            archived: false,
            reason: '5 exercícios, 15 séries de trabalho.',
          },
          {
            ...row,
            id: 'archived',
            name: 'Arquivada',
            split_key: 'perna',
            position: -1,
            archived: true,
            reason: null,
          },
        ],
      },
    ],
    [
      'mudança de plano e empate',
      {
        ...base,
        plans: [
          plan,
          {
            ...plan,
            id: 'next',
            active_from: '2026-11-16',
            updated_at: 2,
            rules: { no_legs_before_run: false, rotation: ['costas_biceps'] },
          },
          {
            ...plan,
            id: 'newest',
            active_from: '2026-11-16',
            updated_at: 3,
            rules: { no_legs_before_run: false, rotation: ['peito_triceps'] },
          },
        ],
      },
    ],
  ];
  return inputs.map(([name, input]) => ({ name, input, expected: calendarDays(input) }));
}
