import type { Level, Measure } from './types';

/**
 * Warm-up before the first lift.
 * Intermediate and advanced: progressive, after Ribeiro et al. (2020, IJERPH 17:6882),
 * 2 sets of 6 at 40% and then 80% of the working load, the best warm-up for the bench
 * press in resistance-trained men; warming up only light was the worst there.
 * Beginners, and anyone coming back from a break: one set of 10 at 40%. Their loads
 * are still low and the point is to rehearse the movement, more reps with less weight.
 */
export type WarmupStyle = 'progressive' | 'simple';

export const WARMUP: Record<WarmupStyle, { sets: number; reps: number }> = {
  progressive: { sets: 2, reps: 6 },
  simple: { sets: 1, reps: 10 },
};

export const WARMUP_REST_SEC = 60;

export function warmupStyleFor(level: Level | null | undefined, returning = false): WarmupStyle {
  return level === 'iniciante' || returning ? 'simple' : 'progressive';
}

/** Progressive goes from 40% to 80% (one set alone at 80%); simple stays at 40%. */
export function warmupPercents(sets: number, style: WarmupStyle): number[] {
  if (sets <= 0) return [];
  if (style === 'simple') return Array.from({ length: sets }, () => 0.4);
  if (sets === 1) return [0.8];
  return Array.from({ length: sets }, (_, i) => 0.4 + (0.4 * i) / (sets - 1));
}

function roundToIncrement(kg: number, increment: number): number {
  const step = increment > 0 ? increment : 1;
  return Math.max(0, Math.round(Math.round(kg / step) * step * 100) / 100);
}

/** Warm-up loads from the working load, rounded to what the machine or dumbbells allow. */
export function warmupLoads(
  workKg: number | null | undefined,
  sets: number,
  increment: number,
  style: WarmupStyle,
): (number | null)[] {
  return warmupPercents(sets, style).map((p) =>
    workKg != null && workKg > 0 ? roundToIncrement(workKg * p, increment) : null,
  );
}

/** Every workout opens with a warm-up: the first exercise with load gets at least the minimum. */
export function withMandatoryWarmup<T extends { exercise_id: string; warmup_sets: number }>(
  items: T[],
  measureOf: (exerciseId: string) => Measure | undefined,
  style: WarmupStyle,
): T[] {
  const min = WARMUP[style].sets;
  const first = items.findIndex((it) => measureOf(it.exercise_id) === 'weight_reps');
  if (first < 0) return items;
  return items.map((it, i) =>
    i === first && it.warmup_sets < min ? { ...it, warmup_sets: min } : it,
  );
}

/** "2 séries de 6, com 40% e 80% da carga de trabalho" or "1 série de 10, com 40%...". */
export function warmupRule(sets: number, style: WarmupStyle): string {
  const pcts = [...new Set(warmupPercents(sets, style).map((p) => `${Math.round(p * 100)}%`))];
  const list =
    pcts.length > 1 ? `${pcts.slice(0, -1).join(', ')} e ${pcts[pcts.length - 1]}` : pcts[0];
  const reps = WARMUP[style].reps;
  return `${sets} ${sets === 1 ? 'série' : 'séries'} de ${reps}, com ${list} da carga de trabalho`;
}
