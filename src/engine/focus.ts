import { MUSCLE_LABEL } from './taxonomy';
import type { ExerciseDef, Muscle } from './types';

/**
 * What each built-in exercise works, in gym words: which part of the chest, which head
 * of the shoulder. Custom exercises fall back to their muscles.
 */
const FOCUS: Record<string, string> = {
  // Costas
  'puxada-frente': 'Dorsais, largura das costas',
  'puxada-supinada': 'Dorsais e bíceps',
  'puxada-triangulo': 'Dorsais, parte baixa',
  'barra-fixa': 'Dorsais, largura das costas',
  'remada-curvada': 'Meio das costas e dorsais',
  'remada-unilateral': 'Dorsais e meio das costas',
  'remada-baixa': 'Meio das costas, espessura',
  'remada-cavalinho': 'Meio das costas, espessura',
  'remada-maquina': 'Meio das costas, espessura',
  'remada-invertida': 'Meio das costas',
  'pulldown-bracos-estendidos': 'Dorsais, isolado',
  'pullover-halter': 'Dorsais e peitoral',
  'hiperextensao-lombar': 'Lombar e glúteos',
  // Peito
  'supino-reto-barra': 'Peitoral médio',
  'supino-reto-halteres': 'Peitoral médio',
  'supino-inclinado-barra': 'Peitoral superior',
  'supino-inclinado-halteres': 'Peitoral superior',
  'supino-declinado': 'Peitoral inferior',
  'supino-maquina': 'Peitoral médio',
  'supino-inclinado-maquina': 'Peitoral superior',
  'crucifixo-halteres': 'Peitoral médio, isolado',
  'crucifixo-maquina': 'Peitoral médio, isolado',
  crossover: 'Peitoral inferior e médio',
  'flexao-bracos': 'Peitoral médio e tríceps',
  // Ombros
  'desenvolvimento-halteres-sentado': 'Deltoide anterior e lateral',
  'desenvolvimento-maquina': 'Deltoide anterior e lateral',
  'desenvolvimento-barra': 'Deltoide anterior e lateral',
  'desenvolvimento-arnold': 'Deltoide anterior e lateral',
  'elevacao-lateral': 'Deltoide lateral',
  'elevacao-lateral-polia': 'Deltoide lateral',
  'elevacao-lateral-maquina': 'Deltoide lateral',
  'elevacao-frontal': 'Deltoide anterior',
  'remada-alta': 'Deltoide lateral e trapézio',
  'crucifixo-inverso': 'Deltoide posterior',
  'crucifixo-inverso-maquina': 'Deltoide posterior',
  'face-pull': 'Deltoide posterior e manguito',
  'encolhimento-halteres': 'Trapézio superior',
  'encolhimento-barra': 'Trapézio superior',
  // Braços
  'rosca-direta': 'Bíceps',
  'rosca-barra-w': 'Bíceps',
  'rosca-alternada': 'Bíceps',
  'rosca-martelo': 'Braquial e antebraço',
  'rosca-scott': 'Bíceps, porção curta',
  'rosca-concentrada': 'Bíceps, isolado',
  'rosca-polia': 'Bíceps, tensão constante',
  'rosca-inclinada': 'Bíceps, porção longa',
  'triceps-polia': 'Tríceps, cabeças lateral e medial',
  'triceps-corda': 'Tríceps, cabeça lateral',
  'triceps-frances': 'Tríceps, cabeça longa',
  'triceps-testa': 'Tríceps, cabeça longa',
  'triceps-coice': 'Tríceps, isolado',
  'triceps-maquina': 'Tríceps',
  'supino-fechado': 'Tríceps e peitoral',
  paralelas: 'Tríceps e peitoral inferior',
  'mergulho-banco': 'Tríceps',
  // Pernas
  'agachamento-livre': 'Quadríceps e glúteos',
  'agachamento-smith': 'Quadríceps e glúteos',
  'agachamento-goblet': 'Quadríceps e glúteos',
  'agachamento-sumo': 'Glúteos e adutores',
  'agachamento-bulgaro': 'Quadríceps e glúteos, uma perna',
  afundo: 'Quadríceps e glúteos',
  passada: 'Quadríceps e glúteos',
  'leg-press-45': 'Quadríceps e glúteos',
  'leg-press-horizontal': 'Quadríceps e glúteos',
  'hack-squat': 'Quadríceps',
  'cadeira-extensora': 'Quadríceps, isolado',
  'mesa-flexora': 'Posterior de coxa',
  'cadeira-flexora': 'Posterior de coxa',
  stiff: 'Posterior de coxa e glúteos',
  'stiff-halteres': 'Posterior de coxa e glúteos',
  'levantamento-terra': 'Glúteos, posterior e lombar',
  'elevacao-pelvica': 'Glúteos',
  'swing-kettlebell': 'Glúteos e posterior de coxa',
  'cadeira-abdutora': 'Glúteo médio',
  'cadeira-adutora': 'Adutores, parte interna da coxa',
  'panturrilha-em-pe': 'Panturrilha, gastrocnêmio',
  'panturrilha-sentado': 'Panturrilha, sóleo',
  'panturrilha-leg-press': 'Panturrilha',
  'panturrilha-halter': 'Panturrilha',
  // Core
  prancha: 'Core, estabilidade',
  'prancha-lateral': 'Oblíquos e core',
  'elevacao-pernas-cadeira': 'Abdômen inferior',
  'elevacao-pernas-solo': 'Abdômen inferior',
  'elevacao-pernas-barra': 'Abdômen inferior',
  'abdominal-polia': 'Reto abdominal',
  'abdominal-supra': 'Reto abdominal',
  'abdominal-maquina': 'Reto abdominal',
  'abdominal-infra': 'Abdômen inferior',
  'abdominal-bicicleta': 'Oblíquos e reto abdominal',
  'roda-abdominal': 'Core, reto abdominal',
  'pallof-press': 'Core, antirrotação',
  'dead-bug': 'Core, estabilidade',
};

export function exerciseFocus(ex: Pick<ExerciseDef, 'id' | 'muscles'>): string {
  const known = FOCUS[ex.id];
  if (known) return known;
  const names = ex.muscles.slice(0, 2).map((m) => MUSCLE_LABEL[m]);
  const text = names.join(' e ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/** Big muscles first, legs and chest before arms, calves and abs at the end. */
const MUSCLE_ORDER: Muscle[] = [
  'quadriceps',
  'gluteos',
  'adutores',
  'posterior_coxa',
  'peito',
  'costas',
  'ombro_anterior',
  'ombro_lateral',
  'ombro_posterior',
  'trapezio',
  'triceps',
  'biceps',
  'antebraco',
  'panturrilha',
  'lombar',
  'abdomen',
];

function muscleRank(ex: Pick<ExerciseDef, 'muscles'>, lead: Muscle[]): number {
  const muscle = ex.muscles[0] as Muscle;
  const first = lead.indexOf(muscle);
  if (first >= 0) return first;
  const i = MUSCLE_ORDER.indexOf(muscle);
  return lead.length + (i < 0 ? MUSCLE_ORDER.length : i);
}

/**
 * Order of a workout: one muscle at a time, the multi-joint lift of that muscle first,
 * then its isolation. Ties keep the original order. A chest day reads chest, chest,
 * chest, shoulders, triceps, abs. lead puts the muscles a ficha is about first (a
 * posterior day opens with the back of the thigh, not with the quadriceps).
 */
export function orderByGroup<T>(
  items: T[],
  exOf: (item: T) => Pick<ExerciseDef, 'muscles' | 'compound'> | undefined,
  lead: Muscle[] = [],
): T[] {
  return items
    .map((item, index) => ({ item, index, ex: exOf(item) }))
    .sort((a, b) => {
      if (!a.ex || !b.ex) return a.index - b.index;
      return (
        muscleRank(a.ex, lead) - muscleRank(b.ex, lead) ||
        Number(b.ex.compound) - Number(a.ex.compound) ||
        a.index - b.index
      );
    })
    .map((x) => x.item);
}
