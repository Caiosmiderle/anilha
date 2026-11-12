import { monthGrid } from './dates';
import { legsBeforeRunAlert, planForDay } from './recommend';
import { isPlanRoutine } from './routines';
import { SPLITS } from './taxonomy';
import type {
  DayOverrideRow,
  ExternalPlanItemRow,
  PlanRow,
  RoutineRow,
  RunRow,
  SessionRow,
  SplitKey,
} from './types';
import { projectDays } from './weekView';

export interface CalendarInput {
  month: string;
  today: string;
  plans: PlanRow[];
  routines: RoutineRow[];
  sessions: SessionRow[];
  runs: RunRow[];
  externalPlans: ExternalPlanItemRow[];
  overrides: DayOverrideRow[];
}

export interface CalendarEvent {
  id: string;
  kind: 'strength' | 'run';
  status: 'done' | 'planned' | 'missed';
  title: string;
  split: SplitKey | null;
  sessionID: string | null;
  routineID: string | null;
  runID: string | null;
  externalID: string | null;
  runType: string | null;
  distanceKm: number | null;
  important: boolean;
}

export interface CalendarDay {
  date: string;
  today: boolean;
  events: CalendarEvent[];
  warnings: string[];
}

/** Calendar view of existing rows and projectDays. No persistence or simulated completions. */
export function calendarDays(input: CalendarInput): CalendarDay[] {
  const sessions = input.sessions
    .filter((s) => !s.deleted && s.status === 'done')
    .sort(
      (a, b) =>
        b.local_date.localeCompare(a.local_date) ||
        b.started_at - a.started_at ||
        a.id.localeCompare(b.id),
    );
  const runs = input.runs.filter((r) => !r.deleted);
  const plans = input.plans.filter((p) => !p.deleted);
  const overrides = input.overrides.filter((o) => !o.deleted);
  const external = input.externalPlans.filter(
    (p) => !p.deleted && p.source === 'crunning' && p.kind === 'corrida',
  );
  const routines = input.routines
    .filter((r) => !r.deleted && !r.archived)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const first = `${input.month}-01`;
  const dates = monthGrid(input.month)
    .flat()
    .filter((d): d is string => d !== null);
  const projections = new Map<string, ReturnType<typeof projectDays>>();
  return dates.map((date) => {
    const events: CalendarEvent[] = [];
    const warnings: string[] = [];
    const base = {
      split: null,
      sessionID: null,
      routineID: null,
      runID: null,
      externalID: null,
      runType: null,
      distanceKm: null,
      important: false,
    };
    for (const s of sessions.filter((s) => s.local_date === date)) {
      events.push({
        ...base,
        id: `session:${s.id}`,
        kind: 'strength',
        status: 'done',
        title: s.title,
        split: s.split_key,
        sessionID: s.id,
        routineID: s.routine_id,
      });
    }
    for (const r of runs.filter(
      (r) => r.local_date === date && (!r.activity || r.activity === 'corrida'),
    )) {
      events.push({
        ...base,
        id: `run:${r.id}`,
        kind: 'run',
        status: 'done',
        title: 'Corrida',
        runID: r.id,
        runType: r.source_type ?? r.run_type,
        distanceKm: r.distance_km,
      });
    }
    for (const p of external.filter(
      (p) => p.local_date === date && (p.status === 'planejada' || p.status === 'perdida'),
    )) {
      events.push({
        ...base,
        id: `external:${p.id}`,
        kind: 'run',
        status: p.status === 'perdida' ? 'missed' : 'planned',
        title: p.name ?? 'Corrida',
        externalID: p.id,
        runType: p.source_type ?? p.run_type,
        distanceKm: p.distance_m == null ? null : p.distance_m / 1000,
        important: p.important === true,
      });
    }
    const plan = planForDay(plans, date);
    if (date >= input.today && plan && !events.some((e) => e.kind === 'strength')) {
      let projection = projections.get(plan.id);
      if (!projection) {
        projection = projectDays(
          { plan, today: input.today, sessions, runs, overrides },
          first,
          dates.length,
        );
        projections.set(plan.id, projection);
      }
      const day = projection.find((d) => d.date === date);
      if (day?.kind === 'gym' && day.state !== 'feito' && day.split_key) {
        const split = day.split_key;
        const same = routines.filter((r) => r.split_key === split);
        const routine = same.find(isPlanRoutine) ?? same[0];
        events.push({
          ...base,
          id: `strength:${date}`,
          kind: 'strength',
          status: 'planned',
          title: routine?.name ?? SPLITS[split].label,
          split,
          routineID: routine?.id ?? null,
        });
        const alert = legsBeforeRunAlert(
          { today: date, plan, overrides, externalPlans: external },
          split,
        );
        if (alert) warnings.push(alert.text);
      }
    }
    return { date, today: date === input.today, events, warnings };
  });
}
