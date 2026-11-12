import { buildExerciseLogs } from '../engine/history';
import { EXERCISES } from '../engine/exercises';
import { diffDays, weekStart } from '../engine/dates';
import { prefillFromSuggestion, suggestNext } from '../engine/progression';
import { DELOAD, deloadSets } from '../engine/deload';
import type { ExerciseDef, SessionRow, SessionItemRow, SetRow } from '../engine/types';
import type { AnalysisInput, LocalRow } from './context';
import type { AnalysisSet } from './contract';
import { numericSet } from './context';

export interface ExerciseEvolution {
  slot: number;
  exercise: string;
  today: AnalysisSet[];
  previous: AnalysisSet[];
  days_ago: number | null;
  max_load: number | null;
  max_load_delta: number | null;
  volume: number | null;
  volume_delta: number | null;
  same_load: { load_kg: number | null; delta: number }[];
  load_record: boolean;
  reps_records: { load_kg: number | null; reps: number }[];
}
export interface ExerciseHistory {
  days_ago: number;
  best: AnalysisSet;
  volume: number | null;
}
export interface AnalysisNext {
  rule: string;
  sets: { load_kg: number | null; reps: number | null; seconds: number | null }[];
}
const work = (sets: AnalysisSet[]) => sets.filter((s) => s.kind === 'work');
const definition = (input: AnalysisInput, id: unknown): ExerciseDef | undefined =>
  (input.tables.exercises?.find((e) => e.id === id && !e.deleted) as unknown as
    ExerciseDef | undefined) ?? EXERCISES.find((e) => e.id === id);
const maximum = (sets: AnalysisSet[]) => {
  const loads = work(sets).flatMap((s) => (s.load_kg == null ? [] : [s.load_kg]));
  return loads.length ? Math.max(...loads) : null;
};
const volume = (sets: AnalysisSet[], timed: boolean) => {
  const rows = work(sets);
  return timed || !rows.length || rows.some((s) => s.load_kg == null || s.reps == null)
    ? null
    : rows.reduce((sum, s) => sum + s.load_kg! * s.reps!, 0);
};
const difference = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
const bestAt = (sets: AnalysisSet[], load: number | null, timed = false) => {
  const values = work(sets)
    .filter((s) => s.load_kg === load)
    .flatMap((s) => ((timed ? s.seconds : s.reps) == null ? [] : [(timed ? s.seconds : s.reps)!]));
  return values.length ? Math.max(...values) : null;
};

/** Only past completed sessions. The engine groups sets by the exercise actually performed. */
export function exerciseTimeline(input: AnalysisInput, exerciseID: string) {
  const current = input.tables.sessions?.find((s) => s.id === input.sessionID);
  if (!current) return [];
  const sessions = (input.tables.sessions ?? []).filter(
    (s) => s.id === current.id || Number(s.started_at) < Number(current.started_at),
  );
  const byID = new Map(sessions.map((s) => [String(s.id), s]));
  return buildExerciseLogs(
    exerciseID,
    sessions as unknown as SessionRow[],
    (input.tables.session_items ?? []) as unknown as SessionItemRow[],
    (input.tables.sets ?? []) as unknown as SetRow[],
    { includeDeload: true },
  )
    .map((log) => ({ ...log, sets: log.sets.map((s) => numericSet(s as unknown as LocalRow)) }))
    .filter((log) => work(log.sets).length > 0)
    .sort(
      (a, b) =>
        Number(byID.get(b.session_id)?.started_at) - Number(byID.get(a.session_id)?.started_at) ||
        a.session_id.localeCompare(b.session_id),
    );
}

export function exerciseHistory(input: AnalysisInput, exerciseID: string): ExerciseHistory[] {
  const current = input.tables.sessions!.find((s) => s.id === input.sessionID)!;
  const timed = definition(input, exerciseID)?.measure === 'time';
  return exerciseTimeline(input, exerciseID)
    .filter((l) => l.session_id !== input.sessionID)
    .slice(0, 5)
    .map((l) => ({
      days_ago: Math.max(0, diffDays(l.local_date, String(current.local_date))),
      best: [...work(l.sets)].sort(
        (a, b) =>
          (b.load_kg ?? 0) - (a.load_kg ?? 0) ||
          ((timed ? b.seconds : b.reps) ?? 0) - ((timed ? a.seconds : a.reps) ?? 0),
      )[0]!,
      volume: volume(l.sets, timed),
    }));
}

/** Numeric preview under the current prescription and the analyzed day's week. No writes. */
export function exerciseNext(input: AnalysisInput, item: LocalRow): AnalysisNext | null {
  const session = input.tables.sessions?.find((s) => s.id === input.sessionID);
  const exercise = definition(input, item.exercise_id);
  const routine = input.tables.routines?.find(
    (r) => r.id === session?.routine_id && !r.deleted && !r.archived,
  );
  const rows = (input.tables.routine_items ?? []).filter(
    (r) => !r.deleted && r.routine_id === routine?.id && r.exercise_id === item.exercise_id,
  );
  if (!session || !exercise || !routine || rows.length !== 1) return null;
  const row = rows[0]!;
  const date = String(session.local_date);
  const profile = input.tables.profiles?.find((p) => !p.deleted);
  const deload = profile?.deload_week === weekStart(date);
  const count = deload ? deloadSets(Number(row.sets)) : Number(row.sets);
  if (!Number.isInteger(count) || count < 1 || count > 12) return null;
  const sessions = (input.tables.sessions ?? []).filter(
    (s) => s.id === session.id || Number(s.started_at) < Number(session.started_at),
  );
  const logs = buildExerciseLogs(
    exercise.id,
    sessions as unknown as SessionRow[],
    (input.tables.session_items ?? []) as unknown as SessionItemRow[],
    (input.tables.sets ?? []) as unknown as SetRow[],
  );
  const suggestion = suggestNext({
    exercise,
    logs,
    today: date,
    target: { sets: count, min: Number(row.target_min), max: Number(row.target_max) },
    unit: profile?.unit === 'lb' ? 'lb' : 'kg',
  });
  if (!suggestion.based_on) return null;
  return {
    rule: suggestion.kind,
    sets: Array.from({ length: count }, (_, n) => {
      const pre = prefillFromSuggestion(suggestion, n);
      const load =
        pre.load_kg == null || !deload
          ? pre.load_kg
          : Math.round(
              Math.round((pre.load_kg * DELOAD.loadFactor) / exercise.increment_kg) *
                exercise.increment_kg *
                100,
            ) / 100;
      return {
        load_kg: load,
        reps: exercise.measure === 'time' ? null : pre.value,
        seconds: exercise.measure === 'time' ? pre.value : null,
      };
    }),
  };
}

/** Local and free. Warmups remain visible, while work sets supply comparisons and records. */
export function buildEvolution(input: AnalysisInput): ExerciseEvolution[] {
  const session = input.tables.sessions?.find((s) => s.id === input.sessionID && !s.deleted);
  if (!session || session.status !== 'done' || session.detail !== 'full') return [];
  const items = (input.tables.session_items ?? [])
    .filter((i) => !i.deleted && i.session_id === session.id)
    .sort(
      (a, b) => Number(a.position) - Number(b.position) || String(a.id).localeCompare(String(b.id)),
    );
  return items.flatMap((item, slot) => {
    const sets = (input.tables.sets ?? [])
      .filter(
        (s) =>
          !s.deleted &&
          s.session_id === session.id &&
          s.item_id === item.id &&
          s.completed_at != null,
      )
      .sort(
        (a, b) =>
          Number(a.position) - Number(b.position) || String(a.id).localeCompare(String(b.id)),
      );
    const ids = [
      ...new Set([String(item.exercise_id), ...sets.map((s) => String(s.exercise_id))]),
    ].filter((id) => sets.some((s) => s.exercise_id === id));
    return ids.map((id) => {
      const today = sets.filter((s) => s.exercise_id === id).map(numericSet);
      const past = exerciseTimeline(input, id).filter((l) => l.session_id !== session.id);
      const previous = past[0]?.sets ?? [];
      const allPast = past.flatMap((l) => l.sets);
      const timed = definition(input, id)?.measure === 'time';
      const loads = [...new Set(work(today).map((s) => s.load_kg))];
      const max = maximum(today),
        oldMax = maximum(allPast);
      return {
        slot,
        exercise: EXERCISES.find((e) => e.id === id)?.name ?? 'Exercício personalizado',
        today,
        previous,
        days_ago: past[0]
          ? Math.max(0, diffDays(past[0].local_date, String(session.local_date)))
          : null,
        max_load: max,
        max_load_delta: difference(max, maximum(previous)),
        volume: volume(today, timed),
        volume_delta: difference(volume(today, timed), volume(previous, timed)),
        same_load: loads.flatMap((load_kg) => {
          const delta = difference(bestAt(today, load_kg, timed), bestAt(previous, load_kg, timed));
          return delta == null ? [] : [{ load_kg, delta }];
        }),
        load_record: max != null && oldMax != null && max > oldMax,
        reps_records: timed
          ? []
          : loads.flatMap((load_kg) => {
              const before = bestAt(allPast, load_kg),
                reps = bestAt(today, load_kg);
              return before != null && reps != null && reps > before ? [{ load_kg, reps }] : [];
            }),
      };
    });
  });
}
