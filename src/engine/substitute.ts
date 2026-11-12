import { EXERCISES, EXERCISES_BY_ID } from './exercises';
import { MUSCLE_VOLUME_GROUP } from './taxonomy';
import type { Equipment, ExerciseDef, Joint, Level, VolumeGroup } from './types';

export interface SubstituteOptions {
  /** Equipment the user has. Peso corporal is always available. */
  available?: Equipment[];
  /** Equipment to avoid today. */
  without?: Equipment[];
  spareJoints?: Joint[];
  excludeIds?: string[];
  library?: ExerciseDef[];
}

export function isAvailable(e: ExerciseDef, o: SubstituteOptions): boolean {
  if (o.without?.includes(e.equipment)) return false;
  if (o.available && e.equipment !== 'peso_corporal' && !o.available.includes(e.equipment)) {
    return false;
  }
  if (o.spareJoints?.some((j) => e.joints.includes(j))) return false;
  if (o.excludeIds?.includes(e.id)) return false;
  return true;
}

/**
 * Alternatives for an exercise, best first: same movement pattern, then same main
 * muscle, then same group. Variations of equipment are distinct exercises.
 */
export function rankSubstitutes(exercise: ExerciseDef, o: SubstituteOptions = {}): ExerciseDef[] {
  const library = o.library ?? EXERCISES;
  const exclude = new Set([exercise.id, ...(o.excludeIds ?? [])]);
  const scored: { e: ExerciseDef; score: number; index: number }[] = [];
  library.forEach((e, index) => {
    if (exclude.has(e.id) || !isAvailable(e, { ...o, excludeIds: [] })) return;
    let score = 0;
    if (e.pattern === exercise.pattern) score += 4;
    if (e.muscles[0] && e.muscles[0] === exercise.muscles[0]) score += 2;
    if (e.primary_group === exercise.primary_group) score += 1;
    if (e.compound === exercise.compound) score += 0.5;
    if (e.measure === exercise.measure) score += 0.25;
    if (score >= 2) scored.push({ e, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.e);
}

export function findSubstitute(
  exercise: ExerciseDef,
  o: SubstituteOptions = {},
): ExerciseDef | null {
  return rankSubstitutes(exercise, o)[0] ?? null;
}

// Substitutes the person sees in the workout.

const LEVEL_RANK: Record<Level, number> = { iniciante: 0, intermediario: 1, avancado: 2 };

/**
 * Ties keep the catalog order, where the closest variant comes first (the same press with
 * dumbbells before the push-up). The phone stores exercises by id, alphabetically.
 */
const CATALOG_ORDER = new Map(EXERCISES.map((e, i) => [e.id, i]));

/** "com halteres", "na polia": the equipment inside a sentence. */
const WITH_EQUIPMENT: Record<Equipment, string> = {
  halteres: 'com halteres',
  barra: 'com barra',
  polia: 'na polia',
  maquina: 'na máquina',
  peso_corporal: 'com o peso do corpo',
  kettlebell: 'com kettlebell',
  barra_fixa: 'na barra fixa',
};

const EQUIPMENT_NOUN: Record<Equipment, string> = {
  halteres: 'halteres',
  barra: 'barra',
  polia: 'polia',
  maquina: 'máquina',
  peso_corporal: 'peso do corpo',
  kettlebell: 'kettlebell',
  barra_fixa: 'barra fixa',
};

/** Built-in exercises saved on the phone before the catalog had levels: the catalog says. */
export function levelOf(e: Pick<ExerciseDef, 'id' | 'level'>): Level | null {
  return e.level ?? EXERCISES_BY_ID.get(e.id)?.level ?? null;
}

function groupOf(e: Pick<ExerciseDef, 'muscles'>): VolumeGroup {
  const m = e.muscles[0];
  return m ? MUSCLE_VOLUME_GROUP[m] : 'core';
}

export interface SuggestOptions<T extends ExerciseDef> {
  library: readonly T[];
  /** The exercises already in the workout. The current one is always left out. */
  excludeIds?: string[];
  /** Equipment where the person trains. Peso corporal is always there. */
  available?: Equipment[];
  /** With the health consent only: joints the person spares are never suggested. */
  spareJoints?: Joint[];
  level?: Level;
  limit?: number;
}

export interface Suggestion<T extends ExerciseDef> {
  exercise: T;
  /** One line: why this one. */
  reason: string;
}

/**
 * Substitutes that make sense, best first: same muscle group (the main muscle itself first),
 * then the same movement, then equipment the person has, then a difficulty within the
 * level. Only the same muscle group is offered: the rest of the library is one tap away.
 */
export function suggestSubstitutes<T extends ExerciseDef>(
  exercise: ExerciseDef,
  o: SuggestOptions<T>,
): Suggestion<T>[] {
  const exclude = new Set([exercise.id, ...(o.excludeIds ?? [])]);
  const group = groupOf(exercise);
  const user = o.level ? LEVEL_RANK[o.level] : null;
  const scored: { e: T; key: number[]; index: number; reason: string }[] = [];
  o.library.forEach((e, index) => {
    if (exclude.has(e.id) || groupOf(e) !== group) return;
    if (o.spareJoints?.some((j) => e.joints.includes(j))) return;
    const sameMuscle = !!e.muscles[0] && e.muscles[0] === exercise.muscles[0];
    const samePattern = e.pattern === exercise.pattern;
    const has =
      !o.available || e.equipment === 'peso_corporal' || o.available.includes(e.equipment);
    const level = levelOf(e);
    const harder = user != null && level != null && LEVEL_RANK[level] > user;
    const key = [
      sameMuscle ? 1 : 0,
      samePattern ? 1 : 0,
      has ? 1 : 0,
      harder ? 0 : 1,
      e.compound === exercise.compound ? 1 : 0,
    ];
    // Equipment the person does not have: say what it asks instead of how it is done.
    const how = has ? `, ${WITH_EQUIPMENT[e.equipment]}` : '';
    const base =
      sameMuscle && samePattern
        ? 'Mesmo movimento'
        : sameMuscle
          ? 'Mesmo músculo em outro movimento'
          : `Outra parte ${groupPhrase(group)}`;
    const tail = !has
      ? `, mas pede ${EQUIPMENT_NOUN[e.equipment]}`
      : harder
        ? ', e pede mais técnica'
        : '';
    const order = CATALOG_ORDER.get(e.id) ?? EXERCISES.length + index;
    scored.push({ e, key, index: order, reason: `${base}${how}${tail}.` });
  });
  scored.sort((a, b) => {
    for (let i = 0; i < a.key.length; i += 1) {
      const d = (b.key[i] as number) - (a.key[i] as number);
      if (d) return d;
    }
    return a.index - b.index;
  });
  return scored.slice(0, o.limit ?? 6).map((s) => ({ exercise: s.e, reason: s.reason }));
}

/** "do ombro", "das costas": the group after "Outra parte". */
function groupPhrase(g: VolumeGroup): string {
  const phrase: Record<VolumeGroup, string> = {
    costas: 'das costas',
    peito: 'do peito',
    ombros: 'do ombro',
    biceps: 'do bíceps',
    triceps: 'do tríceps',
    quadriceps: 'da coxa',
    posteriores: 'do posterior',
    panturrilha: 'da panturrilha',
    core: 'do abdômen',
  };
  return phrase[g];
}
