import { inRange, weekEnd, weekStart } from './dates';
import { volumeGroupOf } from './generator';
import type { ExerciseDef, SetKind, VolumeGroup } from './types';

export interface VolumeSet {
  local_date: string;
  exercise_id: string;
  kind: SetKind;
}

/** Work sets per volume group in the week containing `day`. Warm-ups never count. */
export function weeklyGroupSets(
  day: string,
  sets: VolumeSet[],
  exercises: ReadonlyMap<string, Pick<ExerciseDef, 'muscles' | 'primary_group'>>,
): Map<VolumeGroup, number> {
  const from = weekStart(day);
  const to = weekEnd(day);
  const out = new Map<VolumeGroup, number>();
  for (const s of sets) {
    if (s.kind !== 'work' || !inRange(s.local_date, from, to)) continue;
    const e = exercises.get(s.exercise_id);
    if (!e) continue;
    const g = volumeGroupOf(e);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}
