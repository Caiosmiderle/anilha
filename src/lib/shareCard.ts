import { setText } from '../data/display';
import { capitalize, formatLongDay } from '../engine/dates';
import { fmtDuration, fmtLoad, fmtNum, kgToUnit } from '../engine/format';
import type {
  ExerciseRow,
  RecordRow,
  SessionItemRow,
  SessionRow,
  SetRow,
  Unit,
} from '../engine/types';

/**
 * What goes on the image of a finished workout. Names and numbers of the training only:
 * no body data, no pain, no notes.
 */
export interface ShareCardData {
  title: string;
  /** 'Segunda, 19/10' */
  date: string;
  /** '52 min', or null without an end time. */
  duration: string | null;
  workSets: number;
  /** Load times reps of the weighted sets, '4.320 kg'. Null when there is none. */
  volume: string | null;
  /** Done exercises in order, each with its best set. */
  exercises: { name: string; best: string }[];
  /** Done exercises beyond the ones listed. */
  more: number;
  records: string[];
}

/** At most this many exercises fit on the card; the rest becomes "e mais N". */
export const SHARE_MAX_EXERCISES = 6;

type CardSet = Pick<SetRow, 'item_id' | 'kind' | 'load_kg' | 'reps' | 'seconds' | 'completed_at'>;
type CardExercise = Pick<ExerciseRow, 'name' | 'measure' | 'bodyweight'>;

export function shareCardData(input: {
  session: Pick<SessionRow, 'title' | 'local_date' | 'started_at' | 'ended_at'>;
  items: Pick<SessionItemRow, 'id' | 'exercise_id' | 'status' | 'position'>[];
  sets: CardSet[];
  exercises: Map<string, CardExercise>;
  records: Pick<RecordRow, 'exercise_name' | 'kind' | 'value' | 'unit'>[];
  unit: Unit;
}): ShareCardData {
  const { session, items, sets, exercises, records, unit } = input;
  const work = sets.filter((s) => s.kind === 'work' && s.completed_at != null);
  const byItem = new Map<string, CardSet[]>();
  for (const s of work) byItem.set(s.item_id, [...(byItem.get(s.item_id) ?? []), s]);

  let volumeKg = 0;
  const done: { name: string; best: string }[] = [];
  for (const it of [...items].sort((a, b) => a.position - b.position)) {
    const list = byItem.get(it.id) ?? [];
    if (it.status !== 'done' || list.length === 0) continue;
    const ex = exercises.get(it.exercise_id);
    const weighted = ex?.measure === 'weight_reps' && !ex.bodyweight;
    if (weighted) for (const s of list) volumeKg += (s.load_kg ?? 0) * (s.reps ?? 0);
    const best = list.reduce((a, b) => (better(b, a, ex) ? b : a));
    done.push({
      name: ex?.name ?? it.exercise_id,
      best: setText(best, ex as ExerciseRow | undefined, unit),
    });
  }

  const duration =
    session.ended_at != null
      ? fmtDuration(Math.round((session.ended_at - session.started_at) / 1000))
      : null;
  const volume =
    volumeKg > 0 ? `${Math.round(kgToUnit(volumeKg, unit)).toLocaleString('pt-BR')} ${unit}` : null;
  return {
    title: session.title,
    date: capitalize(formatLongDay(session.local_date)),
    duration,
    workSets: work.length,
    volume,
    exercises: done.slice(0, SHARE_MAX_EXERCISES),
    more: Math.max(0, done.length - SHARE_MAX_EXERCISES),
    records: records.map(
      (r) =>
        `${r.exercise_name}: ${r.unit === 'kg' ? fmtLoad(r.value, unit) : `${fmtNum(r.value)} ${r.unit}`}${r.kind === 'e1rm' ? ' de 1RM estimado' : ''}`,
    ),
  };
}

/** The set to show for an exercise: the heaviest, then the most reps or seconds. */
function better(a: CardSet, b: CardSet, ex: CardExercise | undefined): boolean {
  if (ex?.measure === 'time') return (a.seconds ?? 0) > (b.seconds ?? 0);
  const la = a.load_kg ?? 0;
  const lb = b.load_kg ?? 0;
  if (la !== lb) return la > lb;
  return (a.reps ?? 0) > (b.reps ?? 0);
}
