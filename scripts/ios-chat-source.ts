import 'fake-indexeddb/auto';
import { buildAgentContext } from '../src/agent/live';
import { contextText } from '../src/agent/context';
import { executeTool } from '../src/agent/execute';
import { fichaChanges } from '../src/agent/apply';
import { PLACES } from '../src/agent/tools';
import { iosArtifacts } from './ios-source';
import { returnModeState } from '../src/engine/returnMode';
import { openDb } from '../src/data/db';
import { setCurrent } from '../src/data/store';
import type { OnboardingParams, PlanRow, RoutineItemRow, RoutineRow } from '../src/engine/types';

/** Only fictional local data. Expectations are executed by the actual PWA tools. */
export function chatCases() {
  const base = { user_id: 'fiction-chat', deleted: false, updated_at: 100 };
  const params: OnboardingParams = {
    first_name: 'Rafa', goal: 'hipertrofia', level: 'intermediario', gym_days: 3,
    minutes: 45, focus: ['pernas', 'abdomen'], gender: 'feminino', age_range: '30-39',
    spare_joints: ['joelho'], equipment: ['barra', 'halteres', 'polia', 'maquina'],
    returning: false, run_days: 0, force_gym_days: false, time: '18:00',
  };
  const routines: RoutineRow[] = [
    { ...base, id: 'a', name: 'Peito', split_key: 'peito', position: 0, reason: null, archived: false, origin: 'plano' },
    { ...base, id: 'b', name: 'Perna', split_key: 'perna', position: 1, reason: null, archived: false, origin: 'plano' },
    { ...base, id: 'own', name: 'Extra', split_key: 'bracos', position: 2, reason: null, archived: false, origin: 'pessoa' },
  ];
  const items: RoutineItemRow[] = [
    { ...base, id: 'i1', routine_id: 'a', exercise_id: 'supino-reto-barra', position: 0, sets: 3, target_min: 8, target_max: 12, rest_sec: 90, warmup_sets: 2, note: 'local-note-canary', reason: null },
    { ...base, id: 'i2', routine_id: 'a', exercise_id: 'triceps-corda', position: 1, sets: 3, target_min: 10, target_max: 15, rest_sec: 60, warmup_sets: 0, note: null, reason: null },
    { ...base, id: 'i3', routine_id: 'b', exercise_id: 'agachamento-livre', position: 0, sets: 6, target_min: 8, target_max: 12, rest_sec: 120, warmup_sets: 0, note: null, reason: null },
    { ...base, id: 'i4', routine_id: 'own', exercise_id: 'rosca-direta', position: 0, sets: 3, target_min: 10, target_max: 15, rest_sec: 90, warmup_sets: 0, note: null, reason: null },
  ];
  const plan = { ...base, id: 'plan', active_from: '2026-11-09', gym_per_week: 3, run_per_week: 0,
    rules: { rotation: ['peito', 'perna'], no_legs_before_run: true },
    days: [{ weekday: 0, kind: 'gym', split_key: 'peito' }], params,
  } as PlanRow;
  const context = buildAgentContext({ params, plan, routines, items, health: false, returnMode: false });
  const edit = (tipo: string, extra: Record<string, unknown> = {}, ficha_id = 'a') => ({
    ficha_id, mudancas: [{ tipo, exercicio_id: ficha_id === 'b' ? 'agachamento-livre' : 'supino-reto-barra', ...extra }],
  });
  const inputs: [string, string, Record<string, unknown>][] = [
    ['series', 'editar_ficha', edit('series', { series: 4 })],
    ['repeticoes', 'editar_ficha', edit('repeticoes', { repeticoes_min: 6, repeticoes_max: 10 })],
    ['descanso-zero', 'editar_ficha', edit('descanso', { descanso_segundos: 0 })],
    ['mover', 'editar_ficha', edit('mover', { posicao: 2 })],
    ['trocar', 'editar_ficha', edit('trocar', { novo_exercicio_id: 'supino-reto-halteres' })],
    ['remover', 'editar_ficha', edit('remover')],
    ['adicionar', 'editar_ficha', edit('adicionar', { exercicio_id: null, novo_exercicio_id: 'flexao-bracos' })],
    ['teto', 'editar_ficha', edit('series', { series: 12 }, 'b')],
    ['serie-fracionada', 'editar_ficha', edit('series', { series: 3.5 })],
    ['serie-string', 'editar_ficha', edit('series', { series: '4' })],
    ['adicao-string', 'editar_ficha', edit('adicionar', { novo_exercicio_id: 'flexao-bracos', series: '3' })],
    ['faixa-invertida', 'editar_ficha', edit('repeticoes', { repeticoes_min: 20 })],
    ['descanso-invalido', 'editar_ficha', edit('descanso', { descanso_segundos: 601 })],
    ['posicao-invalida', 'editar_ficha', edit('mover', { posicao: 0 })],
    ['fora-catalogo', 'editar_ficha', edit('trocar', { novo_exercicio_id: 'inexistente' })],
    ['ficha-ausente', 'editar_ficha', edit('series', { series: 3 }, 'ausente')],
    ['mudancas-vazias', 'editar_ficha', { ficha_id: 'a', mudancas: [] }],
    ['mudanca-nula', 'editar_ficha', { ficha_id: 'a', mudancas: [edit('series', { series: 5 }).mudancas[0], null] }],
    ['multiplas', 'editar_ficha', { ficha_id: 'a', mudancas: [edit('series', { series: 5 }).mudancas[0], edit('mover', { posicao: 2 }).mudancas[0], edit('descanso', { descanso_segundos: 120 }).mudancas[0]] }],
    ['remover-todos', 'editar_ficha', { ficha_id: 'a', mudancas: [{ tipo: 'remover', exercicio_id: 'supino-reto-barra' }, { tipo: 'remover', exercicio_id: 'triceps-corda' }] }],
    ...['sem_aparelho', 'ocupado', 'dor', 'preferencia'].map(reason => [reason, 'substitutos', { exercicio_id: 'supino-reto-barra', por_que: reason }] as [string, string, Record<string, unknown>]),
    ['substituto-ausente', 'substitutos', { exercicio_id: 'ausente', por_que: 'dor' }],
  ];
  const tools = inputs.map(([name, tool, input]) => {
    const ctx = name === 'teto' ? { ...context, params: { ...context.params, level: 'iniciante' as const } } : context;
    return { name, tool, input, context: ctx, expected: executeTool(tool, input, ctx) };
  });
  const contexts = Array.from({ length: 12 }, (_, index) => {
    const p = { ...params, ...(index === 2 ? { split_style: 'grupos' as const, fichas: 5 } : {}),
      ...(index === 3 ? { age_range: '60+' as const } : {}),
      ...(index === 4 ? { focus: 'equilibrado' as const, gym_days: 5 } : {}),
      ...(index === 5 ? { focus: ['abdomen', 'abdomen'] as OnboardingParams['focus'], gym_days: 2 } : {}),
    };
    const health = index === 1;
    const consent = { saude: { granted: health, version: '2026-10-19' } };
    const setting = index === 6 ? 'on' : index === 7 ? 'off' : 'auto';
    const dates = index === 8 ? ['2026-09-01'] : index === 9 ? ['2026-09-01', '2026-11-01'] : [];
    const profile = { ...base, id: 'profile', onboarding: p, return_mode: setting, return_started_on: '2026-11-01' };
    const pl = index === 10 ? null : { ...plan, params: p, ...(index === 11 ? { active_from: '2026-11-15', rules: { no_legs_before_run: true } } : {}) };
    const expected = buildAgentContext({ params: p, plan: pl, routines, items, health, returnMode: returnModeState({ today: '2026-11-12', trainingDates: dates, setting, manualStartedOn: profile.return_started_on }).active });
    return { name: `context-${index}`, input: { today: '2026-11-12', consent, tables: { profiles: [profile], plans: pl ? [pl] : [], routines, routine_items: items, sessions: dates.map(local_date => ({ ...base, id: local_date, status: 'done', local_date })) } }, expected, text: contextText(expected) };
  });
  return { catalog: iosArtifacts().catalog, places: PLACES, routines, items, plan, context, contexts, tools };
}

export async function chatArtifacts() {
  const cases = chatCases();
  const database = openDb('ios-chat-fixture');
  setCurrent({ db: database, userId: 'fiction-chat' });
  try {
    await database.routines.bulkPut(cases.routines);
    await database.routine_items.bulkPut(cases.items);
    const applications = [];
    for (const v of cases.tools) {
      const proposal = v.expected.proposal;
      if (proposal?.kind !== 'ficha') continue;
      let index = 0;
      const changes = (await fichaChanges(proposal.before.id, proposal.after)).map(c => ({
        ...c, row: cases.items.some(i => i.id === c.row.id) ? c.row : { ...c.row, id: `new-${index++}` },
      }));
      applications.push({ name: v.name, proposal, routine: cases.routines.find(r => r.id === proposal.before.id),
        old: cases.items.filter(i => i.routine_id === proposal.before.id), changes });
    }
    return { ...cases, applications };
  } finally { database.close(); await database.delete(); setCurrent(null); }
}
