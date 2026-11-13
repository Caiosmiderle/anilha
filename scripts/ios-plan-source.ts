import 'fake-indexeddb/auto';
import { openDb } from '../src/data/db';
import { defaultProfile, planChanges } from '../src/data/ops';
import { setCurrent } from '../src/data/store';
import { generatePlan, withSplit } from '../src/engine/generator';
import { ALL_EQUIPMENT } from '../src/engine/taxonomy';
import type { OnboardingParams, RoutineRow } from '../src/engine/types';

export async function planArtifacts() {
  const today = '2026-11-12';
  const base: OnboardingParams = { first_name: '  Rafa  ', last_name: ' Exemplo   Fictício ', goal: 'hipertrofia',
    gym_days: 3, run_days: 1, force_gym_days: false, minutes: 45, equipment: [...ALL_EQUIPMENT],
    level: 'intermediario', spare_joints: [], returning: false, time: '18:30' };
  const variants: Partial<OnboardingParams>[] = [
    {}, { gym_days: 1, run_days: 0, level: 'iniciante', equipment: ['peso_corporal'], minutes: 30 },
    { gym_days: 2, run_days: 2, goal: 'saude', equipment: ['halteres', 'peso_corporal'], focus: ['abdomen'] },
    { gym_days: 4, split_style: 'grupos', fichas: 4, focus: ['pernas'], returning: true },
    { gym_days: 4, split_style: 'superior_inferior', focus: ['pernas'], age_range: '60+', gender: 'feminino' },
    { gym_days: 5, run_days: 0, level: 'avancado', goal: 'forca', minutes: 90, force_gym_days: true },
    { gym_days: 6, run_days: 0, split_style: 'grupos', fichas: 5, focus: ['costas_ombros', 'peito_bracos'] },
    { gym_days: 0, run_days: 4, goal: 'corrida', race: { distance_km: 21, date: '2027-03-21', from: today } },
    { gym_days: 2, run_days: 3, goal: 'corrida', race: { distance_km: 42, date: '2027-05-23', from: today }, run_weekdays: [1, 3, 6], gym_weekdays: [0, 4] },
    { split_style: 'corpo_inteiro', focus: 'pernas', spare_joints: ['joelho', 'ombro'], returning: true },
    { goal: 'emagrecimento', minutes: 60, gender: 'masculino' },
    { goal: 'condicionamento', minutes: 75, split_style: 'grupos', fichas: 3, first_name: '', last_name: '' },
  ];
  const cases = variants.map((patch, index) => {
    const input = { ...base, ...patch };
    const picked = !!input.split_style;
    const params = withSplit(input, picked);
    return { name: `plano-${index}`, input, picked, params, expected: generatePlan(params) };
  });
  const owner = 'fiction-plan';
  const common = { user_id: owner, updated_at: 100, deleted: false, archived: false, split_key: 'livre' as const, position: 0, name: 'Ficha fictícia', reason: null };
  const routines: RoutineRow[] = [
    { ...common, id: 'old-plan', origin: 'plano' },
    { ...common, id: 'legacy-plan', reason: '5 exercícios, 15 séries de trabalho.' },
    { ...common, id: 'manual', origin: 'pessoa', reason: '5 exercícios, 15 séries de trabalho.' },
    { ...common, id: 'pronta-exemplo', reason: '5 exercícios, 15 séries de trabalho.' },
    { ...common, id: 'recebida-exemplo', reason: '5 exercícios, 15 séries de trabalho.' },
    { ...common, id: 'added', origin: 'pronta' },
    { ...common, id: 'archived', origin: 'plano', archived: true },
    { ...common, id: 'deleted', origin: 'plano', deleted: true },
  ];
  const database = openDb('ios-plan-fixture');
  setCurrent({ db: database, userId: owner });
  try {
    await database.routines.bulkPut(routines);
    const writes = [];
    for (const [index, v] of cases.entries()) {
      const profile = { ...defaultProfile(owner), user_id: owner, timezone: 'America/Sao_Paulo', updated_at: 100, display_name: 'Nome anterior',
        return_mode: (index % 3 === 0 ? 'on' : index % 3 === 1 ? 'off' : 'auto') as 'on' | 'off' | 'auto', return_started_on: index % 2 ? '2026-11-01' : null };
      await database.profiles.put(profile);
      const changes = await planChanges(v.expected, v.params, today);
      const ids = new Map<string, string>();
      for (const c of changes) if (c.table !== 'profiles' && !routines.some((r) => r.id === c.row.id)) ids.set(c.row.id, `new-${ids.size}`);
      const normalized = changes.map((c) => ({ table: c.table, row: { ...c.row, id: ids.get(c.row.id) ?? c.row.id,
        ...('routine_id' in c.row && c.row.routine_id ? { routine_id: ids.get(c.row.routine_id) ?? c.row.routine_id } : {}) } }));
      writes.push({ name: v.name, profile, params: v.params, generated: v.expected, changes: normalized });
    }
    return { today, owner, routines, cases, writes };
  } finally { setCurrent(null); database.close(); await database.delete(); }
}
