import { addDays, weekday } from './dates';
import {
  hardRunAfter,
  rotationQueue,
  type DayRecommendation,
  type OverrideSummary,
  type RunSummary,
  type SessionSummary,
} from './recommend';
import { splitHasLegs } from './taxonomy';
import type { ExternalPlanItemRow, PlanRow, RunType, SplitKey } from './types';

export type DayState = 'feito' | 'hoje' | 'passou' | 'por_vir';

export interface DayView {
  date: string;
  weekday: number;
  kind: 'gym' | 'run' | 'rest' | 'light';
  /** The ficha: done that day, or the one the rotation puts there. */
  split_key: SplitKey | null;
  run_type: RunType | null;
  time: string | null;
  state: DayState;
}

export interface WeekViewInput {
  plan: Pick<PlanRow, 'days' | 'rules'>;
  sessions: Pick<SessionSummary, 'local_date' | 'split_key'>[];
  runs: Pick<RunSummary, 'local_date' | 'run_type'>[];
  overrides?: Pick<OverrideSummary, 'local_date' | 'action'>[];
  /** CRUNNING's planned runs: its important ones keep legs off the day before. */
  externalPlans?: Pick<
    ExternalPlanItemRow,
    'deleted' | 'source' | 'kind' | 'local_date' | 'status' | 'important' | 'name'
  >[];
  today: string;
  /** What Hoje recommends, so both screens say the same about today. */
  todayRec?: Pick<DayRecommendation, 'kind' | 'split_key' | 'run_type'> | null;
}

/**
 * The days from `from` on, with the real ficha of each one. Past days show what was done;
 * today follows Hoje; the next gym days take the rotation in order, and when legs would
 * land on the eve of a hard run (with that rule on) the next ficha without legs goes first.
 * Before an easy run, legs stay.
 */
export function projectDays(input: WeekViewInput, from: string, count: number): DayView[] {
  const { plan, today } = input;
  const rotation = plan.rules.rotation?.length ? plan.rules.rotation : null;
  const done = input.sessions.filter((s) => s.local_date <= today);
  const sessionOn = (d: string) => done.find((s) => s.local_date === d);
  const runOn = (d: string) => input.runs.find((r) => r.local_date === d && d <= today);
  const overrideOn = (d: string) => input.overrides?.find((o) => o.local_date === d)?.action;
  const planned = (d: string) => plan.days.find((x) => x.weekday === weekday(d)) ?? null;
  /** What is planned for a day once a one-day change (rest, run) is applied. */
  const kindOn = (d: string): 'gym' | 'run' | 'rest' => {
    const o = overrideOn(d);
    if (o === 'rest') return 'rest';
    if (o === 'run') return 'run';
    return planned(d)?.kind ?? 'rest';
  };

  // The rotation from the next ficha; today's ficha, if Hoje already picked it, goes first.
  let queue: SplitKey[] = rotation ? rotationQueue(rotation, done) : [];
  const rec = input.todayRec;
  if (rotation && !sessionOn(today) && rec?.kind === 'gym' && rec.split_key) {
    queue = [rec.split_key, ...queue.filter((s) => s !== rec.split_key)];
  }
  const take = (d: string): SplitKey | null => {
    if (!queue.length) return null;
    const avoidLegs =
      plan.rules.no_legs_before_run &&
      !!hardRunAfter(d, plan, input.overrides, input.externalPlans);
    const i = avoidLegs ? queue.findIndex((s) => !splitHasLegs(s)) : 0;
    const [picked] = queue.splice(i < 0 ? 0 : i, 1);
    queue.push(picked as SplitKey);
    return picked as SplitKey;
  };

  const out: DayView[] = [];
  // A window that starts after today: today and the days in between use up the rotation first.
  if (from > today) {
    const todayGym = rec ? rec.kind === 'gym' : kindOn(today) === 'gym';
    if (todayGym && !sessionOn(today)) take(today);
    for (let d = addDays(today, 1); d < from; d = addDays(d, 1)) if (kindOn(d) === 'gym') take(d);
  }

  for (let i = 0; i < count; i += 1) {
    const d = addDays(from, i);
    const p = planned(d);
    const base = { date: d, weekday: weekday(d), time: p?.time ?? null };
    const session = sessionOn(d);
    const run = runOn(d);
    if (d <= today && session) {
      out.push({
        ...base,
        kind: 'gym',
        split_key: session.split_key,
        run_type: null,
        state: 'feito',
      });
      continue;
    }
    if (d <= today && run) {
      out.push({
        ...base,
        kind: 'run',
        split_key: null,
        run_type: run.run_type ?? null,
        state: 'feito',
      });
      continue;
    }
    if (d < today) {
      const kind = kindOn(d);
      out.push({
        ...base,
        kind,
        split_key: kind === 'gym' ? (p?.split_key ?? null) : null,
        run_type: kind === 'run' ? (p?.run_type ?? 'leve') : null,
        state: 'passou',
      });
      continue;
    }
    if (d === today && rec) {
      const split = rec.kind === 'gym' ? (rotation ? take(d) : rec.split_key) : null;
      out.push({
        ...base,
        kind: rec.kind,
        split_key: split,
        run_type: rec.kind === 'run' ? (rec.run_type ?? 'leve') : null,
        state: 'hoje',
      });
      continue;
    }
    const kind = kindOn(d);
    out.push({
      ...base,
      kind,
      split_key: kind === 'gym' ? (rotation ? take(d) : (p?.split_key ?? null)) : null,
      run_type: kind === 'run' ? (p?.run_type ?? 'leve') : null,
      state: d === today ? 'hoje' : 'por_vir',
    });
  }
  return out;
}

/** The common time of the planned days, if they all share one. */
export function commonTime(plan: Pick<PlanRow, 'days'>): string | null {
  const times = [...new Set(plan.days.filter((d) => d.kind !== 'rest').map((d) => d.time))];
  return times.length === 1 ? (times[0] as string) : null;
}
