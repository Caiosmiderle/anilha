import { useLiveQuery } from 'dexie-react-hooks';
import { deloadAdvice, type DeloadAdvice } from '../engine/deload';
import { useEffect, useMemo, useState } from 'react';
import { toLocalDate, weekStart } from '../engine/dates';
import { summarizeSessions } from '../engine/history';
import { planForDay, type RunSummary, type SessionSummary } from '../engine/recommend';
import { returnModeState, type ReturnModeState } from '../engine/returnMode';
import type {
  BodyLogRow,
  DayOverrideRow,
  ExerciseRow,
  PainRow,
  PlanRow,
  ProfileRow,
  RecordRow,
  RoutineItemRow,
  RoutineRow,
  RunRow,
  SessionItemRow,
  SessionRow,
  SetRow,
} from '../engine/types';
import { useAccount } from '../app/account';
import { completedSetsInWeek } from './weekSets';

const EMPTY: never[] = [];

export function useExternalPlanItems() {
  const { db } = useAccount();
  return (
    useLiveQuery(() => db.external_plan_items.filter((r) => !r.deleted).toArray(), [db]) ?? EMPTY
  );
}

/** Local calendar day, refreshed when the app comes back to the foreground. */
export function useToday(): string {
  const [today, setToday] = useState(() => toLocalDate());
  useEffect(() => {
    const tick = () => setToday(toLocalDate());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

/** True once this device has pulled the account's data at least once. */
export function useInitialPullDone(): boolean | undefined {
  const { db } = useAccount();
  return useLiveQuery(async () => Boolean((await db.meta.get('initial_pull_done'))?.value), [db]);
}

/** undefined while loading, null when the account has no profile yet. */
export function useProfile(): ProfileRow | null | undefined {
  const { db, userId } = useAccount();
  return useLiveQuery(async () => (await db.profiles.get(userId)) ?? null, [db, userId]);
}

export function useExercises(): ExerciseRow[] {
  const { db } = useAccount();
  return useLiveQuery(() => db.exercises.filter((e) => !e.deleted).toArray(), [db]) ?? EMPTY;
}

/** Exercises done lately, newest first: what the person most likely wants to add again. */
export function useRecentExerciseIds(limit = 8): string[] {
  const { db } = useAccount();
  return (
    useLiveQuery(async () => {
      const sessions = (await db.sessions.where('status').equals('done').toArray())
        .filter((s) => !s.deleted)
        .sort((a, b) => b.started_at - a.started_at)
        .slice(0, 20);
      const order = new Map(sessions.map((s, i) => [s.id, i]));
      const items = (
        await db.session_items
          .where('session_id')
          .anyOf(sessions.map((s) => s.id))
          .toArray()
      )
        .filter((i) => !i.deleted && i.status === 'done')
        .sort(
          (a, b) =>
            (order.get(a.session_id) ?? 0) - (order.get(b.session_id) ?? 0) ||
            a.position - b.position,
        );
      return [...new Set(items.map((i) => i.exercise_id))].slice(0, limit);
    }, [db, limit]) ?? EMPTY
  );
}

export function useExerciseMap(): Map<string, ExerciseRow> {
  const list = useExercises();
  return useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);
}

export function usePlans(): PlanRow[] | undefined {
  const { db } = useAccount();
  return useLiveQuery(() => db.plans.filter((p) => !p.deleted).toArray(), [db]);
}

export function useCurrentPlan(day: string): { plan: PlanRow | null; loaded: boolean } {
  const plans = usePlans();
  return useMemo(
    () => ({ plan: plans ? planForDay(plans, day) : null, loaded: plans !== undefined }),
    [plans, day],
  );
}

export function useRoutines(): RoutineRow[] {
  const { db } = useAccount();
  return (
    useLiveQuery(
      async () =>
        (await db.routines.filter((r) => !r.deleted && !r.archived).toArray()).sort(
          (a, b) => a.position - b.position,
        ),
      [db],
    ) ?? EMPTY
  );
}

export function useRoutineItems(routineId?: string): RoutineItemRow[] {
  const { db } = useAccount();
  return (
    useLiveQuery(async () => {
      const list = routineId
        ? await db.routine_items.where('routine_id').equals(routineId).toArray()
        : await db.routine_items.toArray();
      return list.filter((i) => !i.deleted).sort((a, b) => a.position - b.position);
    }, [db, routineId]) ?? EMPTY
  );
}

export function useSessions(): SessionRow[] | undefined {
  const { db } = useAccount();
  return useLiveQuery(
    async () =>
      (await db.sessions.filter((s) => !s.deleted).toArray()).sort(
        (a, b) => b.local_date.localeCompare(a.local_date) || b.started_at - a.started_at,
      ),
    [db],
  );
}

export function useSession(id: string | undefined): SessionRow | null | undefined {
  const { db } = useAccount();
  return useLiveQuery(async () => (id ? ((await db.sessions.get(id)) ?? null) : null), [db, id]);
}

export function useActiveSession(): SessionRow | null | undefined {
  const { db } = useAccount();
  return useLiveQuery(
    async () =>
      (await db.sessions
        .where('status')
        .equals('active')
        .filter((s) => !s.deleted)
        .first()) ?? null,
    [db],
  );
}

export function useItems(sessionId: string | undefined): SessionItemRow[] {
  const { db } = useAccount();
  return (
    useLiveQuery(
      async () =>
        sessionId
          ? (await db.session_items.where('session_id').equals(sessionId).toArray())
              .filter((i) => !i.deleted)
              .sort((a, b) => a.position - b.position)
          : [],
      [db, sessionId],
    ) ?? EMPTY
  );
}

export function useAllItems(): SessionItemRow[] | undefined {
  const { db } = useAccount();
  return useLiveQuery(() => db.session_items.filter((i) => !i.deleted).toArray(), [db]);
}

export function useSets(sessionId: string | undefined): SetRow[] {
  const { db } = useAccount();
  return (
    useLiveQuery(
      async () =>
        sessionId
          ? (await db.sets.where('session_id').equals(sessionId).toArray())
              .filter((s) => !s.deleted)
              .sort((a, b) => a.position - b.position)
          : [],
      [db, sessionId],
    ) ?? EMPTY
  );
}

export function useAllSets(): SetRow[] | undefined {
  const { db } = useAccount();
  return useLiveQuery(
    () => db.sets.filter((s) => !s.deleted && s.completed_at != null).toArray(),
    [db],
  );
}

/** Return-mode volume: no query outside return mode, no older sets inside it. */
export function useWeekSets(day: string, enabled: boolean): SetRow[] | undefined {
  const { db } = useAccount();
  return useLiveQuery(() => completedSetsInWeek(db, day, enabled), [db, day, enabled]);
}

/** Completed sets of a few exercises, for suggestions. */
export function useSetsForExercises(ids: string[]): SetRow[] {
  const { db } = useAccount();
  const key = [...new Set(ids)].sort().join('|');
  return (
    useLiveQuery(
      async () =>
        key
          ? (await db.sets.where('exercise_id').anyOf(key.split('|')).toArray()).filter(
              (s) => !s.deleted && s.completed_at != null,
            )
          : [],
      [db, key],
    ) ?? EMPTY
  );
}

export function useRuns(): RunRow[] | undefined {
  const { db } = useAccount();
  return useLiveQuery(
    async () =>
      (await db.runs.filter((r) => !r.deleted).toArray()).sort((a, b) =>
        b.local_date.localeCompare(a.local_date),
      ),
    [db],
  );
}

export function useOverrides(): DayOverrideRow[] {
  const { db } = useAccount();
  return useLiveQuery(() => db.day_overrides.filter((o) => !o.deleted).toArray(), [db]) ?? EMPTY;
}

export function usePain(): PainRow[] {
  const { db } = useAccount();
  return useLiveQuery(() => db.pain_reports.filter((p) => !p.deleted).toArray(), [db]) ?? EMPTY;
}

export function useRecords(): RecordRow[] {
  const { db } = useAccount();
  return (
    useLiveQuery(
      async () =>
        (await db.records.filter((r) => !r.deleted).toArray()).sort((a, b) =>
          b.local_date.localeCompare(a.local_date),
        ),
      [db],
    ) ?? EMPTY
  );
}

/** Finished sessions and runs, reduced for the recommender. */
export function useHistorySummaries(): {
  sessions: SessionSummary[];
  runs: RunSummary[];
  loaded: boolean;
} {
  const sessions = useSessions();
  const items = useAllItems();
  const runs = useRuns();
  const exMap = useExerciseMap();
  return useMemo(() => {
    if (!sessions || !items || !runs) return { sessions: [], runs: [], loaded: false };
    return {
      sessions: summarizeSessions(sessions, items, exMap),
      runs: runs.map((r) => ({
        id: r.id,
        local_date: r.local_date,
        distance_km: r.distance_km,
        duration_sec: r.duration_sec,
        rpe: r.rpe,
        run_type: r.run_type,
        activity: r.activity ?? null,
      })),
      loaded: true,
    };
  }, [sessions, items, runs, exMap]);
}

export function useReturnMode(today: string): ReturnModeState {
  const profile = useProfile();
  const { sessions, runs } = useHistorySummaries();
  return useMemo(
    () =>
      returnModeState({
        today,
        trainingDates: [...sessions.map((s) => s.local_date), ...runs.map((r) => r.local_date)],
        setting: profile?.return_mode ?? 'auto',
        manualStartedOn: profile?.return_started_on,
      }),
    [today, sessions, runs, profile?.return_mode, profile?.return_started_on],
  );
}

export function useBodyLogs(): BodyLogRow[] | undefined {
  const { db } = useAccount();
  return useLiveQuery(
    async () =>
      (await db.body_logs.filter((r) => !r.deleted).toArray()).sort((a, b) =>
        b.local_date.localeCompare(a.local_date),
      ),
    [db],
  );
}

/** Whether to suggest a lighter week now, or whether one is running. */
export function useDeloadAdvice(today: string): DeloadAdvice | null {
  const profile = useProfile();
  const sessions = useSessions();
  const records = useRecords();
  const sets = useAllSets();
  const ret = useReturnMode(today);
  return useMemo(() => {
    if (!sessions || !sets || profile === undefined) return null;
    const done = sessions.filter((s) => s.status === 'done');
    const dayOf = new Map(done.map((s) => [s.id, s.local_date]));
    return deloadAdvice({
      today,
      gymDates: done.filter((s) => !s.deload).map((s) => s.local_date),
      deloadWeeks: [...new Set(done.filter((s) => s.deload).map((s) => weekStart(s.local_date)))],
      recordDates: records.filter((r) => r.exercise_id != null).map((r) => r.local_date),
      workSets: sets
        .filter((x) => x.kind === 'work' && dayOf.has(x.session_id))
        .map((x) => ({ local_date: dayOf.get(x.session_id) as string, rir: x.rir })),
      acceptedWeek: profile?.deload_week,
      dismissedOn: profile?.deload_dismissed,
      returnMode: ret.active,
    });
  }, [today, profile, sessions, records, sets, ret.active]);
}
