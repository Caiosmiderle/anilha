import { addDays, diffDays, formatDDMM, weekday, weekStart, WEEKDAY_NAMES } from './dates';
import { capitalizeFirst, plural } from './format';
import type { CardioKind, Race, RaceDistance } from './types';

export type { Race, RaceDistance };

/**
 * Target race: the long run of each week climbs to it. Sources in docs/CIENCIA.md.
 * - No run more than 10 % above the longest of the previous 30 days: past that, overuse
 *   injuries rise (Frandsen and colleagues, 2025, 5 200 runners). The climb follows it.
 * - Three weeks up, one lighter at three quarters (coaching practice, not a study).
 * - Final stretch: 41 to 60 % less volume, up to 3 weeks, intensity kept (Wang and
 *   colleagues, 2023, meta-analysis).
 * The cycle is fixed from the week the race was set, starting at the longest run of the
 * 30 days before it, so it does not restart when the plan is opened on another day.
 */
export const RACE_DISTANCES: RaceDistance[] = [5, 10, 21, 42];

export type RaceWeekKind = 'base' | 'build' | 'cutback' | 'peak' | 'taper' | 'race';

export interface RaceWeek {
  /** Monday of the week. */
  week: string;
  kind: RaceWeekKind;
  /** The long run of the week; in the race week, the race itself. */
  long_km: number;
}

interface RaceRule {
  /** Shortest long run of the cycle. */
  start: number;
  /** Longest long run of the cycle, the week before the final stretch. */
  peak: number;
  /** Long runs of the final weeks, as a share of the longest, the last one nearest the race. */
  taper: number[];
}

export const RACE_RULES: Record<RaceDistance, RaceRule> = {
  5: { start: 3, peak: 7, taper: [0.6] },
  10: { start: 5, peak: 12, taper: [0.55] },
  21: { start: 8, peak: 18, taper: [0.65, 0.45] },
  42: { start: 12, peak: 32, taper: [0.7, 0.55, 0.4] },
};

/** 'meia maratona', 'maratona'; null for the shorter ones. */
export function raceName(distance: RaceDistance): string | null {
  return distance === 21 ? 'meia maratona' : distance === 42 ? 'maratona' : null;
}

/** '21 km (meia maratona)', '10 km' */
export function raceLabel(distance: RaceDistance): string {
  const name = raceName(distance);
  return name ? `${distance} km (${name})` : `${distance} km`;
}

/** The real distance of the race: 21 is 21,0975 km and 42 is 42,195. */
export function raceKm(distance: RaceDistance): number {
  return distance === 21 ? 21.0975 : distance === 42 ? 42.195 : distance;
}

/** Half km from 5 km up, tenths below: a short run grows by less than half a km. */
export function roundKm(km: number): number {
  return km >= 5 ? Math.round(km * 2) / 2 : Math.round(km * 10) / 10;
}

/** The longest a run can be after one of `km`: 10 % more, rounded down. */
export function nextLongRun(km: number): number {
  const up = km * 1.1 + 1e-9;
  return km >= 5 ? Math.floor(up * 2) / 2 : Math.floor(up * 10) / 10;
}

/** The climb from `start` to the peak: three weeks up, one lighter. */
function climb(rule: RaceRule, start: number): { kind: RaceWeekKind; km: number }[] {
  const out: { kind: RaceWeekKind; km: number }[] = [];
  let km = Math.min(rule.peak, Math.max(rule.start, start));
  let last = km;
  for (let i = 1; ; i += 1) {
    if (i % 4 === 0) {
      out.push({ kind: 'cutback', km: roundKm(last * 0.75) });
      continue;
    }
    if (km >= rule.peak) {
      out.push({ kind: 'peak', km: rule.peak });
      return out;
    }
    out.push({ kind: 'build', km });
    last = km;
    km = Math.min(rule.peak, nextLongRun(km));
  }
}

/** Weeks before the race week that the whole cycle uses, from a long run of `start` km. */
export function raceCycleWeeks(distance: RaceDistance, start: number | null = null): number {
  const rule = RACE_RULES[distance];
  return climb(rule, start ?? rule.start).length + rule.taper.length;
}

/** Whole weeks from the week of `day` to the race week. */
export function weeksBefore(race: Race, day: string): number {
  return Math.max(0, Math.round(diffDays(weekStart(day), weekStart(race.date)) / 7));
}

/**
 * Week by week, from this week to the race week. `start` is the longest run of the 30 days
 * before the race was set. With more weeks than the climb needs, the first ones hold the
 * start; with fewer, the long run climbs as far as the 10 % rule allows. Empty when the
 * race is over.
 */
export function raceSchedule(race: Race, today: string, start: number | null = null): RaceWeek[] {
  if (race.date < today) return [];
  const rule = RACE_RULES[race.distance_km];
  const first = Math.min(rule.peak, Math.max(rule.start, start ?? rule.start));
  const seq = climb(rule, first);
  const raceWeek = weekStart(race.date);
  // Without the day it was set, the cycle is placed whole before the race.
  const fromWeek = race.from
    ? weekStart(race.from)
    : addDays(raceWeek, -7 * (seq.length + rule.taper.length));
  const total = Math.max(0, Math.round(diffDays(fromWeek, raceWeek) / 7));
  const taper = rule.taper.slice(rule.taper.length - Math.min(total, rule.taper.length));
  const buildWeeks = total - taper.length;
  const build =
    buildWeeks >= seq.length
      ? [
          ...Array.from({ length: buildWeeks - seq.length }, () => ({
            kind: 'base' as RaceWeekKind,
            km: first,
          })),
          ...seq,
        ]
      : seq.slice(0, buildWeeks);
  const top = Math.max(first, ...build.map((w) => w.km));
  const all: RaceWeek[] = [
    ...build.map((w, i) => ({ week: addDays(fromWeek, 7 * i), kind: w.kind, long_km: w.km })),
    ...taper.map((share, i) => ({
      week: addDays(fromWeek, 7 * (buildWeeks + i)),
      kind: 'taper' as RaceWeekKind,
      long_km: Math.max(3, roundKm(top * share)),
    })),
    { week: raceWeek, kind: 'race', long_km: race.distance_km },
  ];
  const thisWeek = weekStart(today);
  return all.filter((w) => w.week >= thisWeek);
}

type RunLike = { local_date: string; distance_km: number | null; activity?: CardioKind | null };

/** The longest run of the 30 days before `day`, in km; null without one. */
export function recentLongestRun(runs: RunLike[], day: string): number | null {
  const from = addDays(day, -30);
  let best: number | null = null;
  for (const r of runs) {
    if ((r.activity ?? 'corrida') !== 'corrida' || r.distance_km == null) continue;
    if (r.local_date < from || r.local_date >= day) continue;
    best = Math.max(best ?? 0, r.distance_km);
  }
  return best;
}

/**
 * The longest run to ask of someone whose longest of the last 30 days is `recent` km: 10 %
 * more (Frandsen and colleagues, 2025). Short runs, up to 3 km, are never held back. Null
 * without recent runs: nothing to go by.
 */
export function safeLongRun(recent: number | null): number | null {
  if (recent == null) return null;
  return Math.max(3, nextLongRun(recent));
}

/** 'faltam 6 semanas', 'falta 1 semana' */
export function weeksLeft(n: number): string {
  return `${n === 1 ? 'falta' : 'faltam'} ${n} ${plural(n, 'semana', 'semanas')}`;
}

/** 'no domingo (15/11)' */
export function onRaceDay(date: string): string {
  const d = weekday(date);
  return `${d >= 5 ? 'no' : 'na'} ${WEEKDAY_NAMES[d]} (${formatDDMM(date)})`;
}

/** Where the race stands, in one line: for the card of Plan. */
export function raceCountdown(race: Race, today: string): string {
  if (race.date < today) return `Foi em ${formatDDMM(race.date)}.`;
  if (race.date === today) return 'É hoje.';
  const n = weeksBefore(race, today);
  if (n === 0) return `É nesta semana, ${onRaceDay(race.date)}.`;
  return `${capitalizeFirst(weeksLeft(n))}: ${onRaceDay(race.date)}.`;
}

/** Why a race date cannot be saved, or null when it can: ahead, and within a year. */
export function raceDateError(date: string, today: string): string | null {
  if (!date) return 'Escolha a data da prova';
  if (date < today) return 'Essa data já passou';
  if (date > addDays(today, 365)) return 'Escolha uma prova em até um ano';
  return null;
}
