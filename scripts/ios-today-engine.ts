// Native JSON adapter. All workout decisions use the same pure functions as the site.
import {
  applyAdjustment,
  overrideToAdjustment,
  plannedFromRoutine,
  routineFor,
} from '../src/engine/dayAdjustment';
import { describeChange } from '../src/engine/adjust';
import { planForDay, recommendDay } from '../src/engine/recommend';
import { summarizeSessions } from '../src/engine/history';
import {
  ALL_EQUIPMENT,
  EQUIPMENT_LABEL,
  GROUP_LABEL,
  JOINTS,
  JOINT_LABEL,
} from '../src/engine/taxonomy';
import type {
  DayOverrideRow,
  ExerciseRow,
  ExternalPlanItemRow,
  PlanRow,
  ProfileRow,
  RoutineItemRow,
  RoutineRow,
  RunRow,
  SessionItemRow,
  SessionRow,
} from '../src/engine/types';

export interface TodayInput {
  today: string;
  health: boolean;
  catalog: ExerciseRow[];
  tables: {
    profiles?: ProfileRow[];
    plans?: PlanRow[];
    routines?: RoutineRow[];
    routine_items?: RoutineItemRow[];
    exercises?: ExerciseRow[];
    sessions?: SessionRow[];
    session_items?: SessionItemRow[];
    runs?: RunRow[];
    day_overrides?: DayOverrideRow[];
    external_plan_items?: ExternalPlanItemRow[];
  };
}
export function evaluateToday(input: TodayInput) {
  const active = <T extends { deleted: boolean }>(rows: T[] = []) => rows.filter((r) => !r.deleted);
  const t = input.tables;
  const library = new Map(input.catalog.map((e) => [e.id, e]));
  for (const e of t.exercises ?? []) {
    if (e.deleted) library.delete(e.id);
    else library.set(e.id, e);
  }
  // Dexie toArray() reads primary keys in order. Stable ties in the engine depend on this.
  const byID = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const exercises = [...library.values()].sort(byID);
  const profile = active(t.profiles)[0];
  const safeProfile =
    profile && !input.health
      ? {
          ...profile,
          onboarding: profile.onboarding && { ...profile.onboarding, spare_joints: [] },
        }
      : profile;
  const overrides = active(t.day_overrides).filter(
    (o) => input.health || o.action !== 'spare_joint',
  );
  const sessions = active(t.sessions).sort(
    (a, b) => b.local_date.localeCompare(a.local_date) || b.started_at - a.started_at || byID(a, b),
  );
  const rec = recommendDay({
    today: input.today,
    plan: planForDay(active(t.plans), input.today),
    sessions: summarizeSessions(sessions, active(t.session_items), library),
    runs: active(t.runs),
    overrides,
    externalPlans: active(t.external_plan_items),
  });
  const routines = active(t.routines)
    .filter((r) => !r.archived)
    .sort((a, b) => a.position - b.position || byID(a, b));
  const routine = routineFor(rec.split_key, routines);
  const base = plannedFromRoutine(routine, active(t.routine_items).sort(byID));
  const override = overrides.find((o) => o.local_date === input.today) ?? null;
  const adjusted = applyAdjustment(base, overrideToAdjustment(override), exercises, safeProfile);
  return {
    rec,
    routine,
    override,
    items: adjusted.items,
    summary: adjusted.summary,
    descriptions: adjusted.changes.map((c) => describeChange(c, exercises)),
  };
}
export function today(input: string): string {
  return JSON.stringify(evaluateToday(JSON.parse(input) as TodayInput));
}
export function dayOptions(): string {
  const choices = (labels: Record<string, string>) =>
    Object.entries(labels).map(([id, name]) => ({ id, name }));
  return JSON.stringify({
    time: ['30', '45', '60'].map((id) => ({ id, name: `${id} min` })),
    focus: choices(GROUP_LABEL),
    no_equipment: ALL_EQUIPMENT.filter((e) => e !== 'peso_corporal').map((id) => ({
      id,
      name: EQUIPMENT_LABEL[id],
    })),
    spare_joint: JOINTS.map((id) => ({
      id,
      name: JOINT_LABEL[id].slice(0, 1).toUpperCase() + JOINT_LABEL[id].slice(1),
    })),
  });
}
