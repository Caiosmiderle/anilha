import { withSplit } from '../engine/generator';
import { weeklyVolume } from '../engine/risks';
import { isPlanRoutine } from '../engine/routines';
import type {
  OnboardingParams,
  PlanRow,
  RoutineItemRow,
  RoutineRow,
  VolumeGroup,
} from '../engine/types';
import type { AgentContext, ContextFicha } from './context';

export interface LiveInput {
  params: OnboardingParams;
  plan: PlanRow | null;
  routines: RoutineRow[];
  items: RoutineItemRow[];
  health: boolean;
  returnMode: boolean;
}

/**
 * The person as the agent sees them, from what is on the phone: the profile with its split,
 * the fichas in use and how often each comes in the week. Only the plan's fichas count in
 * the week's volume; the person's own are there to edit, outside that count.
 */
export function buildAgentContext(input: LiveInput): AgentContext {
  const params = withSplit(input.params, !!input.params.split_style);
  const plan = input.plan;
  const rotation = plan?.rules.rotation ?? null;
  const perWeek = (r: RoutineRow): number => {
    if (!plan || !isPlanRoutine(r)) return 0;
    if (rotation?.length) {
      const times = rotation.filter((s) => s === r.split_key).length;
      return (plan.gym_per_week / rotation.length) * times;
    }
    return plan.days.filter((d) => d.kind === 'gym' && d.split_key === r.split_key).length;
  };
  const fichas: ContextFicha[] = input.routines
    .filter((r) => !r.deleted && !r.archived)
    .map((r) => ({
      id: r.id,
      name: r.name,
      per_week: perWeek(r),
      items: input.items
        .filter((i) => i.routine_id === r.id && !i.deleted)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          exercise_id: i.exercise_id,
          sets: i.sets,
          target_min: i.target_min,
          target_max: i.target_max,
          rest_sec: i.rest_sec,
        })),
    }));
  const volume = Object.fromEntries(
    weeklyVolume(fichas.map((f) => ({ items: f.items, per_week: f.per_week ?? 0 }))),
  ) as Partial<Record<VolumeGroup, number>>;
  return { params, fichas, volume, health: input.health, returnMode: input.returnMode };
}
