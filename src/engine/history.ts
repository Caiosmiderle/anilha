import type { ExerciseLog } from './progression';
import type { SessionSummary } from './recommend';
import { SPLITS } from './taxonomy';
import type { ExerciseDef, SessionItemRow, SessionRow, SetRow } from './types';

type SessionLike = Pick<
  SessionRow,
  'id' | 'local_date' | 'status' | 'split_key' | 'title' | 'deleted'
> & { deload?: boolean | null };
type ItemLike = Pick<
  SessionItemRow,
  | 'id'
  | 'session_id'
  | 'exercise_id'
  | 'status'
  | 'target_min'
  | 'target_max'
  | 'deleted'
  | 'position'
>;
type SetLike = Pick<
  SetRow,
  | 'item_id'
  | 'session_id'
  | 'exercise_id'
  | 'kind'
  | 'load_kg'
  | 'reps'
  | 'seconds'
  | 'rir'
  | 'completed_at'
  | 'deleted'
  | 'position'
>;

/**
 * Per-session logs of one exercise, from finished sessions only. Sets count for the
 * exercise executed: after a substitution they belong to the replacement.
 */
export function buildExerciseLogs(
  exerciseId: string,
  sessions: SessionLike[],
  items: ItemLike[],
  sets: SetLike[],
  opts: { excludeSessionId?: string; includeDeload?: boolean } = {},
): ExerciseLog[] {
  const sessionById = new Map(sessions.filter((s) => !s.deleted).map((s) => [s.id, s]));
  const itemById = new Map(items.filter((i) => !i.deleted).map((i) => [i.id, i]));
  const bySession = new Map<string, ExerciseLog>();
  const ordered = [...sets].sort(
    (a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0) || a.position - b.position,
  );
  for (const s of ordered) {
    if (s.deleted || s.completed_at == null || s.exercise_id !== exerciseId) continue;
    if (s.session_id === opts.excludeSessionId) continue;
    const session = sessionById.get(s.session_id);
    if (!session || session.status !== 'done') continue;
    // A deload week is lighter on purpose: it says nothing about progress or records.
    if (session.deload && !opts.includeDeload) continue;
    const item = itemById.get(s.item_id);
    let log = bySession.get(s.session_id);
    if (!log) {
      log = {
        local_date: session.local_date,
        session_id: session.id,
        target_min: item?.target_min ?? 0,
        target_max: item?.target_max ?? 0,
        sets: [],
      };
      bySession.set(s.session_id, log);
    }
    log.sets.push({
      kind: s.kind,
      load_kg: s.load_kg,
      reps: s.reps,
      seconds: s.seconds,
      rir: s.rir,
    });
  }
  return [...bySession.values()].sort((a, b) => a.local_date.localeCompare(b.local_date));
}

/** Finished sessions reduced for the recommender. */
export function summarizeSessions(
  sessions: SessionLike[],
  items: ItemLike[],
  exercises: ReadonlyMap<string, Pick<ExerciseDef, 'name' | 'muscles'>>,
): SessionSummary[] {
  const itemsBySession = new Map<string, ItemLike[]>();
  for (const it of items) {
    if (it.deleted || (it.status !== 'done' && it.status !== 'pending')) continue;
    const list = itemsBySession.get(it.session_id) ?? [];
    list.push(it);
    itemsBySession.set(it.session_id, list);
  }
  return sessions
    .filter((s) => !s.deleted && s.status === 'done')
    .map((s) => {
      const done = (itemsBySession.get(s.id) ?? []).filter((i) => i.status === 'done');
      const exs = done
        .map((i) => exercises.get(i.exercise_id))
        .filter((e): e is Pick<ExerciseDef, 'name' | 'muscles'> => !!e)
        .map((e) => ({ name: e.name, muscles: e.muscles }));
      const muscles = [
        ...new Set([
          ...(s.split_key ? SPLITS[s.split_key].muscles : []),
          ...exs.flatMap((e) => e.muscles),
        ]),
      ];
      return {
        id: s.id,
        local_date: s.local_date,
        split_key: s.split_key,
        title: s.title,
        muscles,
        exercises: exs,
      };
    })
    .sort((a, b) => a.local_date.localeCompare(b.local_date));
}
