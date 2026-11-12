import 'fake-indexeddb/auto';
import { buildAnalysisContext, numericSet, type AnalysisInput } from '../src/analysis/context';
import { parseReply, type AnalysisAdjustment } from '../src/analysis/contract';
import { analysisProposal, type AnalysisBinding } from '../src/analysis/proposal';
import { fichaChanges } from '../src/agent/apply';
import { openDb } from '../src/data/db';
import { setCurrent } from '../src/data/store';
import { EXERCISES } from '../src/engine/exercises';
import { FOCUS_GROUPS, volumeGroupOf } from '../src/engine/generator';
import { VOLUME_GROUP_LABEL } from '../src/engine/taxonomy';
import { VOLUME_SOURCE, MAINTENANCE_SOURCE } from '../src/engine/risks';
import { evolutionCases } from './ios-evolution-source';
import type {
  OnboardingParams,
  RoutineItemRow,
  RoutineRow,
  SessionItemRow,
  SessionRow,
} from '../src/engine/types';

/** Synthetic canaries deliberately occupy every forbidden field, never actual personal data. */
export function analysisCases() {
  const row = {
    deleted: false,
    user_id: 'private-owner-canary',
    updated_at: 100,
    note: 'private-note-canary',
  };
  const tables: AnalysisInput['tables'] = {
    profiles: [
      {
        ...row,
        id: 'profile',
        name: 'private-name-canary',
        email: 'private-email-canary',
        onboarding: { spare_joints: ['private-health-canary'] },
      },
    ],
    plans: [
      {
        ...row,
        id: 'plan',
        active_from: '2026-10-26',
        params: {
          focus: ['pernas'],
          first_name: 'private-name-canary',
          gender: 'private-health-canary',
          returning: true,
        },
        reasons: ['private-note-canary'],
      },
    ],
    sessions: Array.from({ length: 7 }, (_, n) => ({
      ...row,
      id: `session-${n}`,
      routine_id: n === 6 ? 'other-routine' : 'routine',
      status: n === 5 ? 'active' : 'done',
      detail: 'full',
      local_date: `2026-11-${String(1 + n).padStart(2, '0')}`,
      started_at: 1000 * n,
      ended_at: 1000 * n + 900,
      title: 'private-title-canary',
      adjustments: ['private-health-canary'],
      deload: n === 4,
    })),
    session_items: Array.from({ length: 7 }, (_, n) => [
      {
        ...row,
        id: `item-${n}`,
        session_id: `session-${n}`,
        exercise_id: 'supino-reto-barra',
        original_exercise_id: null,
        position: 0,
        planned_sets: 3,
        target_min: 8,
        target_max: 12,
        warmup_sets: 1,
        status: n === 4 ? 'not_done' : 'done',
        pain_joint: 'private-health-canary',
        skip_reason: 'private-skip-canary',
        substitution_reason: 'private-swap-canary',
      },
      {
        ...row,
        id: `skip-${n}`,
        session_id: `session-${n}`,
        exercise_id: 'remada-baixa',
        original_exercise_id: 'remada-curvada',
        position: 1,
        planned_sets: 2,
        target_min: 8,
        target_max: 10,
        warmup_sets: 0,
        status: 'skipped',
        note: 'private-note-canary',
      },
    ]).flat(),
    sets: Array.from({ length: 7 }, (_, n) =>
      Array.from({ length: 4 }, (_, position) => ({
        ...row,
        id: `set-${n}-${position}`,
        session_id: `session-${n}`,
        item_id: `item-${n}`,
        exercise_id: 'supino-reto-barra',
        position,
        kind: position === 0 ? 'warmup' : 'work',
        load_kg: position === 0 ? 10 : 30,
        reps: position === 0 ? 6 : 10,
        seconds: null,
        rir: position === 0 ? null : 2,
        completed_at: position === 3 ? null : 1000 * n + position,
        deleted: position === 3,
      })),
    ).flat(),
  };
  tables.runs = [-3, -2, -1, 0, 1].map((offset, n) => ({
    id: 'run-' + n,
    local_date: '2026-11-0' + (5 + offset),
    run_type: 'intervalado',
    distance_km: 5,
    duration_sec: 1800,
    rpe: 7,
    note: 'private-note-canary',
    source_type: 'private-name-canary',
    activity: 'corrida',
  }));
  tables.external_plan_items = [-1, 0, 1, 2, 3].map((offset, n) => ({
    id: 'planned-' + n,
    source: 'crunning',
    kind: 'corrida',
    local_date: '2026-11-0' + (5 + offset),
    run_type: 'longo',
    distance_m: 10000,
    status: 'planejada',
    important: true,
    name: 'private-name-canary',
    source_type: 'private-name-canary',
  }));
  const planned = Object.fromEntries(
    (tables.sets ?? []).map((s) => [
      String(s.id),
      numericSet({ ...s, load_kg: 25, reps: 8, rir: null }),
    ]),
  );
  const rules = Object.fromEntries(
    (tables.session_items ?? []).map((i) => [String(i.id), 'hold_reps']),
  );
  const base: AnalysisInput = { sessionID: 'session-4', tables, planned, rules };
  const variants = [
    base,
    { ...base, planned: {}, rules: {} },
    { ...base, tables: { ...tables, plans: [] } },
    {
      ...base,
      tables: {
        ...tables,
        sessions: tables.sessions!.map((s) =>
          s.id === base.sessionID ? { ...s, routine_id: null } : s,
        ),
      },
    },
    {
      ...base,
      tables: {
        ...tables,
        session_items: tables.session_items!.map((i) =>
          i.id === 'item-4' ? { ...i, exercise_id: 'custom-private-name-canary' } : i,
        ),
      },
    },
  ];
  return variants.map((input) => ({ input, expected: buildAnalysisContext(input) }));
}
export function replyCases() {
  const base = { operation: 'series', slot: 0, sets: 2, min: null, max: null, replacement: null };
  const adjustments: unknown[] = [
    null,
    base,
    { ...base, sets: 0 },
    { ...base, sets: 13 },
    { ...base, sets: 2.5 },
    { ...base, operation: 'carga', load: 40 },
    { ...base, slot: 99 },
    { ...base, extra: true },
    { ...base, operation: 'repeticoes', sets: null, min: 8, max: 12 },
    { ...base, operation: 'repeticoes', sets: null, min: 12, max: 8 },
    { ...base, operation: 'trocar', sets: null, replacement: 'remada-baixa' },
    { ...base, operation: 'trocar', sets: null, replacement: 'inventado' },
    [base, base],
  ];
  const raw = adjustments.map((adjustment) => ({
    avaliacao: 'boa',
    proximaVez: [{ slot: 0, comentario: 'Siga a previsão do motor com controle.' }],
    summary: 'Sessão sintética concluída.',
    points: ['Compare as séries de trabalho.'],
    adjustment,
  }));
  const cases: Record<string, unknown>[] = [
    ...raw,
    { ...raw[0]!, summary: '' },
    { ...raw[0]!, points: ['a', 'b', 'c', 'd'] },
    { summary: raw[0]!.summary, points: raw[0]!.points, adjustment: null },
    { ...raw[0]!, avaliacao: 'excelente' },
    { ...raw[0]!, proximaVez: [{ slot: 2, comentario: 'Controle.' }] },
    {
      ...raw[0]!,
      proximaVez: [
        { slot: 0, comentario: 'Controle.' },
        { slot: 0, comentario: 'Repita.' },
      ],
    },
    { ...raw[0]!, proximaVez: [{ slot: 0, comentario: 'a'.repeat(181) }] },
    { ...raw[0]!, proximaVez: [{ slot: 0, comentario: 'Controle.', load_kg: 200 }] },
    { ...raw[0]!, extra: 'recusado' },
  ];
  return cases.map((input) => ({
    input,
    slots: 2,
    expected: parseReply(
      input,
      2,
      EXERCISES.map((e) => e.id),
    ),
  }));
}
export function syntheticBinding(): AnalysisBinding {
  const common = { user_id: 'synthetic-owner', updated_at: 100, deleted: false };
  const session = {
    ...common,
    ...analysisCases()[0]!.input.tables.sessions![4],
    id: 'session-4',
  } as unknown as SessionRow;
  const items = analysisCases()[0]!.input.tables.session_items!.filter(
    (i) => i.session_id === session.id,
  ) as unknown as SessionItemRow[];
  const routine = {
    ...common,
    id: 'routine',
    name: 'Ficha sintética',
    split_key: 'peito_triceps',
    position: 0,
    reason: null,
    archived: false,
    origin: 'pessoa',
  } as RoutineRow;
  const routineItems = ['supino-reto-barra', 'remada-curvada'].map((exercise_id, position) => ({
    ...common,
    id: `routine-item-${position}`,
    routine_id: routine.id,
    exercise_id,
    position,
    sets: 3,
    target_min: 8,
    target_max: 12,
    rest_sec: 90,
    warmup_sets: 2,
    note: 'Nota sintética preservada',
    reason: null,
    superset: 'pair',
  })) as RoutineItemRow[];
  const params: OnboardingParams = {
    first_name: 'Pessoa sintética',
    goal: 'hipertrofia',
    gym_days: 3,
    run_days: 0,
    force_gym_days: false,
    minutes: 45,
    equipment: ['barra', 'halteres', 'polia'],
    level: 'intermediario',
    spare_joints: [],
    returning: false,
    time: '08:00',
  };
  return { session, items, routine, routineItems, params, plan: null };
}
export async function analysisArtifacts() {
  const d = openDb('ios-analysis-fixture');
  await d.delete();
  await d.open();
  setCurrent({ db: d, userId: 'synthetic-owner' });
  const binding = syntheticBinding();
  const originalUUID = crypto.randomUUID;
  try {
    await d.routine_items.bulkPut(binding.routineItems);
    const adjustments: AnalysisAdjustment[] = [
      { operation: 'series', slot: 0, sets: 2, min: null, max: null, replacement: null },
      { operation: 'repeticoes', slot: 0, sets: null, min: 10, max: 15, replacement: null },
      {
        operation: 'trocar',
        slot: 0,
        sets: null,
        min: null,
        max: null,
        replacement: 'supino-inclinado-halteres',
      },
    ];
    const changes = [];
    for (const adjustment of adjustments) {
      crypto.randomUUID = () => '00000000-0000-4000-8000-000000000099';
      const proposal = analysisProposal(adjustment, binding);
      if (!proposal || proposal.kind !== 'ficha') throw new Error('Fixture proposal refused');
      changes.push({
        binding,
        adjustment,
        expected: await fichaChanges(binding.routine!.id, proposal.after),
        risks: proposal.risks,
      });
    }
    const risks = [];
    for (const age of [null, '60+'] as const)
      for (const returning of [false, true])
        for (const level of ['iniciante', 'intermediario', 'avancado'] as const)
          for (const sets of [1, 6, 12]) {
            const b: AnalysisBinding = {
              ...binding,
              routine: { ...binding.routine!, origin: 'plano' },
              plan: {
                id: 'plan',
                user_id: 'synthetic-owner',
                deleted: false,
                updated_at: 100,
                active_from: '2026-11-01',
                gym_per_week: 3,
                run_per_week: 0,
                days: [],
                rules: { rotation: ['peito_triceps'], no_legs_before_run: false },
                params: null,
                reasons: [],
              },
              params: {
                ...binding.params!,
                age_range: age,
                level,
                returning,
                focus: ['peito_bracos'],
              },
            };
            const adjustment: AnalysisAdjustment = {
              operation: 'series',
              slot: 0,
              sets,
              min: null,
              max: null,
              replacement: null,
            };
            const p = analysisProposal(adjustment, b);
            if (p?.kind !== 'ficha') throw new Error('Risk fixture refused');
            risks.push({ binding: b, adjustment, expected: p.risks });
          }
    return {
      catalog: EXERCISES,
      contexts: [
        ...analysisCases(),
        ...evolutionCases().map((v) => ({
          input: v.input,
          expected: buildAnalysisContext(v.input),
        })),
      ],
      evolution: evolutionCases(),
      replies: replyCases(),
      changes,
      risks,
      riskRules: {
        groups: Object.fromEntries(EXERCISES.map((e) => [e.id, volumeGroupOf(e)])),
        labels: VOLUME_GROUP_LABEL,
        focusGroups: FOCUS_GROUPS,
        volumeSource: VOLUME_SOURCE,
        maintenanceSource: MAINTENANCE_SOURCE,
      },
    };
  } finally {
    crypto.randomUUID = originalUUID;
    setCurrent(null);
    d.close();
    await d.delete();
  }
}
