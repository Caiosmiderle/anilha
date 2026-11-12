import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useExerciseMap, useProfile } from '../../data/hooks';
import { suggestSubstitutes } from '../../engine/substitute';
import { GROUP_LABEL } from '../../engine/taxonomy';
import type { ExerciseRow } from '../../engine/types';
import { useHealthOn } from '../../sync/consent';
import { Icon } from '../../ui/primitives';
import { ExercisePicker } from '../sheets/ExercisePicker';

/**
 * Coherent substitutes for an exercise, at most 6 with one line of why, and the whole muscle
 * group only after "Ver todos de". The same list in the workout and in the ficha.
 */
export function SubstituteList({
  exercise,
  excludeIds,
  emptyText,
  onPick,
}: {
  exercise: ExerciseRow;
  /** Exercises already there (the workout or the ficha); the current one is always out. */
  excludeIds: string[];
  emptyText: string;
  onPick: (e: ExerciseRow) => void;
}) {
  const exMap = useExerciseMap();
  const profile = useProfile();
  const health = useHealthOn();
  const [wholeGroup, setWholeGroup] = useState(false);

  if (wholeGroup)
    return (
      <ExercisePicker
        initialGroup={exercise.primary_group}
        excludeIds={[exercise.id, ...excludeIds]}
        onPick={onPick}
      />
    );

  const suggested = suggestSubstitutes(exercise, {
    library: [...exMap.values()].filter((e) => !e.archived),
    excludeIds,
    available: profile?.onboarding?.equipment,
    level: profile?.onboarding?.level,
    // Joints to spare are health data: only with the consent.
    spareJoints: health ? profile?.onboarding?.spare_joints : undefined,
    limit: 6,
  });
  return (
    <div className="stack">
      {suggested.length ? (
        <div className="hb-list swap-list" aria-label="Substitutos sugeridos">
          {suggested.map(({ exercise: e, reason }) => (
            <button key={e.id} type="button" className="hb-list-row" onClick={() => onPick(e)}>
              <span className="hb-list-main">
                <span className="hb-list-title" style={{ display: 'block' }}>
                  {e.name}
                </span>
                <span className="hb-list-sub">{reason}</span>
              </span>
              <Icon icon={ChevronRight} className="t-muted" />
            </button>
          ))}
        </div>
      ) : (
        <p className="t-regular t-muted" style={{ margin: 0 }}>
          {emptyText}
        </p>
      )}
      <button type="button" className="hb-btn-link swap-all" onClick={() => setWholeGroup(true)}>
        Ver todos de {GROUP_LABEL[exercise.primary_group].toLowerCase()}
      </button>
    </div>
  );
}
