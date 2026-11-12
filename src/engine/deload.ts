import { addDays, diffDays, weekStart } from './dates';

/**
 * Deload: a lighter week to clear accumulated fatigue (Bell et al. 2023 consensus
 * definition). Athletes report one about every 5 to 6 weeks, lasting about a week:
 * same exercises and frequency, fewer sets, a little less load, further from failure
 * (Rogerson et al. 2024). A 2024 trial found no extra muscle gain from it, so it is
 * offered when fatigue shows, never imposed:
 * - 8 weeks in a row training, or
 * - 5 weeks in a row and a sign: no record in 4 weeks, or 40% of recent work sets at
 *   the limit (0 reps in reserve).
 * Not in return mode (already light). Declined: quiet for 2 weeks.
 */
export const DELOAD = { setsFactor: 0.5, loadFactor: 0.9, rir: '3 a 4' } as const;

export interface DeloadInput {
  today: string;
  /** Dates of finished gym workouts outside deload weeks. */
  gymDates: string[];
  /** Mondays of weeks already done light. */
  deloadWeeks: string[];
  /** Dates of exercise records. */
  recordDates: string[];
  /** Work sets of the last weeks: date and reps in reserve. */
  workSets: { local_date: string; rir: number | null }[];
  acceptedWeek: string | null | undefined;
  dismissedOn: string | null | undefined;
  returnMode: boolean;
}

export type DeloadAdvice =
  | { state: 'active' }
  | { state: 'suggest'; weeks: number; reasons: string[] }
  | { state: 'none'; weeks: number };

/** Weeks in a row with gym training, counting back from this week (or last, if empty). */
export function trainingStreak(today: string, gymDates: string[], deloadWeeks: string[]): number {
  const weeks = new Set(gymDates.map((d) => weekStart(d)));
  const light = new Set(deloadWeeks);
  let week = weekStart(today);
  if (!weeks.has(week)) week = addDays(week, -7);
  let n = 0;
  while (weeks.has(week) && !light.has(week)) {
    n += 1;
    week = addDays(week, -7);
  }
  return n;
}

export function deloadAdvice(input: DeloadInput): DeloadAdvice {
  const { today } = input;
  if (input.acceptedWeek && input.acceptedWeek === weekStart(today)) return { state: 'active' };
  const weeks = trainingStreak(today, input.gymDates, input.deloadWeeks);
  if (input.returnMode) return { state: 'none', weeks };
  if (input.dismissedOn && diffDays(input.dismissedOn, today) < 14) return { state: 'none', weeks };

  const reasons: string[] = [];
  const noRecord =
    weeks >= 5 && !input.recordDates.some((d) => d <= today && diffDays(d, today) <= 28);
  const recent = input.workSets.filter(
    (s) => s.local_date <= today && diffDays(s.local_date, today) <= 14,
  );
  const withEffort = recent.filter((s) => s.rir != null);
  const atLimit = withEffort.filter((s) => s.rir === 0).length;
  const limitShare = withEffort.length >= 10 ? atLimit / withEffort.length : 0;

  if (weeks >= 8) reasons.push(`${weeks} semanas seguidas treinando.`);
  else if (weeks >= 5) {
    if (noRecord) reasons.push(`${weeks} semanas seguidas e nenhum recorde nas últimas 4.`);
    if (limitShare >= 0.4)
      reasons.push(
        `${Math.round(limitShare * 100)}% das séries das últimas 2 semanas foram até o limite.`,
      );
  }
  return reasons.length ? { state: 'suggest', weeks, reasons } : { state: 'none', weeks };
}

/** Sets of a deload week: half, at least one. */
export function deloadSets(sets: number): number {
  return Math.max(1, Math.ceil(sets * DELOAD.setsFactor));
}
