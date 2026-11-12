import { kgToUnit, roundLoad, unitToKg } from '../../engine/format';
import { lastTimeFill, type Suggestion } from '../../engine/progression';
import type { ExerciseRow, Measure, SetRow, Unit } from '../../engine/types';

/** Declining progression restores only unfinished work, keeping each set's original position. */
export function lastTimeUpdates(suggestion: Suggestion, itemSets: SetRow[], measure: Measure) {
  return itemSets
    .filter((set) => set.kind === 'work')
    .flatMap((set, index) => {
      if (set.completed_at != null) return [];
      const last = lastTimeFill(suggestion, index);
      return [
        {
          id: set.id,
          load_kg: last.load_kg,
          reps: measure === 'time' ? null : last.value,
          seconds: measure === 'time' ? last.value : null,
        },
      ];
    });
}

/**
 * What a set starts with: what is already in it, or else the last set done in this exercise
 * today (same kind first). The editor shows it; the focus mode records it with one tap.
 */
export function setStartValues(
  set: SetRow,
  itemSets: SetRow[],
  ex: Pick<ExerciseRow, 'measure' | 'bodyweight'> | undefined,
  unit: Unit,
): { load: number | null; value: number | null; showLoad: boolean } {
  const time = ex?.measure === 'time';
  const bodyweight = !!ex?.bodyweight || ex?.measure === 'reps';
  const done = itemSets.filter((s) => s.completed_at != null);
  const previous =
    [...done].reverse().find((s) => s.kind === set.kind) ?? done[done.length - 1] ?? null;
  const startLoad = set.load_kg ?? previous?.load_kg ?? null;
  const value =
    (time ? set.seconds : set.reps) ?? (time ? previous?.seconds : previous?.reps) ?? null;
  return {
    load: startLoad != null ? roundLoad(kgToUnit(startLoad, unit)) : null,
    value,
    showLoad: !bodyweight || (startLoad ?? 0) > 0,
  };
}

/**
 * What the person is about to record for a pending set, shared by the editor and the focus
 * mode so switching between them never shows (or saves) other values.
 */
export interface SetDraft {
  load: number | null;
  value: number | null;
  showLoad: boolean;
  kind: SetRow['kind'];
}

/** The values to save from what the editor (or the focus mode) shows. */
export function setValuesToSave(
  v: { load: number | null; value: number | null; showLoad: boolean; kind: SetRow['kind'] },
  ex: Pick<ExerciseRow, 'measure'> | undefined,
  unit: Unit,
) {
  const time = ex?.measure === 'time';
  return {
    kind: v.kind,
    load_kg: v.load != null && v.showLoad ? Math.round(unitToKg(v.load, unit) * 100) / 100 : null,
    reps: time ? null : v.value,
    seconds: time ? v.value : null,
  };
}
