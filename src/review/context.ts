import { buildMemory } from '../analysis/memory';
import type { LocalRow } from '../analysis/context';
import { EXERCISES } from '../engine/exercises';
import { buildAgentContext, type LiveInput } from '../agent/live';
import { weekRisks } from '../engine/risks';
import type { VolumeGroup } from '../engine/types';
import { FOCUS } from '../analysis/contract';
import { GROUPS, type ReviewContext } from './contract';
import { runningContext } from '../analysis/running';
import { projectDays } from '../engine/weekView';
import { legsBeforeRunAlert } from '../engine/recommend';
import type { DayOverrideRow, ExternalPlanItemRow, RunRow, SessionRow } from '../engine/types';
export interface ReviewInput extends LiveInput {
  analyses?: LocalRow[];
  today: string;
  sessions: SessionRow[];
  runs: RunRow[];
  externalPlans: ExternalPlanItemRow[];
  overrides: DayOverrideRow[];
  deload?: boolean;
}

/** Positive projection. Identifiers, free text and health remain local even with consent. */
export function buildReviewContext(
  input: ReviewInput,
  routineID: string,
  deload: boolean,
): ReviewContext {
  const routine = input.routines.find((r) => r.id === routineID && !r.deleted && !r.archived);
  if (!routine) throw new Error('Ficha indisponível.');
  const ctx = buildAgentContext(input);
  const pairs = new Map<string, number>();
  const items = input.items
    .filter((i) => i.routine_id === routineID && !i.deleted)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const focus = input.params.focus ?? 'equilibrado';
  const volume = GROUPS.filter((g) => ctx.volume[g] != null).map((group) => ({
    group,
    sets: ctx.volume[group]!,
  }));
  const sessions = input.sessions.filter((s) => !s.deleted && s.status === 'done');
  const runs = input.runs.filter((r) => !r.deleted);
  const overrides = input.overrides.filter((o) => !o.deleted);
  return {
    memory: buildMemory({
      routineID,
      date: input.today,
      before: Number.MAX_SAFE_INTEGER,
      items: items as unknown as LocalRow[],
      analyses: input.analyses ?? [],
    }),
    version: 1,
    split: routine.split_key,
    days: input.plan?.gym_per_week ?? input.params.gym_days,
    focus: (Array.isArray(focus) ? focus : [focus]).filter((f) => FOCUS.includes(f)),
    deload,
    running: runningContext(
      {
        runs: input.runs as unknown as Record<string, unknown>[],
        external_plan_items: input.externalPlans as unknown as Record<string, unknown>[],
      },
      input.today,
      14,
    ),
    schedule: input.plan
      ? projectDays(
          {
            plan: input.plan,
            today: input.today,
            sessions,
            runs,
            overrides,
            externalPlans: input.externalPlans,
          },
          input.today,
          15,
        ).map((d, days_ahead) => ({
          days_ahead,
          weekday: d.weekday,
          kind: d.kind,
          split: d.split_key,
          target: d.split_key === routine.split_key,
          legs_before_run:
            !!d.split_key &&
            !!legsBeforeRunAlert(
              { today: d.date, plan: input.plan, overrides, externalPlans: input.externalPlans },
              d.split_key,
            ),
        }))
      : [],
    items: items.map((i, slot) => {
      if (i.superset && !pairs.has(i.superset)) pairs.set(i.superset, pairs.size);
      return {
        slot,
        exercise: EXERCISES.find((e) => e.id === i.exercise_id)?.name ?? 'Exercício personalizado',
        sets: i.sets,
        min: i.target_min,
        max: i.target_max,
        warmup: i.warmup_sets,
        pair: i.superset ? pairs.get(i.superset)! : null,
      };
    }),
    volume,
    // Do not forward risk.text/source: maintenance prose can mention age or health.
    warnings: volume
      .filter(
        (v) =>
          weekRisks(new Map(), new Map<VolumeGroup, number>([[v.group, v.sets]]), input.params)
            .length > 0,
      )
      .map((v) => ({ group: v.group, code: 'acima_teto' })),
  };
}
