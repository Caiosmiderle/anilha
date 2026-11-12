import { EXERCISES_BY_ID } from '../../engine/exercises';
import type { SharedExercise, SharedItem } from '../../sync/sharing';

export function itemName(exercises: SharedExercise[], id: string): string {
  return EXERCISES_BY_ID.get(id)?.name ?? exercises.find((e) => e.id === id)?.name ?? 'Exercício';
}

function itemLine(exercises: SharedExercise[], i: SharedItem): string {
  const def = EXERCISES_BY_ID.get(i.exercise_id);
  const custom = exercises.find((e) => e.id === i.exercise_id);
  const seconds = (def?.measure ?? custom?.measure) === 'time';
  const range =
    i.target_min === i.target_max ? `${i.target_min}` : `${i.target_min} a ${i.target_max}`;
  const pair = i.superset ? ' · bi-set' : '';
  return `${i.sets} ${i.sets === 1 ? 'série' : 'séries'} de ${range}${seconds ? ' s' : ''}, descanso de ${i.rest_sec} s${pair}`;
}

/** A ficha's exercises, one per line, with sets, range and rest below the name. */
export function RoutineItems({
  items,
  exercises,
}: {
  items: SharedItem[];
  exercises: SharedExercise[];
}) {
  return (
    <ol className="shared-items" data-testid="shared-items">
      {items.map((it, i) => (
        <li key={`${it.exercise_id}-${i}`}>
          <span className="t-strong">{itemName(exercises, it.exercise_id)}</span>
          <span className="t-caption">{itemLine(exercises, it)}</span>
        </li>
      ))}
    </ol>
  );
}
