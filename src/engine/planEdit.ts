import { splitHasLegs } from './taxonomy';
import type { PlanDay } from './types';

/** Gym days with legs right before a run day. */
export function legsBeforeRunDays(days: PlanDay[]): PlanDay[] {
  return days.filter(
    (d) =>
      d.kind === 'gym' && splitHasLegs(d.split_key) && days[(d.weekday + 1) % 7]?.kind === 'run',
  );
}

/**
 * Swaps what two weekdays hold: the run of Tuesday goes to Thursday and Thursday's
 * workout (or rest) comes to Tuesday, each with its own time and type.
 */
export function swapPlanDays(days: PlanDay[], a: number, b: number): PlanDay[] {
  const dayA = days.find((d) => d.weekday === a);
  const dayB = days.find((d) => d.weekday === b);
  if (!dayA || !dayB || a === b) return days;
  return days.map((d) =>
    d.weekday === a ? { ...dayB, weekday: a } : d.weekday === b ? { ...dayA, weekday: b } : d,
  );
}

export function dayKindText(d: Pick<PlanDay, 'kind'>): string {
  return d.kind === 'gym' ? 'academia' : d.kind === 'run' ? 'corrida' : 'descanso';
}
