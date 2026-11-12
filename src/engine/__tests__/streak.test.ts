import { describe, expect, it } from 'vitest';
import { dayStreak } from '../adherence';
import { addDays } from '../dates';
import type { PlanDay, PlanRow } from '../types';

/** Monday 19/10/2026. The plan starts on Monday 12, so the streaks below start there. */
const MON = '2026-10-19';

function day(weekday: number, kind: PlanDay['kind']): PlanDay {
  return { weekday, kind, split_key: null, run_type: null, time: '07:00' };
}

/** Gym on Monday, Wednesday and Friday; a run on Saturday; the rest is rest. */
const DAYS = [
  day(0, 'gym'),
  day(1, 'rest'),
  day(2, 'gym'),
  day(3, 'rest'),
  day(4, 'gym'),
  day(5, 'run'),
  day(6, 'rest'),
];

function plan(
  active_from: string,
  days = DAYS,
): Pick<PlanRow, 'days' | 'active_from' | 'updated_at'> {
  return { days, active_from, updated_at: 1 };
}

const streak = (over: Partial<Parameters<typeof dayStreak>[0]> = {}) =>
  dayStreak({ today: MON, plans: [plan('2026-10-12')], activeDates: [], overrides: [], ...over });

/** Every training day of the plan done, from `from` to `to`. */
function followed(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
    if (DAYS[wd]?.kind !== 'rest') out.push(d);
  }
  return out;
}

describe('dayStreak', () => {
  it('counts training days done and rest days of the plan', () => {
    // Monday 12 to Sunday 18 followed: 7 days; today (Monday, gym) still open.
    const r = streak({ activeDates: followed('2026-10-12', '2026-10-18') });
    expect(r).toEqual({ days: 7, todayPending: true });
  });

  it('today counts once the workout is logged', () => {
    const r = streak({ activeDates: [...followed('2026-10-12', '2026-10-18'), MON] });
    expect(r).toEqual({ days: 8, todayPending: false });
  });

  it('a training day that passed with nothing logged ends the streak', () => {
    // Friday 16 skipped: only Saturday, Sunday count.
    const done = followed('2026-10-12', '2026-10-18').filter((d) => d !== '2026-10-16');
    expect(streak({ activeDates: done }).days).toBe(2);
  });

  it('a training day marked as rest pauses: keeps the streak without adding', () => {
    const done = followed('2026-10-12', '2026-10-18').filter((d) => d !== '2026-10-16');
    const r = streak({
      activeDates: done,
      overrides: [{ local_date: '2026-10-16', action: 'rest' }],
    });
    // Monday 12 to Sunday 18 minus the paused Friday.
    expect(r.days).toBe(6);
  });

  it('marking rest every day never grows it', () => {
    const overrides = Array.from({ length: 30 }, (_, i) => ({
      local_date: addDays(MON, -i),
      action: 'rest' as const,
    }));
    const days = DAYS.map((d) => ({ ...d, kind: 'gym' as const }));
    expect(streak({ plans: [plan('2026-09-01', days)], overrides }).days).toBe(0);
  });

  it('a rest override today keeps it lit, without adding', () => {
    const r = streak({
      activeDates: followed('2026-10-12', '2026-10-18'),
      overrides: [{ local_date: MON, action: 'rest' }],
    });
    expect(r).toEqual({ days: 7, todayPending: false });
  });

  it('training on a rest day counts too, and other one-day changes do not matter', () => {
    // A run on Tuesday 13 (rest in the plan) and the gym moved to a run on Wednesday 14.
    const r = streak({
      today: '2026-10-14',
      activeDates: ['2026-10-12', '2026-10-13', '2026-10-14'],
      overrides: [{ local_date: '2026-10-14', action: 'run' }],
    });
    expect(r.days).toBe(3);
  });

  it('nothing before the first plan counts', () => {
    // Plan from Saturday 17: Saturday (run) done, Sunday rest, today open.
    const r = streak({ plans: [plan('2026-10-17')], activeDates: ['2026-10-17'] });
    expect(r).toEqual({ days: 2, todayPending: true });
    expect(streak({ plans: [] })).toEqual({ days: 0, todayPending: false });
  });

  it('each week follows the plan of that week', () => {
    // Until last week, gym on Tuesday and rest on Monday; now the other way around.
    const old = DAYS.map((d) =>
      d.weekday === 0 ? day(0, 'rest') : d.weekday === 1 ? day(1, 'gym') : d,
    );
    const plans = [plan('2026-10-12', old), { ...plan(MON), updated_at: 2 }];
    // Last week: Monday 12 rest (old plan), Tuesday 13 done, then followed.
    const done = followed('2026-10-12', '2026-10-18').filter((d) => d !== '2026-10-12');
    const r = streak({ plans, activeDates: [...done, '2026-10-13'] });
    expect(r).toEqual({ days: 7, todayPending: true });
  });
});
