import { useMemo } from 'react';
import {
  overrideToAdjustment,
  routineFor,
  plannedFromRoutine,
  applyAdjustment,
} from '../engine/dayAdjustment';
export {
  overrideToAdjustment,
  routineFor,
  plannedFromRoutine,
  applyAdjustment,
} from '../engine/dayAdjustment';
import { type AdjustResult, type PlannedItem } from '../engine/adjust';
import { recommendDay, type DayRecommendation } from '../engine/recommend';
import type { DayOverrideRow, RoutineRow } from '../engine/types';
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
