import { formatDDMM, onWeekday, theWeekday, WEEKDAY_NAMES } from './dates';
import { RACE_RULES, raceLabel } from './race';
import { EXERCISES_BY_ID } from './exercises';
import { orderByGroup } from './focus';
import { WARMUP, warmupRule, warmupStyleFor } from './warmup';
import { capitalizeFirst, fmtNum, joinPt, plural } from './format';
import { isAvailable } from './substitute';
import {
  FICHA_LETTERS,
  fichaName,
  MUSCLE_VOLUME_GROUP,
  RUN_TYPE_LABEL,
  SPLITS,
  splitHasLegs,
  VOLUME_GROUP_LABEL,
} from './taxonomy';
import type {
  ExerciseDef,
  Level,
  Muscle,
  OnboardingParams,
  PlanDay,
  PlanRules,
  RunType,
  SplitKey,
  SplitStyle,
  TrainingFocus,
  VolumeGroup,
} from './types';

export interface GeneratedItem {
  exercise_id: string;
  sets: number;
  target_min: number;
  target_max: number;
  rest_sec: number;
  warmup_sets: number;
  reason: string | null;
}

export interface GeneratedRoutine {
  split_key: SplitKey;
  name: string;
  items: GeneratedItem[];
  reason: string;
}

export interface GeneratedPlan {
  gym_per_week: number;
  run_per_week: number;
  days: PlanDay[];
  rules: PlanRules;
  routines: GeneratedRoutine[];
  reasons: string[];
  /** When the user asked for 5+ gym days without forcing, the count we suggest instead. */
  suggested_gym_days: number | null;
  volume: Partial<Record<VolumeGroup, number>>;
  volume_cap: number;
}

/** Upper body in one session: shared by upper/lower and by the legs-focus rotation. */
const UPPER_A: string[][] = [
  ['supino-reto-barra', 'supino-reto-halteres', 'supino-maquina', 'flexao-bracos'],
  ['remada-curvada', 'remada-unilateral', 'remada-maquina', 'remada-invertida'],
  ['desenvolvimento-halteres-sentado', 'desenvolvimento-maquina'],
  ['puxada-frente', 'barra-fixa', 'puxada-supinada'],
  ['triceps-polia', 'triceps-corda', 'mergulho-banco'],
  ['rosca-direta', 'rosca-alternada'],
  ['elevacao-lateral', 'elevacao-lateral-polia'],
  ['crucifixo-inverso', 'face-pull'],
];

const UPPER_B: string[][] = [
  ['puxada-frente', 'barra-fixa', 'puxada-supinada'],
  ['supino-inclinado-halteres', 'supino-inclinado-maquina', 'supino-inclinado-barra'],
  ['remada-baixa', 'remada-unilateral', 'remada-maquina'],
  ['elevacao-lateral', 'elevacao-lateral-polia', 'elevacao-lateral-maquina'],
  ['crucifixo-maquina', 'crossover', 'crucifixo-halteres'],
  ['rosca-martelo', 'rosca-polia'],
  ['triceps-frances', 'triceps-corda'],
  ['face-pull', 'crucifixo-inverso'],
];

/** Candidate exercises per slot, best first. */
const SLOTS: Record<SplitKey, string[][]> = {
  costas_biceps: [
    ['puxada-frente', 'barra-fixa', 'puxada-supinada', 'remada-invertida'],
    ['remada-curvada', 'remada-unilateral', 'remada-maquina', 'remada-baixa', 'remada-invertida'],
    ['rosca-direta', 'rosca-alternada', 'rosca-polia', 'rosca-barra-w'],
    ['remada-baixa', 'remada-unilateral', 'remada-maquina', 'remada-cavalinho'],
    ['crucifixo-inverso', 'face-pull', 'crucifixo-inverso-maquina'],
    ['rosca-martelo', 'rosca-scott', 'rosca-concentrada'],
    ['puxada-triangulo', 'pulldown-bracos-estendidos', 'pullover-halter'],
    ['prancha', 'dead-bug'],
  ],
  peito_triceps: [
    ['supino-reto-barra', 'supino-reto-halteres', 'supino-maquina', 'flexao-bracos'],
    ['supino-inclinado-halteres', 'supino-inclinado-barra', 'supino-inclinado-maquina'],
    ['triceps-frances', 'triceps-testa', 'triceps-coice'],
    ['desenvolvimento-halteres-sentado', 'desenvolvimento-maquina', 'desenvolvimento-barra'],
    ['elevacao-lateral', 'elevacao-lateral-polia', 'elevacao-lateral-maquina'],
    ['triceps-polia', 'triceps-corda', 'triceps-maquina', 'mergulho-banco'],
    ['crucifixo-maquina', 'crossover', 'crucifixo-halteres'],
    ['abdominal-polia', 'abdominal-supra'],
  ],
  perna: [
    ['agachamento-livre', 'leg-press-45', 'agachamento-smith', 'hack-squat', 'agachamento-goblet'],
    ['stiff', 'stiff-halteres', 'elevacao-pelvica', 'swing-kettlebell'],
    ['leg-press-45', 'leg-press-horizontal', 'hack-squat', 'agachamento-bulgaro', 'afundo'],
    ['cadeira-flexora', 'mesa-flexora'],
    ['cadeira-extensora', 'agachamento-bulgaro', 'afundo'],
    ['panturrilha-em-pe', 'panturrilha-leg-press', 'panturrilha-halter'],
    ['elevacao-pernas-cadeira', 'prancha', 'abdominal-supra'],
    ['cadeira-abdutora', 'elevacao-pelvica'],
  ],
  ombro_abdomen: [
    ['desenvolvimento-halteres-sentado', 'desenvolvimento-maquina', 'desenvolvimento-barra'],
    ['elevacao-lateral', 'elevacao-lateral-polia', 'elevacao-lateral-maquina'],
    ['crucifixo-inverso', 'face-pull', 'crucifixo-inverso-maquina'],
    ['encolhimento-halteres', 'encolhimento-barra'],
    ['elevacao-pernas-cadeira', 'elevacao-pernas-solo', 'abdominal-infra'],
    ['prancha', 'dead-bug'],
    ['abdominal-polia', 'abdominal-supra'],
    ['prancha-lateral'],
  ],
  corpo_inteiro_a: [
    ['agachamento-livre', 'leg-press-45', 'agachamento-goblet'],
    ['supino-reto-barra', 'supino-reto-halteres', 'supino-maquina', 'flexao-bracos'],
    ['remada-curvada', 'remada-unilateral', 'remada-maquina', 'remada-invertida'],
    ['desenvolvimento-halteres-sentado', 'desenvolvimento-maquina'],
    ['cadeira-flexora', 'mesa-flexora', 'stiff-halteres'],
    // Core before the arm isolation: in a balanced week it stays even in a short session.
    ['prancha', 'dead-bug'],
    ['rosca-direta', 'rosca-alternada'],
    ['triceps-polia', 'triceps-corda', 'mergulho-banco'],
  ],
  corpo_inteiro_b: [
    ['stiff', 'stiff-halteres', 'elevacao-pelvica', 'swing-kettlebell'],
    ['puxada-frente', 'barra-fixa', 'remada-baixa'],
    ['supino-inclinado-halteres', 'supino-inclinado-maquina', 'flexao-bracos'],
    ['leg-press-45', 'agachamento-bulgaro', 'afundo'],
    ['elevacao-lateral', 'elevacao-lateral-polia'],
    ['rosca-martelo', 'rosca-polia'],
    ['triceps-frances', 'triceps-corda'],
    ['elevacao-pernas-cadeira', 'dead-bug'],
  ],
  superior_a: UPPER_A,
  superior_b: UPPER_B,
  inferior_a: [
    ['agachamento-livre', 'leg-press-45', 'agachamento-smith', 'agachamento-goblet'],
    ['stiff', 'stiff-halteres', 'elevacao-pelvica'],
    ['leg-press-45', 'hack-squat', 'agachamento-bulgaro'],
    ['cadeira-flexora', 'mesa-flexora'],
    ['panturrilha-em-pe', 'panturrilha-halter'],
    ['prancha', 'dead-bug'],
    ['cadeira-extensora'],
  ],
  inferior_b: [
    ['levantamento-terra', 'stiff', 'stiff-halteres', 'swing-kettlebell'],
    ['hack-squat', 'agachamento-bulgaro', 'leg-press-horizontal', 'afundo'],
    ['cadeira-flexora', 'mesa-flexora'],
    ['cadeira-extensora', 'passada'],
    ['panturrilha-sentado', 'panturrilha-leg-press', 'panturrilha-halter'],
    ['elevacao-pernas-cadeira', 'elevacao-pernas-solo'],
    ['cadeira-abdutora', 'elevacao-pelvica'],
  ],
  empurrar: [
    ['supino-reto-barra', 'supino-reto-halteres', 'supino-maquina', 'flexao-bracos'],
    ['desenvolvimento-halteres-sentado', 'desenvolvimento-maquina', 'desenvolvimento-barra'],
    ['supino-inclinado-halteres', 'supino-inclinado-maquina'],
    ['elevacao-lateral', 'elevacao-lateral-polia'],
    ['triceps-frances', 'triceps-testa'],
    ['triceps-polia', 'triceps-corda'],
    ['crucifixo-maquina', 'crossover'],
  ],
  puxar: [
    ['puxada-frente', 'barra-fixa', 'puxada-supinada'],
    ['remada-curvada', 'remada-unilateral', 'remada-maquina'],
    ['remada-baixa', 'remada-cavalinho'],
    ['face-pull', 'crucifixo-inverso'],
    ['rosca-direta', 'rosca-alternada'],
    ['rosca-martelo', 'rosca-scott'],
    ['encolhimento-halteres', 'encolhimento-barra'],
  ],
  peito: [
    ['supino-reto-barra', 'supino-reto-halteres', 'supino-maquina', 'flexao-bracos'],
    ['supino-inclinado-halteres', 'supino-inclinado-barra', 'supino-inclinado-maquina'],
    ['crucifixo-maquina', 'crossover', 'crucifixo-halteres'],
    ['supino-declinado', 'supino-maquina', 'flexao-bracos'],
    ['crossover', 'crucifixo-halteres', 'crucifixo-maquina'],
    ['flexao-bracos', 'supino-inclinado-maquina'],
    ['abdominal-polia', 'abdominal-supra'],
  ],
  costas: [
    ['puxada-frente', 'barra-fixa', 'puxada-supinada', 'remada-invertida'],
    ['remada-curvada', 'remada-unilateral', 'remada-maquina', 'remada-invertida'],
    ['remada-baixa', 'remada-cavalinho', 'remada-maquina'],
    ['puxada-triangulo', 'puxada-supinada', 'barra-fixa'],
    ['pulldown-bracos-estendidos', 'pullover-halter'],
    ['remada-unilateral', 'remada-maquina', 'remada-cavalinho'],
    ['hiperextensao-lombar', 'prancha'],
  ],
  bracos: [
    ['rosca-direta', 'rosca-barra-w', 'rosca-alternada'],
    ['triceps-polia', 'triceps-corda', 'triceps-maquina', 'mergulho-banco'],
    ['rosca-martelo', 'rosca-alternada', 'rosca-polia'],
    ['triceps-frances', 'triceps-testa', 'triceps-coice'],
    ['rosca-scott', 'rosca-concentrada', 'rosca-inclinada'],
    ['supino-fechado', 'paralelas', 'triceps-corda'],
    ['rosca-polia', 'rosca-concentrada'],
    ['triceps-coice', 'triceps-maquina'],
  ],
  // Legs focus: the lower body in three days of its own (front, back, glutes).
  anterior: [
    ['agachamento-livre', 'agachamento-smith', 'hack-squat', 'leg-press-45', 'agachamento-goblet'],
    ['leg-press-45', 'leg-press-horizontal', 'hack-squat', 'agachamento-goblet'],
    ['cadeira-extensora'],
    ['afundo', 'passada', 'agachamento-bulgaro'],
    ['cadeira-adutora', 'agachamento-sumo'],
    ['panturrilha-em-pe', 'panturrilha-leg-press', 'panturrilha-halter'],
    ['elevacao-pernas-cadeira', 'abdominal-supra', 'prancha'],
  ],
  posterior: [
    ['stiff', 'stiff-halteres', 'levantamento-terra'],
    ['cadeira-flexora', 'mesa-flexora'],
    ['elevacao-pelvica', 'swing-kettlebell'],
    ['cadeira-flexora', 'mesa-flexora'],
    ['agachamento-bulgaro', 'afundo', 'passada'],
    ['panturrilha-sentado', 'panturrilha-halter', 'panturrilha-leg-press'],
    ['prancha', 'dead-bug'],
  ],
  gluteos: [
    ['elevacao-pelvica', 'swing-kettlebell'],
    ['agachamento-bulgaro', 'afundo', 'passada'],
    ['cadeira-abdutora'],
    ['stiff-halteres', 'stiff', 'levantamento-terra', 'swing-kettlebell'],
    ['agachamento-sumo', 'leg-press-45', 'agachamento-goblet'],
    ['passada', 'afundo'],
    ['prancha-lateral', 'dead-bug'],
  ],
  // Three fichas: back of the thigh and glutes share the day.
  posterior_gluteos: [
    ['elevacao-pelvica', 'swing-kettlebell'],
    ['stiff', 'stiff-halteres', 'levantamento-terra'],
    ['cadeira-flexora', 'mesa-flexora'],
    ['agachamento-bulgaro', 'afundo', 'passada'],
    ['cadeira-abdutora'],
    ['cadeira-flexora', 'mesa-flexora'],
    ['panturrilha-sentado', 'panturrilha-halter'],
    ['prancha', 'dead-bug'],
  ],
  superiores: UPPER_A,
  superiores_b: UPPER_B,
  livre: [],
};

/** The muscles a legs-focus ficha opens with. */
const LEAD_MUSCLES: Partial<Record<SplitKey, Muscle[]>> = {
  posterior: ['posterior_coxa', 'gluteos'],
  gluteos: ['gluteos', 'posterior_coxa'],
  posterior_gluteos: ['gluteos', 'posterior_coxa'],
};

/** Full body with the legs focus: two lower-body exercises up front, glutes every time. */
const FULL_BODY_LEGS: Partial<Record<SplitKey, string[][]>> = {
  corpo_inteiro_a: [
    ['agachamento-livre', 'leg-press-45', 'agachamento-goblet'],
    ['elevacao-pelvica', 'stiff-halteres'],
    ['supino-reto-halteres', 'supino-maquina', 'supino-reto-barra', 'flexao-bracos'],
    ['remada-unilateral', 'remada-maquina', 'remada-curvada', 'remada-invertida'],
    ['cadeira-extensora', 'afundo'],
    ['cadeira-abdutora'],
    ['desenvolvimento-halteres-sentado', 'desenvolvimento-maquina'],
    ['prancha'],
  ],
  corpo_inteiro_b: [
    ['stiff', 'stiff-halteres', 'levantamento-terra'],
    ['agachamento-bulgaro', 'afundo', 'passada'],
    ['puxada-frente', 'barra-fixa', 'remada-baixa'],
    ['elevacao-pelvica', 'swing-kettlebell'],
    ['supino-inclinado-halteres', 'supino-inclinado-maquina', 'flexao-bracos'],
    ['cadeira-flexora', 'mesa-flexora'],
    ['elevacao-lateral', 'elevacao-lateral-polia'],
    ['dead-bug', 'elevacao-pernas-cadeira'],
  ],
};

/**
 * Fichas of each split style, in rotation order. Muscle groups: A chest and triceps,
 * B back and biceps, C legs, the classic gym ficha; four adds shoulders and abs,
 * five splits arms off too.
 */
export function fichasFor(
  style: SplitStyle,
  fichas: number,
  gymDays: number,
  focus: TrainingFocus = 'equilibrado',
): SplitKey[] {
  // Legs focus: front, back and glutes in fichas of their own, plus the upper body. The
  // first ficha is legs, so the very first workout is too.
  if (focus === 'pernas' && style === 'superior_inferior') {
    // Upper and lower with more legs: two days each from 4 days, so the legs lead and the
    // upper body still grows instead of only holding.
    if (gymDays >= 5) return ['anterior', 'superiores', 'posterior', 'superiores_b', 'gluteos'];
    if (gymDays >= 4) return ['anterior', 'superiores', 'posterior_gluteos', 'superiores_b'];
    return ['anterior', 'superiores', 'posterior_gluteos'];
  }
  if (focus === 'pernas' && style === 'grupos') {
    // Legs in parts: with 4 fichas, three of legs and one of upper body.
    if (fichas >= 5) return ['anterior', 'superiores', 'posterior', 'superiores_b', 'gluteos'];
    if (fichas === 4) return ['anterior', 'superiores', 'posterior', 'gluteos'];
    return ['anterior', 'superiores', 'posterior_gluteos'];
  }
  switch (style) {
    case 'corpo_inteiro':
      return ['corpo_inteiro_a', 'corpo_inteiro_b'];
    case 'superior_inferior':
      return gymDays >= 4
        ? ['superior_a', 'inferior_a', 'superior_b', 'inferior_b']
        : ['superior_a', 'inferior_a'];
    default:
      if (fichas >= 5) return ['peito', 'costas', 'perna', 'ombro_abdomen', 'bracos'];
      if (fichas === 4) return ['peito_triceps', 'costas_biceps', 'perna', 'ombro_abdomen'];
      return ['peito_triceps', 'costas_biceps', 'perna'];
  }
}

export type FocusGroup = Exclude<TrainingFocus, 'equilibrado'>;

/** The groups that weigh more in each focus. */
export const FOCUS_GROUPS: Record<FocusGroup, VolumeGroup[]> = {
  pernas: ['quadriceps', 'posteriores'],
  costas_ombros: ['costas', 'ombros'],
  peito_bracos: ['peito', 'biceps', 'triceps'],
  abdomen: ['core'],
};

export const FOCUS_LABEL: Record<TrainingFocus, string> = {
  equilibrado: 'Corpo todo por igual',
  pernas: 'Glúteos e pernas',
  costas_ombros: 'Costas e ombros',
  peito_bracos: 'Peito e braços',
  abdomen: 'Abdômen',
};

/** The focus of a plan as a list; empty is the whole body evenly. Older plans had one value. */
export function focusesOf(p: Pick<OnboardingParams, 'focus'>): FocusGroup[] {
  const raw = Array.isArray(p.focus) ? p.focus : p.focus ? [p.focus] : [];
  return [...new Set(raw)].filter((f): f is FocusGroup => f !== 'equilibrado' && f in FOCUS_GROUPS);
}

/** The focus that changes the split: only legs has fichas of its own. */
export function splitFocus(p: Pick<OnboardingParams, 'focus'>): TrainingFocus {
  return focusesOf(p).includes('pernas') ? 'pernas' : 'equilibrado';
}

/**
 * What the split question suggests before the person picks. Without a focus the week is
 * balanced: the whole body in each workout up to 3 days, upper and lower from 4 (the classic
 * A, B, C by group puts two upper-body days for each leg day). Legs focus: anterior, upper
 * body, posterior and glutes rotate.
 */
export function suggestedSplit(
  gymDays: number,
  focus: TrainingFocus = 'equilibrado',
  older = false,
): { style: SplitStyle; fichas: number } {
  // From 60 on the upper body needs two days a week to hold its muscle: the whole body
  // with legs first up to 3 days, upper and lower with more legs from 4.
  if (focus === 'pernas' && older) {
    return gymDays <= 3
      ? { style: 'corpo_inteiro', fichas: 2 }
      : { style: 'superior_inferior', fichas: 4 };
  }
  if (focus === 'pernas' && gymDays >= 3) return { style: 'grupos', fichas: 4 };
  if (gymDays <= 3) return { style: 'corpo_inteiro', fichas: 2 };
  // The count only matters for muscle groups: switching there starts at A to C.
  return { style: 'superior_inferior', fichas: 3 };
}

/**
 * The split the plan uses: the one picked, or the suggestion for the days and focus. The
 * screens and the agent both go through it, so a change of focus or days gets the split
 * that fits it.
 */
export function withSplit(p: OnboardingParams, picked: boolean): OnboardingParams {
  if (picked && p.split_style) return p;
  const s = suggestedSplit(p.gym_days, splitFocus(p), p.age_range === '60+');
  return { ...p, split_style: s.style, fichas: s.fichas };
}

/** The gym days of one week, filled with the fichas in order: A, B, C, A, B. */
export function projectRotation(rotation: SplitKey[], gymDays: number, start = 0): SplitKey[] {
  if (!rotation.length) return [];
  return Array.from(
    { length: gymDays },
    (_, i) => rotation[(start + i) % rotation.length] as SplitKey,
  );
}

export function splitsForDays(days: number): SplitKey[] {
  switch (days) {
    case 0:
      return [];
    case 1:
      return ['corpo_inteiro_a'];
    case 2:
      return ['corpo_inteiro_a', 'corpo_inteiro_b'];
    case 3:
      return ['costas_biceps', 'peito_triceps', 'perna'];
    case 4:
      return ['superior_a', 'inferior_a', 'superior_b', 'inferior_b'];
    case 5:
      return ['superior_a', 'inferior_a', 'superior_b', 'inferior_b', 'ombro_abdomen'];
    default:
      return ['empurrar', 'puxar', 'perna', 'empurrar', 'puxar', 'perna'].slice(
        0,
        days,
      ) as SplitKey[];
  }
}

function splitReason(days: number, splits: SplitKey[]): string {
  const names = joinPt(splits.map((s) => SPLITS[s].label.toLowerCase()));
  switch (days) {
    case 1:
      return '1 dia de academia, então corpo inteiro.';
    case 2:
      return '2 dias de academia: corpo inteiro A e B, cada grupo duas vezes na semana.';
    case 3:
      return `3 dias de academia, então a divisão de sempre: ${names}.`;
    case 4:
      return '4 dias: superior e inferior duas vezes, cada grupo treina duas vezes.';
    case 5:
      return '5 dias, como você pediu: superior e inferior duas vezes, mais ombro e abdômen.';
    default:
      return `${days} dias, como você pediu: empurrar, puxar e perna duas vezes.`;
  }
}

function rotationReasons(
  style: SplitStyle,
  rotation: SplitKey[],
  gymDays: number,
  focus: TrainingFocus = 'equilibrado',
): string[] {
  const f = rotation.length;
  const letters = FICHA_LETTERS.slice(0, f).split('');
  const list = joinPt(rotation.map((s, i) => `${letters[i]} ${SPLITS[s].label.toLowerCase()}`));
  const out: string[] = [];
  if (focus === 'pernas' && style !== 'corpo_inteiro') out.push(`${f} fichas: ${list}.`);
  else if (style === 'grupos') out.push(`${f} fichas, uma por grupo muscular: ${list}.`);
  else if (style === 'superior_inferior') out.push(`Superior e inferior em ${f} fichas: ${list}.`);
  else out.push(`Corpo inteiro em 2 fichas: ${list}. Cada grupo treina em todo treino.`);
  const week = projectRotation(rotation, gymDays)
    .map((s) => letters[rotation.indexOf(s)])
    .join(', ');
  if (gymDays > f) {
    const next = projectRotation(rotation, gymDays, gymDays)
      .map((s) => letters[rotation.indexOf(s)])
      .join(', ');
    out.push(
      `Com ${gymDays} dias e ${f} fichas, elas giram: ${week}. Na semana seguinte continua de onde parou: ${next}.`,
    );
  } else if (gymDays < f) {
    out.push(
      `Com ${gymDays} ${plural(gymDays, 'dia', 'dias')} e ${f} fichas, a semana faz ${week} e a seguinte começa da próxima ficha.`,
    );
  } else {
    out.push(`Uma ficha por dia de academia: ${week}.`);
  }
  out.push('Faltou um dia? O app sugere a próxima ficha, sem pular nenhuma.');
  return out;
}

/** 45 min fits about 5 exercises of 3 sets with 60 to 90 s of rest. */
export function exercisesForMinutes(minutes: number): number {
  return Math.min(9, Math.max(2, Math.floor((minutes - 5) / 8)));
}

export function volumeRange(
  level: Level,
  returning: boolean,
  goal: OnboardingParams['goal'] = 'hipertrofia',
  age: OnboardingParams['age_range'] = null,
): [number, number] {
  // Whoever trains for races lifts to run better: heavy and little, legs fresh for running.
  if (returning || level === 'iniciante' || goal === 'corrida') return [6, 10];
  // 60 or more: a lower start that the progression raises (fine adjustment, not a rule).
  if (age === '60+' && level !== 'avancado') return [6, 10];
  if (level === 'intermediario') return [10, 16];
  return [12, 20];
}

/**
 * Rest between work sets: more than 60 s gives a little more muscle, and beyond 90 s no
 * clear gain (Singer and colleagues, 2024); multi-joint lifts get 2 minutes.
 */
/** What each goal changes in the plan, in one line; the others need none. */
const GOAL_REASON: Partial<Record<OnboardingParams['goal'], string>> = {
  emagrecimento:
    'Para emagrecer, a musculação segura o músculo enquanto o peso cai: as séries seguem pesadas, e o resultado vem da comida e do movimento do dia.',
  condicionamento:
    'Condicionamento: mais repetições e descanso mais curto (90 s nos compostos, 60 s nos isolados), para o fôlego e a resistência do músculo.',
  saude:
    'Saúde geral: força para o corpo todo duas vezes na semana ou mais, a dose que as diretrizes da OMS recomendam.',
};

export function restFor(
  e: Pick<ExerciseDef, 'compound'>,
  goal: OnboardingParams['goal'] | null = null,
): number {
  // Conditioning trades a little muscle for density: shorter rests on purpose.
  if (goal === 'condicionamento') return e.compound ? 90 : 60;
  return e.compound ? 120 : 90;
}

export function volumeGroupOf(e: Pick<ExerciseDef, 'muscles' | 'primary_group'>): VolumeGroup {
  const m = e.muscles[0];
  return m ? MUSCLE_VOLUME_GROUP[m] : 'core';
}

export function targetFor(
  e: ExerciseDef,
  p: Pick<OnboardingParams, 'level' | 'returning' | 'goal'>,
): { min: number; max: number } {
  if (e.measure === 'time')
    return e.pattern === 'core_lateral' ? { min: 20, max: 30 } : { min: 30, max: 45 };
  if (e.primary_group === 'core') return { min: 12, max: 15 };
  const easy = p.returning || p.level === 'iniciante';
  // Conditioning: more reps per set, for local muscular endurance.
  if (p.goal === 'condicionamento') return e.compound ? { min: 10, max: 15 } : { min: 12, max: 20 };
  if (e.compound) {
    // Strength and running economy answer more to heavy loads than to sets near failure
    // (Robinson and colleagues, 2024; Llanos-Lagos and colleagues, 2024).
    if (!easy && (p.goal === 'forca' || p.goal === 'corrida')) return { min: 5, max: 8 };
    return { min: 8, max: 12 };
  }
  return easy ? { min: 12, max: 15 } : { min: 10, max: 15 };
}

interface Picked {
  e: ExerciseDef;
  slot: number;
  sets: number;
}

/**
 * A focus moves its groups up, and in a short session that pushes the last slots out. No
 * group the balanced week trains leaves the week: the missing one takes the place of the
 * last exercise whose group shows up again in the week, outside the focus when possible.
 * `candidates` are the exercises each ficha could bring back, best first.
 */
function keepEveryGroup(
  picked: Map<SplitKey, Picked[]>,
  required: Set<VolumeGroup>,
  candidates: ReadonlyMap<SplitKey, readonly Picked[]>,
  focused: Set<VolumeGroup>,
): void {
  const count = new Map<VolumeGroup, number>();
  const bump = (g: VolumeGroup, by: number) => count.set(g, (count.get(g) ?? 0) + by);
  for (const list of picked.values()) for (const it of list) bump(volumeGroupOf(it.e), 1);
  for (const g of required) {
    if (count.get(g)) continue;
    for (const [split, mine] of picked) {
      const back = candidates
        .get(split)
        ?.find((x) => volumeGroupOf(x.e) === g && !mine.some((m) => m.e.id === x.e.id));
      const repeats = mine
        .map((x, i) => ({ i, g: volumeGroupOf(x.e) }))
        .reverse()
        .filter((x) => (count.get(x.g) ?? 0) > 1);
      const victim = repeats.find((x) => !focused.has(x.g)) ?? repeats[0];
      if (!back || !victim) continue;
      const out = mine[victim.i] as Picked;
      mine[victim.i] = { e: back.e, slot: out.slot, sets: 3 };
      bump(victim.g, -1);
      bump(g, 1);
      break;
    }
  }
}

const CORE_SLOT = ['prancha', 'dead-bug', 'abdominal-supra', 'elevacao-pernas-cadeira'];

/** The group a slot trains, by its first candidate. */
function slotGroup(candidates: string[]): VolumeGroup | null {
  const e = EXERCISES_BY_ID.get(candidates[0] ?? '');
  return e ? volumeGroupOf(e) : null;
}

/**
 * Exercises of a ficha, best first. A focus weighs for real: its slots come right after the
 * opening lift (so they survive a short session) and get 4 sets instead of 3; abs focus
 * adds core where the ficha has none. Nothing else is taken out.
 */
function pickRoutine(
  split: SplitKey,
  p: OnboardingParams,
  count: number,
  focusGroups: Set<VolumeGroup> = new Set(),
): Picked[] {
  const used = new Set<string>();
  const out: Picked[] = [];
  const opts = { available: p.equipment, spareJoints: p.spare_joints };
  let slots = (focusesOf(p).includes('pernas') ? FULL_BODY_LEGS[split] : undefined) ?? SLOTS[split];
  if (focusGroups.has('core') && slots.length && !slots.some((c) => slotGroup(c) === 'core'))
    slots = [...slots, CORE_SLOT];
  if (focusGroups.size && slots.length > 1) {
    const [first, ...rest] = slots;
    const focused = (c: string[]) => focusGroups.has(slotGroup(c) as VolumeGroup);
    slots = [first as string[], ...rest.filter(focused), ...rest.filter((c) => !focused(c))];
  }
  slots.forEach((candidates, slot) => {
    if (out.length >= count) return;
    for (const id of candidates) {
      const e = EXERCISES_BY_ID.get(id);
      if (!e || used.has(id) || !isAvailable(e, opts)) continue;
      used.add(id);
      out.push({ e, slot, sets: focusGroups.has(volumeGroupOf(e)) ? 4 : 3 });
      return;
    }
  });
  return out;
}

/** Brute force over weekday layouts; the rules are hard, comfort is scored. */
export function layoutWeek(
  splits: SplitKey[],
  runs: number,
  noLegsBeforeRun = true,
  /** Keep the given order across the week (a rotation): only the days move. */
  ordered = false,
  /** Run days chosen by the person: always runs, never gym. */
  fixedRuns: number[] = [],
  /**
   * Gym days chosen by the person: always gym. More days than workouts (5 picked, 4
   * suggested) and the best of them stay.
   */
  fixedGym: number[] = [],
): { gym: (SplitKey | null)[]; run: boolean[] } | null {
  const g = splits.length;
  if (g + runs > 7) return null;
  const fixed = [...new Set(fixedRuns)].filter((d) => d >= 0 && d <= 6).slice(0, runs);
  const gymPick = [...new Set(fixedGym)]
    .filter((d) => d >= 0 && d <= 6 && !fixed.includes(d))
    .sort((a, b) => a - b);
  let best: { score: number; gym: (SplitKey | null)[]; run: boolean[] } | null = null;
  const perms = ordered ? [splits] : uniquePermutations(splits);

  const choose = (
    n: number,
    from: number[],
    start = 0,
    acc: number[] = [],
    out: number[][] = [],
  ) => {
    if (acc.length === n) {
      out.push([...acc]);
      return out;
    }
    for (let i = start; i < from.length; i += 1) {
      acc.push(from[i] as number);
      choose(n, from, i + 1, acc, out);
      acc.pop();
    }
    return out;
  };

  const all = [0, 1, 2, 3, 4, 5, 6];
  // Sorted: in a rotation the first gym day of the week gets the first ficha.
  const gymSets =
    gymPick.length >= g
      ? choose(g, gymPick)
      : choose(
          g - gymPick.length,
          all.filter((d) => !gymPick.includes(d)),
        ).map((extra) => [...gymPick, ...extra].sort((a, b) => a - b));
  for (const gymDays of gymSets) {
    if (gymDays.some((d) => fixed.includes(d))) continue;
    const rest = all.filter((d) => !gymDays.includes(d) && !fixed.includes(d));
    for (const extra of choose(runs - fixed.length, rest)) {
      const runDays = [...fixed, ...extra];
      const run = all.map((d) => runDays.includes(d));
      for (const perm of perms) {
        const gym: (SplitKey | null)[] = all.map(() => null);
        gymDays.forEach((d, i) => {
          gym[d] = perm[i] ?? null;
        });
        const score = scoreLayout(gym, run, noLegsBeforeRun);
        if (score === null) continue;
        if (!best || score < best.score) best = { score, gym, run };
      }
    }
  }
  return best ? { gym: best.gym, run: best.run } : null;
}

function scoreLayout(
  gym: (SplitKey | null)[],
  run: boolean[],
  noLegsBeforeRun: boolean,
): number | null {
  let score = 0;
  for (let d = 0; d < 7; d += 1) {
    const next = (d + 1) % 7;
    const split = gym[d];
    if (split && noLegsBeforeRun && splitHasLegs(split) && run[next]) return null;
    if (split && gym[next]) {
      score += 3;
      const a = new Set(SPLITS[split].muscles);
      if (SPLITS[gym[next] as SplitKey].muscles.some((m) => a.has(m))) score += 2;
    }
    if (run[d] && run[next]) score += 4;
    if (split && gym[next] && gym[(d + 2) % 7]) score += 3;
  }
  // Long rest stretches.
  let gap = 0;
  for (let i = 0; i < 14; i += 1) {
    const d = i % 7;
    if (gym[d] || run[d]) gap = 0;
    else {
      gap += 1;
      if (gap > 2) score += 1;
    }
  }
  const runDays = run.map((r, d) => (r ? d : -1)).filter((d) => d >= 0);
  if (runDays.length >= 2 && runDays.some((d) => d >= 5)) score -= 2;
  if (gym[0]) score -= 0.5;
  return score;
}

function uniquePermutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  const seen = new Set<string>();
  const rec = (rest: T[], acc: T[]) => {
    if (rest.length === 0) {
      const key = acc.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        out.push([...acc]);
      }
      return;
    }
    rest.forEach((item, i) => {
      rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, item]);
    });
  };
  rec(items, []);
  return out;
}

export function runTypes(runs: number, goal: OnboardingParams['goal']): RunType[] {
  if (runs <= 0) return [];
  if (runs === 1) return [goal === 'corrida' ? 'longo' : 'leve'];
  if (runs === 2) return ['leve', 'longo'];
  const middle: RunType[] = Array.from({ length: runs - 2 }, (_, i) =>
    i === 0 ? 'intervalado' : 'leve',
  );
  return ['leve', ...middle, 'longo'];
}

/**
 * Deterministic plan and routine generator. Every choice carries one sentence of why.
 * Initial loads are never invented: the first session of each exercise is the baseline.
 */
export function generatePlan(p: OnboardingParams): GeneratedPlan {
  const reasons: string[] = [];
  let gymDays = Math.max(0, Math.min(6, p.gym_days));
  const runDays = Math.max(0, Math.min(7 - Math.min(gymDays, 7), p.run_days));
  let suggested: number | null = null;
  if (gymDays >= 5 && !p.force_gym_days) {
    suggested = 4;
    reasons.push(
      `${gymDays} dias de academia${runDays ? ` com ${runDays} ${plural(runDays, 'corrida', 'corridas')}` : ''} deixam pouco descanso. Sugiro 4: cada grupo ainda treina duas vezes. Dá para forçar ${gymDays} se quiser.`,
    );
    gymDays = 4;
  }
  const foci = focusesOf(p);
  // The legs focus has fichas of its own; the other foci weigh inside the usual split.
  const focus = splitFocus(p);
  // A plan with no split (made before the split question) takes the one suggested for the
  // legs focus: without fichas of its own, that focus would change nothing.
  const older = p.age_range === '60+';
  const fallback =
    !p.split_style && focus === 'pernas' ? suggestedSplit(gymDays, focus, older) : null;
  const style = p.split_style ?? fallback?.style;
  const fichaCount = p.fichas ?? fallback?.fichas ?? 3;
  const focusGroups = new Set(foci.flatMap((f) => FOCUS_GROUPS[f]));
  // Legs already weigh through fichas of their own: 4 sets there would count it twice.
  const boosted = new Set(foci.filter((f) => f !== 'pernas').flatMap((f) => FOCUS_GROUPS[f]));
  const rotation = style && gymDays > 0 ? fichasFor(style, fichaCount, gymDays, focus) : null;
  const splits = rotation ? projectRotation(rotation, gymDays) : splitsForDays(gymDays);
  if (focus === 'pernas' && gymDays > 0) {
    reasons.push(
      style === 'corpo_inteiro'
        ? 'Foco em pernas e glúteos: todo treino abre com dois exercícios de perna e tem glúteo.'
        : 'Foco em pernas e glúteos: anterior, posterior e glúteos têm fichas próprias, e a parte de cima tem a sua. O primeiro treino já é de perna.',
    );
    // Upper body in fichas of its own: say how often it trains, and what that does.
    const upperDays = (rotation ?? []).filter(
      (s) => s === 'superiores' || s === 'superiores_b',
    ).length;
    if (style !== 'corpo_inteiro' && upperDays >= 2) {
      reasons.push(
        'A parte de cima treina 2 vezes por semana: a perna lidera e o resto do corpo ainda cresce.',
      );
    } else if (style !== 'corpo_inteiro') {
      reasons.push(
        older
          ? 'A parte de cima treina 1 vez por semana. Com 60 anos ou mais, o ideal são 2: com menos, o músculo tende a diminuir. Superior e inferior com mais perna dá 2 dias para ela.'
          : 'A parte de cima fica no nível de manter enquanto a perna é prioridade: até uns 60 anos, pouco volume com carga boa costuma bastar para não perder.',
      );
    }
  }
  const others = foci.filter((f) => f !== 'pernas');
  if (others.length && gymDays > 0) {
    reasons.push(
      `Foco em ${joinPt(others.map((f) => FOCUS_LABEL[f].toLowerCase()))}: os exercícios desses grupos têm 4 séries, entram primeiro quando o tempo é curto e o teto da semana sobe 4 séries. Os outros grupos seguem no plano.`,
    );
  }
  if (rotation && style) reasons.push(...rotationReasons(style, rotation, gymDays, focus));
  else if (gymDays > 0) reasons.push(splitReason(gymDays, splits));

  const ordered = !!rotation;
  const chosenRuns = (p.run_weekdays ?? []).filter((d) => d >= 0 && d <= 6).slice(0, runDays);
  const chosenGym = [...new Set(p.gym_weekdays ?? [])]
    .filter((d) => d >= 0 && d <= 6 && !chosenRuns.includes(d))
    .slice(0, Math.max(0, p.gym_days));
  const layout =
    layoutWeek(splits, runDays, true, ordered, chosenRuns, chosenGym) ??
    layoutWeek(splits, runDays, false, ordered, chosenRuns, chosenGym);
  // A race needs a long run in the week, whatever the goal.
  const types = runTypes(runDays, p.race ? 'corrida' : p.goal);
  const days: PlanDay[] = [];
  let runIndex = 0;
  for (let d = 0; d < 7; d += 1) {
    const split = layout?.gym[d] ?? null;
    const isRun = layout?.run[d] ?? false;
    days.push({
      weekday: d,
      kind: split ? 'gym' : isRun ? 'run' : 'rest',
      split_key: split,
      run_type: isRun ? (types[runIndex++] ?? 'leve') : null,
      time: p.time,
    });
  }

  const gymList = days.filter((d) => d.kind === 'gym').map((d) => d.weekday);
  if (chosenGym.length && gymList.length) {
    const kept = chosenGym.filter((d) => gymList.includes(d));
    const dropped = chosenGym.filter((d) => !gymList.includes(d));
    const placed = gymList.filter((d) => !chosenGym.includes(d));
    const where = `Academia ${joinPt(gymList.map(onWeekday))}`;
    if (dropped.length) {
      reasons.push(
        `${where}. Dos dias que você escolheu, ${joinPt(dropped.map(theWeekday))} ${dropped.length === 1 ? 'ficou' : 'ficaram'} de descanso.`,
      );
    } else if (placed.length) {
      reasons.push(
        `${where}. ${capitalizeFirst(joinPt(kept.map(theWeekday)))} você escolheu; ${joinPt(placed.map(theWeekday))} eu encaixei.`,
      );
    } else {
      reasons.push(`${where}, nos dias que você escolheu.`);
    }
  }

  const legDays = days.filter((d) => d.kind === 'gym' && splitHasLegs(d.split_key));
  const runList = days.filter((d) => d.kind === 'run');
  if (rotation && legDays.length && runList.length) {
    reasons.push(
      'Se a ficha de perna cair na véspera de corrida, o app sugere a ficha seguinte e perna fica para o próximo treino.',
    );
  } else if (legDays.length && runList.length) {
    const eve = legDays.filter((d) => days[(d.weekday + 1) % 7]?.kind === 'run');
    reasons.push(
      eve.length
        ? `Perna na ${joinPt(legDays.map((d) => WEEKDAY_NAMES[d.weekday] as string))}. Com esses dias de corrida, uma cai na véspera de corrida: no dia, o app sugere outro treino se der.`
        : `Perna na ${joinPt(legDays.map((d) => WEEKDAY_NAMES[d.weekday] as string))}, nunca na véspera de corrida.`,
    );
  }
  if (runList.length && p.race) {
    const rule = RACE_RULES[p.race.distance_km];
    reasons.push(
      `Prova de ${raceLabel(p.race.distance_km)} em ${formatDDMM(p.race.date)}: o longão sobe até 10 % por semana, rumo a ${fmtNum(rule.peak)} km, com uma semana mais leve a cada 4 e a reta final com menos volume, para chegar descansado.`,
    );
  }
  if (runList.length) {
    const desc = runList.map(
      (d) => `${d.run_type ? RUN_TYPE_LABEL[d.run_type] : 'leve'} ${onWeekday(d.weekday)}`,
    );
    const picked = chosenRuns.length === runList.length ? ', nos dias que você escolheu' : '';
    reasons.push(
      `${runList.length} ${plural(runList.length, 'corrida', 'corridas')}: ${joinPt(desc)}${picked}${p.goal === 'corrida' ? ', pensando na prova longa' : ''}.`,
    );
  }
  if (runList.some((d) => d.run_type === 'intervalado')) {
    reasons.push(
      'Corrida quase toda leve, no ritmo de conversa, e uma de qualidade por semana (intervalado ou limiar): para quem não é atleta, essa divisão rende tanto quanto as outras e cansa menos. Com um tempo recente seu, em Plano, cada corrida ganha ritmo.',
    );
  }

  // Routines.
  const count = exercisesForMinutes(p.minutes);
  const [, cap] = volumeRange(p.level, p.returning, p.goal, p.age_range);
  // Focus: its groups get 4 more sets a week. Gender, when given, only nudges every group
  // by 2 (women tolerate a bit more volume per session; small effect, limited evidence).
  const nudge = p.gender === 'feminino' ? 2 : 0;
  const capFor = (g: VolumeGroup) => cap + nudge + (focusGroups.has(g) ? 4 : 0);
  const uniqueSplits = rotation ?? [...new Set(splits)];
  const occurrences = new Map<SplitKey, number>();
  // In a rotation each ficha comes back every few days: count its average per week.
  if (rotation) for (const s of rotation) occurrences.set(s, gymDays / rotation.length);
  else for (const s of splits) occurrences.set(s, (occurrences.get(s) ?? 0) + 1);
  const picked = new Map<SplitKey, Picked[]>();
  for (const s of uniqueSplits) picked.set(s, pickRoutine(s, p, count, boosted));
  if (focusGroups.size) {
    // The week without the focus: the legs focus has fichas of its own, so compare with the
    // fichas the same split would have without it.
    const even = { ...p, focus: ['equilibrado' as const] };
    const evenSplits = rotation && style ? fichasFor(style, fichaCount, gymDays) : uniqueSplits;
    const required = new Set(
      evenSplits.flatMap((s) => pickRoutine(s, even, count)).map((x) => volumeGroupOf(x.e)),
    );
    const candidates = new Map(
      uniqueSplits.map(
        (s) => [s, [...pickRoutine(s, even, count), ...pickRoutine(s, p, 99)]] as const,
      ),
    );
    keepEveryGroup(picked, required, candidates, focusGroups);
  }

  // Enforce the weekly cap per volume group: trim sets from the lowest priority first.
  const volume = (): Map<VolumeGroup, number> => {
    const v = new Map<VolumeGroup, number>();
    for (const [split, list] of picked) {
      const times = occurrences.get(split) ?? 1;
      for (const it of list) {
        const g = volumeGroupOf(it.e);
        v.set(g, (v.get(g) ?? 0) + it.sets * times);
      }
    }
    return v;
  };
  for (let guard = 0; guard < 200; guard += 1) {
    const v = volume();
    const over = [...v.entries()].find(([g, n]) => n > capFor(g));
    if (!over) break;
    const [group] = over;
    // Lowest priority item of that group across routines.
    let target: { split: SplitKey; index: number; slot: number } | null = null;
    for (const [split, list] of picked) {
      list.forEach((it, index) => {
        if (volumeGroupOf(it.e) !== group) return;
        if (
          !target ||
          it.slot > target.slot ||
          (it.slot === target.slot &&
            it.sets > (picked.get(target.split)?.[target.index]?.sets ?? 0))
        ) {
          target = { split, index, slot: it.slot };
        }
      });
    }
    if (!target) break;
    const { split, index } = target as { split: SplitKey; index: number };
    const list = picked.get(split) as Picked[];
    const item = list[index] as Picked;
    if (item.sets > 2) item.sets -= 1;
    else list.splice(index, 1);
  }

  const capReason = p.returning
    ? `Modo retorno: no máximo ${cap} séries por grupo na semana e 2 a 3 repetições na reserva.`
    : p.age_range === '60+' && p.level !== 'avancado'
      ? `60 anos ou mais: começa com ${volumeRange(p.level, p.returning, p.goal, p.age_range).join(' a ')} séries por grupo na semana, e a progressão sobe a carga aos poucos.`
      : p.goal === 'corrida'
        ? `Para quem corre: ${volumeRange(p.level, p.returning, p.goal).join(' a ')} séries por grupo na semana e compostos pesados, que melhoram a economia de corrida sem cansar as pernas para correr.`
        : `Volume de ${volumeRange(p.level, p.returning, p.goal).join(' a ')} séries por grupo na semana.`;
  if (gymDays > 0) {
    reasons.push(
      `${p.minutes} min cabem ${count} exercícios de 3 séries, um grupo por vez e o composto antes do isolado.`,
    );
    reasons.push(capReason);
    const goalReason = GOAL_REASON[p.goal];
    if (goalReason) reasons.push(goalReason);
    const sample = targetFor(
      {
        compound: true,
        measure: 'weight_reps',
        primary_group: 'peito',
        pattern: 'empurrar_horizontal',
      } as ExerciseDef,
      p,
    );
    const iso = targetFor(
      {
        compound: false,
        measure: 'weight_reps',
        primary_group: 'bracos',
        pattern: 'rosca',
      } as ExerciseDef,
      p,
    );
    reasons.push(
      `Compostos em ${sample.min} a ${sample.max} repetições, isolados em ${iso.min} a ${iso.max}.`,
    );
    reasons.push('Sem carga inicial: a primeira sessão de cada exercício vira a base.');
  }
  if (p.spare_joints.length) {
    reasons.push(
      `Fora os exercícios que carregam ${joinPt(p.spare_joints.map((j) => (j === 'lombar' ? 'a lombar' : `o ${j}`)))}.`,
    );
  }

  const warm = warmupStyleFor(p.level, p.returning);
  const routines: GeneratedRoutine[] = uniqueSplits.map((split) => {
    // One muscle at a time, multi-joint first: chest, chest, chest, shoulders, triceps.
    const list = orderByGroup(
      [...(picked.get(split) ?? [])].sort((a, b) => a.slot - b.slot),
      (it) => it.e,
      LEAD_MUSCLES[split],
    );
    const items: GeneratedItem[] = list.map((it, i) => {
      const t = targetFor(it.e, p);
      return {
        exercise_id: it.e.id,
        sets: it.sets,
        target_min: t.min,
        target_max: t.max,
        rest_sec: restFor(it.e, p.goal),
        warmup_sets: i === 0 && it.e.measure === 'weight_reps' ? WARMUP[warm].sets : 0,
        reason:
          i === 0 ? `Abre o treino com aquecimento: ${warmupRule(WARMUP[warm].sets, warm)}.` : null,
      };
    });
    return {
      split_key: split,
      name: fichaName(rotation, split),
      items,
      reason: `${items.length} exercícios, ${items.reduce((a, b) => a + b.sets, 0)} séries de trabalho.`,
    };
  });

  const finalVolume = volume();
  return {
    gym_per_week: splits.length,
    run_per_week: runDays,
    days,
    rules: { no_legs_before_run: true, rotation },
    routines,
    reasons,
    suggested_gym_days: suggested,
    volume: Object.fromEntries(finalVolume) as Partial<Record<VolumeGroup, number>>,
    volume_cap: cap,
  };
}

export function volumeLabel(group: VolumeGroup): string {
  return VOLUME_GROUP_LABEL[group];
}
