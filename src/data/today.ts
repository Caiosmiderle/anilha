import { useMemo } from 'react';
import { isPlanRoutine } from '../engine/routines';
import {
  adjustWorkout,
  type AdjustResult,
  type DayAdjustment,
  type PlannedItem,
} from '../engine/adjust';
import { recommendDay, type DayRecommendation } from '../engine/recommend';
import type {
  DayOverrideRow,
  Equipment,
  ExerciseRow,
  Joint,
  MuscleGroup,
  ProfileRow,
  RoutineItemRow,
  RoutineRow,
  SplitKey,
} from '../engine/types';
import {
  useCurrentPlan,
  useExternalPlanItems,
  useExercises,
  useHistorySummaries,
  useOverrides,
  useProfile,
  useRoutineItems,
  useRoutines,
} from './hooks';

export function overrideToAdjustment(o: DayOverrideRow | null | undefined): DayAdjustment | null {
  if (!o || !o.value) return null;
  switch (o.action) {
    case 'time':
      return { type: 'time', minutes: Number(o.value) };
    case 'focus':
      return { type: 'focus', group: o.value as MuscleGroup };
    case 'no_equipment':
      return { type: 'no_equipment', equipment: o.value as Equipment };
    case 'spare_joint':
      return { type: 'spare_joint', joint: o.value as Joint };
    default:
      return null;
  }
}

/** The plan's ficha for that split; a ficha of the person with the same split never takes its place. */
export function routineFor(split: SplitKey | null, routines: RoutineRow[]): RoutineRow | null {
  if (!split) return null;
  const same = routines.filter((r) => r.split_key === split);
  return same.find(isPlanRoutine) ?? same[0] ?? null;
}

export function plannedFromRoutine(
  routine: RoutineRow | null,
  items: RoutineItemRow[],
): PlannedItem[] {
  if (!routine) return [];
  return items
    .filter((i) => i.routine_id === routine.id)
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      exercise_id: i.exercise_id,
      sets: i.sets,
      target_min: i.target_min,
      target_max: i.target_max,
      rest_sec: i.rest_sec,
      warmup_sets: i.warmup_sets,
      superset: i.superset ?? null,
    }));
}

export function applyAdjustment(
  base: PlannedItem[],
  adj: DayAdjustment | null,
  library: ExerciseRow[],
  profile: ProfileRow | null | undefined,
): AdjustResult {
  if (!adj) return { items: base, changes: [], summary: '' };
  return adjustWorkout(base, adj, {
    library,
    available: profile?.onboarding?.equipment,
    spareJoints: profile?.onboarding?.spare_joints,
    level: profile?.onboarding?.level,
    returning: profile?.onboarding?.returning,
    goal: profile?.onboarding?.goal,
  });
}

export interface TodayData {
  loaded: boolean;
  rec: DayRecommendation | null;
  override: DayOverrideRow | null;
  routine: RoutineRow | null;
  items: PlannedItem[];
  adjusted: AdjustResult | null;
  hasPlan: boolean;
}

/** Today's recommendation and the workout it implies, with the day's one-tap adjustment. */
export function useTodayData(today: string): TodayData {
  const { plan, loaded: planLoaded } = useCurrentPlan(today);
  const history = useHistorySummaries();
  const externalPlans = useExternalPlanItems();
  const overrides = useOverrides();
  const routines = useRoutines();
  const routineItems = useRoutineItems();
  const library = useExercises();
  const profile = useProfile();
  return useMemo(() => {
    const loaded = planLoaded && history.loaded && profile !== undefined;
    if (!loaded) {
      return {
        loaded,
        rec: null,
        override: null,
        routine: null,
        items: [],
        adjusted: null,
        hasPlan: false,
      };
    }
    const rec = recommendDay({
      today,
      plan,
      sessions: history.sessions,
      runs: history.runs,
      externalPlans,
      overrides: overrides.map((o) => ({
        local_date: o.local_date,
        action: o.action,
        value: o.value,
      })),
    });
    const override = overrides.find((o) => o.local_date === today) ?? null;
    const routine = routineFor(rec.split_key, routines);
    const base = plannedFromRoutine(routine, routineItems);
    const adj = overrideToAdjustment(override);
    const adjusted = adj ? applyAdjustment(base, adj, library, profile) : null;
    return {
      loaded,
      rec,
      override,
      routine,
      items: adjusted ? adjusted.items : base,
      adjusted,
      hasPlan: plan !== null,
    };
  }, [
    planLoaded,
    history,
    profile,
    today,
    plan,
    overrides,
    routines,
    routineItems,
    library,
    externalPlans,
  ]);
}
