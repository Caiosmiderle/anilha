import { addDays, diffDays } from './dates';

export const RETURN_GAP_DAYS = 21;
export const RETURN_WEEKS = 4;
export const RETURN_VOLUME_CAP = 10;

export interface ReturnModeState {
  active: boolean;
  /** First day of the comeback (or today, when the next session starts one). */
  started_on: string | null;
  ends_on: string | null;
  reason: 'pausa' | 'manual' | null;
  gap_days: number | null;
}

/**
 * Return mode: more than 3 weeks without training, or switched on by hand.
 * Lasts 4 weeks from the first session back.
 */
export function returnModeState(input: {
  today: string;
  trainingDates: string[];
  setting: 'auto' | 'on' | 'off';
  manualStartedOn?: string | null;
}): ReturnModeState {
  const { today, setting } = input;
  const off: ReturnModeState = {
    active: false,
    started_on: null,
    ends_on: null,
    reason: null,
    gap_days: null,
  };
  if (setting === 'off') return off;
  if (setting === 'on') {
    const start = input.manualStartedOn ?? today;
    const ends = addDays(start, RETURN_WEEKS * 7 - 1);
    if (today > ends) return off;
    return { active: true, started_on: start, ends_on: ends, reason: 'manual', gap_days: null };
  }

  const dates = [...new Set(input.trainingDates.filter((d) => d <= today))].sort();
  if (dates.length === 0) return off;
  const last = dates[dates.length - 1] as string;
  const sinceLast = diffDays(last, today);
  if (sinceLast > RETURN_GAP_DAYS) {
    // The next session starts a comeback.
    return {
      active: true,
      started_on: today,
      ends_on: addDays(today, RETURN_WEEKS * 7 - 1),
      reason: 'pausa',
      gap_days: sinceLast,
    };
  }
  for (let i = dates.length - 1; i >= 1; i -= 1) {
    const gap = diffDays(dates[i - 1] as string, dates[i] as string);
    if (gap > RETURN_GAP_DAYS) {
      const start = dates[i] as string;
      const ends = addDays(start, RETURN_WEEKS * 7 - 1);
      if (today <= ends) {
        return { active: true, started_on: start, ends_on: ends, reason: 'pausa', gap_days: gap };
      }
      break;
    }
  }
  return off;
}
