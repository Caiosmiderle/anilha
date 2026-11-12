import { EXERCISES_BY_ID } from '../engine/exercises';
import { generatePlan, volumeLabel, withSplit, type GeneratedPlan } from '../engine/generator';
import { weekRisks, weeklyVolume, type Risk, type WeeklyFicha } from '../engine/risks';
import { rankSubstitutes } from '../engine/substitute';
import type { OnboardingParams, TrainingFocus, VolumeGroup } from '../engine/types';
import type { AgentContext, ContextFicha } from './context';
import { PLACES, type Place } from './tools';

/** A group whose weekly sets the proposal changes. */
export interface VolumeChange {
  group: VolumeGroup;
  before: number;
  after: number;
}

/** What the card shows and Salvar applies. */
export type Proposal =
  | {
      kind: 'plano';
      before: OnboardingParams;
      after: OnboardingParams;
      plan: GeneratedPlan;
      volume: VolumeChange[];
      risks: Risk[];
    }
  | {
      kind: 'ficha';
      before: ContextFicha;
      after: ContextFicha;
      volume: VolumeChange[];
      risks: Risk[];
    }
  | {
      kind: 'nova';
      ficha: ContextFicha;
      replaces: ContextFicha | null;
      volume: VolumeChange[];
      risks: Risk[];
    }
  | { kind: 'lugar'; place: Place; text: string };

export interface ToolOutcome {
  /** What goes back to the model, in words. */
  result: string;
  proposal: Proposal | null;
  /** For the queue: 1 the generator or the app solved it, 2 by hand, 3 nothing did. */
  level: 0 | 1 | 2 | 3;
  /** What the person wanted when nothing solved it. */
  request?: { pedido: string; categoria: string };
}

/**
 * Runs a tool the model called: what came out, in words for the model, and the proposal
 * for the card. Nothing is saved here. Pure, so the same code serves the app and the
 * comparison of models.
 */
export function executeTool(
  name: string,
  input: Record<string, unknown>,
  c: AgentContext,
): ToolOutcome {
  switch (name) {
    case 'propor_plano':
      return proposePlan(input, c);
    case 'editar_ficha':
      return editFicha(input, c);
    case 'nova_ficha':
      return newFicha(input, c);
    case 'substitutos':
      return { result: substitutes(input, c), proposal: null, level: 1 };
    case 'mostrar_onde': {
      const place = input.lugar as Place;
      if (!(place in PLACES)) return failed(`Lugar desconhecido: ${String(input.lugar)}.`);
      return {
        result: `O app mostra à pessoa um atalho para: ${PLACES[place]}`,
        proposal: { kind: 'lugar', place, text: String(input.explicacao ?? '') },
        level: 1,
      };
    }
    case 'nao_consigo':
      return {
        result: 'Pedido registrado para a equipe do Anilha avaliar.',
        proposal: null,
        level: 3,
        request: {
          pedido: String(input.pedido ?? ''),
          categoria: String(input.categoria ?? 'outro'),
        },
      };
    default:
      return failed(`Ferramenta desconhecida: ${name}.`);
  }
}

/** Only the words for the model (the comparison of models). */
export function runAgentTool(
  name: string,
  input: Record<string, unknown>,
  c: AgentContext,
): string {
  return executeTool(name, input, c).result;
}

const failed = (result: string): ToolOutcome => ({ result, proposal: null, level: 0 });

const integerIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

/** The same bounds as routine_items in the database, checked before offering a save. */
function invalidItems(
  items: ContextFicha['items'],
  existingIds = new Set<string>(),
): string | null {
  for (const it of items) {
    if (!EXERCISES_BY_ID.has(it.exercise_id) && !existingIds.has(it.exercise_id))
      return 'Use só exercícios do catálogo.';
    if (!integerIn(it.sets, 1, 12)) return 'As séries precisam ser um número inteiro de 1 a 12.';
    if (!integerIn(it.target_min, 1, 3600) || !integerIn(it.target_max, it.target_min, 3600)) {
      return 'As repetições precisam ser inteiras, de 1 a 3600, com o máximo maior ou igual ao mínimo.';
    }
    if (!integerIn(it.rest_sec, 0, 600))
      return 'O descanso precisa ser um número inteiro de 0 a 600 segundos.';
  }
  return null;
}

const SAVED = 'Proposta montada, ainda não salva: a pessoa revisa no cartão e toca em Salvar.';

const name = (id: string) => EXERCISES_BY_ID.get(id)?.name ?? id;

function itemsText(f: ContextFicha): string {
  return f.items
    .map((i) => `${name(i.exercise_id)} ${i.sets}x${i.target_min}-${i.target_max}`)
    .join('; ');
}

function risksText(risks: Risk[]): string {
  return risks.length
    ? `Avisos (explique cada um e deixe a pessoa decidir):\n${risks.map((r) => `- ${r.text} Fonte: ${r.source}`).join('\n')}`
    : 'Avisos: nenhum.';
}

export function volumeChanges(
  before: Map<VolumeGroup, number>,
  after: Map<VolumeGroup, number>,
): VolumeChange[] {
  const groups = new Set([...before.keys(), ...after.keys()]);
  return [...groups]
    .map((group) => ({ group, before: before.get(group) ?? 0, after: after.get(group) ?? 0 }))
    .filter((v) => v.before !== v.after);
}

function volumeText(changes: VolumeChange[]): string {
  return changes.length
    ? `Séries por semana que mudam: ${changes.map((v) => `${volumeLabel(v.group)} ${v.before} para ${v.after}`).join(', ')}.`
    : 'O volume da semana não muda.';
}

const weekly = (fichas: ContextFicha[]): WeeklyFicha[] =>
  fichas.map((f) => ({ items: f.items, per_week: f.per_week ?? 1 }));

function proposePlan(i: Record<string, unknown>, c: AgentContext): ToolOutcome {
  if (i.dias_academia != null && !integerIn(i.dias_academia, 1, 6))
    return failed('Não foi: escolha de 1 a 6 dias de academia por semana.');
  if (i.fichas != null && !integerIn(i.fichas, 3, 5))
    return failed('Não foi: a divisão por grupos pode ter 3, 4 ou 5 fichas.');
  if (i.minutos != null && !integerIn(i.minutos, 1, Number.MAX_SAFE_INTEGER))
    return failed('Não foi: o tempo por treino precisa ser um número inteiro positivo de minutos.');
  const draft: OnboardingParams = { ...c.params };
  if (Array.isArray(i.foco)) draft.focus = i.foco as TrainingFocus[];
  if (typeof i.dias_academia === 'number') draft.gym_days = i.dias_academia;
  if (typeof i.divisao === 'string')
    draft.split_style = i.divisao as OnboardingParams['split_style'];
  if (typeof i.fichas === 'number') {
    draft.fichas = i.fichas;
    // ABC, ABCD and ABCDE are fichas by muscle group.
    if (typeof i.divisao !== 'string') draft.split_style = 'grupos';
  }
  if (typeof i.objetivo === 'string') draft.goal = i.objetivo as OnboardingParams['goal'];
  if (typeof i.nivel === 'string') draft.level = i.nivel as OnboardingParams['level'];
  if (typeof i.minutos === 'number') draft.minutes = i.minutos;
  // The split the way the screens choose it: the person's own, or the one that fits.
  const picked =
    !!c.params.split_style || typeof i.divisao === 'string' || typeof i.fichas === 'number';
  const p = withSplit(draft, picked);
  const plan = generatePlan(p);
  const before = new Map(Object.entries(c.volume) as [VolumeGroup, number][]);
  const after = new Map(Object.entries(plan.volume) as [VolumeGroup, number][]);
  const volume = volumeChanges(before, after);
  const risks = weekRisks(before, after, p);
  return {
    result: [
      SAVED,
      `Dias de academia por semana: ${plan.gym_per_week}.`,
      `Fichas: ${plan.routines.map((r) => r.name).join(', ')}.`,
      volumeText(volume),
      plan.reasons.length
        ? `O que o gerador explica:\n${plan.reasons.map((r) => `- ${r}`).join('\n')}`
        : '',
      risksText(risks),
    ]
      .filter(Boolean)
      .join('\n'),
    proposal: { kind: 'plano', before: c.params, after: p, plan, volume, risks },
    level: 1,
  };
}

function editFicha(i: Record<string, unknown>, c: AgentContext): ToolOutcome {
  const f = c.fichas.find((x) => x.id === i.ficha_id);
  if (!f)
    return failed(
      `Não foi: não existe ficha com id ${String(i.ficha_id)}. Veja os ids no contexto.`,
    );
  if (!Array.isArray(i.mudancas) || !i.mudancas.length)
    return failed('Não foi: diga o que muda nesta ficha.');
  const items = f.items.map((x) => ({ ...x }));
  for (const m of i.mudancas as Record<string, unknown>[]) {
    if (
      !m ||
      !['trocar', 'adicionar', 'remover', 'series', 'repeticoes', 'descanso', 'mover'].includes(
        String(m.tipo),
      )
    )
      return failed('Não foi: mudança de ficha desconhecida.');
    const at = items.findIndex((x) => x.exercise_id === m.exercicio_id);
    if (m.tipo !== 'adicionar' && at < 0) {
      return failed(`Não foi: ${name(String(m.exercicio_id))} não está em ${f.name}.`);
    }
    const it = items[at];
    if (
      (m.tipo === 'trocar' || m.tipo === 'adicionar') &&
      (typeof m.novo_exercicio_id !== 'string' || !EXERCISES_BY_ID.has(m.novo_exercicio_id))
    )
      return failed('Não foi: use só exercícios do catálogo.');
    if (m.tipo === 'series' && !integerIn(m.series, 1, 12))
      return failed('Não foi: as séries precisam ser um número inteiro de 1 a 12.');
    if (m.tipo === 'adicionar' && m.series != null && !integerIn(m.series, 1, 12))
      return failed('Não foi: as séries precisam ser um número inteiro de 1 a 12.');
    if (
      (m.tipo === 'repeticoes' || m.tipo === 'adicionar') &&
      ((m.repeticoes_min != null && !integerIn(m.repeticoes_min, 1, 3600)) ||
        (m.repeticoes_max != null && !integerIn(m.repeticoes_max, 1, 3600)))
    )
      return failed('Não foi: as repetições precisam ser inteiras, de 1 a 3600.');
    if (m.tipo === 'descanso' && !integerIn(m.descanso_segundos, 0, 600))
      return failed('Não foi: o descanso precisa ser um número inteiro de 0 a 600 segundos.');
    if (m.tipo === 'mover' && !integerIn(m.posicao, 1, items.length))
      return failed(`Não foi: a posição precisa ser um número inteiro de 1 a ${items.length}.`);
    if (m.tipo === 'trocar' && it && typeof m.novo_exercicio_id === 'string')
      it.exercise_id = m.novo_exercicio_id;
    if (m.tipo === 'remover') items.splice(at, 1);
    if (m.tipo === 'series' && it && typeof m.series === 'number') it.sets = m.series;
    if (m.tipo === 'repeticoes' && it) {
      if (typeof m.repeticoes_min === 'number') it.target_min = m.repeticoes_min;
      if (typeof m.repeticoes_max === 'number') it.target_max = m.repeticoes_max;
    }
    if (m.tipo === 'descanso' && it && typeof m.descanso_segundos === 'number')
      it.rest_sec = m.descanso_segundos;
    if (m.tipo === 'mover' && it && typeof m.posicao === 'number') {
      items.splice(at, 1);
      items.splice(Math.max(0, m.posicao - 1), 0, it);
    }
    if (m.tipo === 'adicionar' && typeof m.novo_exercicio_id === 'string') {
      items.push({
        exercise_id: m.novo_exercicio_id,
        sets: typeof m.series === 'number' ? m.series : 3,
        target_min: typeof m.repeticoes_min === 'number' ? m.repeticoes_min : 10,
        target_max: typeof m.repeticoes_max === 'number' ? m.repeticoes_max : 15,
        rest_sec: 90,
      });
    }
  }
  const invalid = invalidItems(items, new Set(f.items.map((it) => it.exercise_id)));
  if (invalid) return failed(`Não foi: ${invalid}`);
  const edited = { ...f, items };
  const before = weeklyVolume(weekly(c.fichas));
  const after = weeklyVolume(weekly(c.fichas.map((x) => (x.id === f.id ? edited : x))));
  const volume = volumeChanges(before, after);
  const risks = weekRisks(before, after, c.params);
  return {
    result: [
      SAVED,
      `${f.name} depois: ${itemsText(edited)}.`,
      volumeText(volume),
      risksText(risks),
    ].join('\n'),
    proposal: { kind: 'ficha', before: f, after: edited, volume, risks },
    level: 2,
  };
}

function newFicha(i: Record<string, unknown>, c: AgentContext): ToolOutcome {
  if (typeof i.nome !== 'string' || !i.nome.trim() || i.nome.trim().length > 80)
    return failed('Não foi: o nome da ficha precisa ter de 1 a 80 caracteres.');
  if (!Array.isArray(i.exercicios) || !i.exercicios.length)
    return failed('Não foi: a ficha nova não tem exercícios.');
  if (i.exercicios.some((x) => !x || typeof x !== 'object'))
    return failed('Não foi: confira os exercícios da ficha nova.');
  const items = (i.exercicios as Record<string, unknown>[]).map((x) => ({
    exercise_id: String(x.exercicio_id),
    sets: x.series as number,
    target_min: x.repeticoes_min as number,
    target_max: x.repeticoes_max as number,
    rest_sec: EXERCISES_BY_ID.get(String(x.exercicio_id))?.compound ? 120 : 90,
  }));
  const invalid = invalidItems(items);
  if (invalid) return failed(`Não foi: ${invalid}`);
  const out =
    typeof i.substitui_ficha_id === 'string'
      ? (c.fichas.find((x) => x.id === i.substitui_ficha_id) ?? null)
      : null;
  if (typeof i.substitui_ficha_id === 'string' && !out) {
    return failed(
      `Não foi: não existe ficha com id ${i.substitui_ficha_id}. Veja os ids no contexto.`,
    );
  }
  // Replacements keep their place in the week; an extra personal ficha is outside the plan.
  const fresh: ContextFicha = {
    id: 'nova',
    name: i.nome.trim(),
    items,
    per_week: out ? (out.per_week ?? 1) : 0,
  };
  const next = out ? c.fichas.map((x) => (x.id === out.id ? fresh : x)) : [...c.fichas, fresh];
  const before = weeklyVolume(weekly(c.fichas));
  const after = weeklyVolume(weekly(next));
  const volume = volumeChanges(before, after);
  const risks = weekRisks(before, after, c.params);
  return {
    result: [
      SAVED,
      `${fresh.name}: ${itemsText(fresh)}.`,
      out ? `Entra no lugar de ${out.name}.` : 'Entra como uma ficha a mais.',
      volumeText(volume),
      risksText(risks),
    ].join('\n'),
    proposal: { kind: 'nova', ficha: fresh, replaces: out, volume, risks },
    level: 2,
  };
}

function substitutes(i: Record<string, unknown>, c: AgentContext): string {
  const e = EXERCISES_BY_ID.get(String(i.exercicio_id));
  if (!e) return `Não foi: exercício ${String(i.exercicio_id)} fora do catálogo.`;
  const base = {
    available: c.params.equipment,
    // A missing or busy machine: other equipment first.
    without: i.por_que === 'sem_aparelho' || i.por_que === 'ocupado' ? [e.equipment] : undefined,
  };
  const spared = rankSubstitutes(e, {
    ...base,
    spareJoints: i.por_que === 'dor' ? e.joints : undefined,
  }).slice(0, 4);
  // With pain, every option may load the same joint: say so instead of offering nothing.
  const options = spared.length ? spared : rankSubstitutes(e, base).slice(0, 4);
  if (!options.length) return `Nenhum substituto para ${e.name} com o que a pessoa tem.`;
  const list = options.map((o) => `${o.id} (${o.name})`).join(', ');
  return spared.length || i.por_que !== 'dor'
    ? `Substitutos de ${e.name}, melhores primeiro: ${list}. Para propor a troca, use editar_ficha.`
    : `Todos os substitutos de ${e.name} usam a mesma articulação: ${list}. Com dor, o indicado é um profissional avaliar antes; se a pessoa quiser, proponha tirar o exercício da ficha.`;
}
