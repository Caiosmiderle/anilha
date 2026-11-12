import { buildReviewContext, type ReviewInput } from '../src/review/context';
import { parseReviewReply } from '../src/review/contract';
import { EXERCISES } from '../src/engine/exercises';
import { syntheticBinding } from './ios-analysis-source';
import { calendarArtifacts } from './ios-calendar-source';
import type { AnalysisAdjustment } from '../src/analysis/contract';

export const reviewAdjustments: (AnalysisAdjustment & { motivo: string })[] = [
  {
    operation: 'series',
    slot: 0,
    sets: 2,
    min: null,
    max: null,
    replacement: null,
    motivo: 'Reduza o volume antes da corrida forte.',
  },
  {
    operation: 'repeticoes',
    slot: 1,
    sets: null,
    min: 6,
    max: 8,
    replacement: null,
    motivo: 'Mantenha uma faixa confortável.',
  },
  {
    operation: 'trocar',
    slot: 0,
    sets: null,
    min: null,
    max: null,
    replacement: 'remada-baixa',
    motivo: 'Experimente esta alternativa do catálogo.',
  },
];
export const reviewReply = {
  avaliacao: 'ajustavel' as const,
  resumo: 'A ficha está coerente. Proteja as corridas importantes.',
  pontos: ['Os ajustes só valem com sua confirmação.'],
  ajustes: reviewAdjustments,
};
export function reviewCases() {
  const b = syntheticBinding(),
    c = calendarArtifacts()[0]!.input;
  const input: ReviewInput = {
    today: c.today,
    params: {
      ...b.params!,
      focus: ['pernas'],
      first_name: 'private-name-canary',
      age_range: '60+',
      spare_joints: ['joelho'],
    },
    plan: c.plans[0]!,
    routines: [{ ...b.routine!, origin: 'plano' }],
    items: b.routineItems,
    health: true,
    returnMode: true,
    sessions: c.sessions,
    runs: c.runs,
    externalPlans: c.externalPlans,
    overrides: c.overrides,
  };
  input.runs = [-15, -14, -2, -1, 0, 1].map((offset, n) => ({
    ...c.runs[0]!,
    id: `run-${n}`,
    deleted: false,
    local_date:
      offset === -15 ? '2026-10-28' : offset === -14 ? '2026-10-29' : `2026-11-${12 + offset}`,
    activity: 'corrida',
    run_type: 'intervalado',
    distance_km: 5,
    duration_sec: 1800,
    rpe: 7,
    note: 'private-note-canary',
    source_type: 'private-name-canary',
  }));
  input.externalPlans = [-1, 0, 1, 2, 14, 15].map((offset, n) => ({
    ...c.externalPlans[0]!,
    id: `external-${n}`,
    deleted: false,
    source: 'crunning',
    kind: 'corrida',
    local_date: `2026-11-${12 + offset}`,
    run_type: n % 2 ? 'longo' : 'intervalado',
    name: 'private-run-name-canary',
    source_type: 'private-run-name-canary',
    distance_m: 10000,
    important: true,
    status: 'planejada',
  }));
  // Make the reviewed split land on the eve of an important external run.
  input.plan = {
    ...input.plan!,
    rules: { rotation: ['peito_triceps'], no_legs_before_run: true },
    gym_per_week: 5,
  };
  const variants: ReviewInput[] = [
    input,
    { ...input, plan: null },
    { ...input, runs: [], externalPlans: [] },
    { ...input, items: input.items.map((i) => ({ ...i, exercise_id: 'custom-private-canary' })) },
    {
      ...input,
      plan: {
        ...input.plan,
        rules: { no_legs_before_run: false },
        days: input.plan.days.map((d) => ({ ...d, split_key: 'peito_triceps' })),
      },
    },
    {
      ...input,
      routines: input.routines.map((r) => ({ ...r, split_key: 'perna' })),
      plan: { ...input.plan, rules: { rotation: ['perna'], no_legs_before_run: true } },
    },
  ];
  return variants.map((input) => ({
    input,
    routineID: b.routine!.id,
    expected: buildReviewContext(input, b.routine!.id, false),
  }));
}
export function reviewArtifacts() {
  const ids = EXERCISES.map((e) => e.id);
  const replies: unknown[] = [
    reviewReply,
    { ...reviewReply, ajustes: [{ ...reviewAdjustments[0], sets: 13 }] },
    { ...reviewReply, ajustes: [{ ...reviewAdjustments[1], max: 1 }] },
    { ...reviewReply, ajustes: [{ ...reviewAdjustments[2], replacement: 'unknown' }] },
    { ...reviewReply, ajustes: [...reviewAdjustments, reviewAdjustments[0]] },
    { ...reviewReply, pontos: ['a', 'b', 'c', 'd'] },
    { ...reviewReply, extra: true },
    { ...reviewReply, resumo: 'Texto\u2014inválido' },
    { ...reviewReply, ajustes: [null, { ...reviewAdjustments[0], operation: 'mudar_dia' }] },
  ];
  return {
    contexts: reviewCases(),
    catalog: EXERCISES.map((e) => ({ id: e.id, name: e.name })),
    replies: replies.map((input) => ({ input, expected: parseReviewReply(input, 2, ids) })),
  };
}
