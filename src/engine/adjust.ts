import { EXERCISES } from './exercises';
import { joinPt, plural } from './format';
import { exercisesForMinutes, restFor, targetFor } from './generator';
import { findSubstitute } from './substitute';
import { EQUIPMENT_LABEL, GROUP_LABEL, JOINT_LABEL } from './taxonomy';
import type { Equipment, ExerciseDef, Goal, Joint, Level, MuscleGroup } from './types';

export interface PlannedItem {
  exercise_id: string;
  sets: number;
  target_min: number;
  target_max: number;
  rest_sec: number;
  warmup_sets: number;
  /** Bi-set key: items with the same key alternate set by set. */
  superset?: string | null;
}

export type DayAdjustment =
  | { type: 'time'; minutes: number }
  | { type: 'focus'; group: MuscleGroup }
  | { type: 'no_equipment'; equipment: Equipment }
  | { type: 'spare_joint'; joint: Joint };

export type Change =
  | { type: 'removed'; exercise_id: string }
  | { type: 'added'; exercise_id: string }
  | { type: 'replaced'; from: string; to: string };

export interface AdjustResult {
  items: PlannedItem[];
  changes: Change[];
  summary: string;
}

export interface AdjustContext {
  library?: ExerciseDef[];
  available?: Equipment[];
  spareJoints?: Joint[];
  level?: Level;
  returning?: boolean;
  goal?: Goal;
}

function lookup(library: ExerciseDef[]): (id: string) => ExerciseDef | undefined {
  const map = new Map(library.map((e) => [e.id, e]));
  return (id) => map.get(id);
}

function nameOf(get: (id: string) => ExerciseDef | undefined, id: string): string {
  return get(id)?.name ?? id;
}

/** Recomputes today's workout for a one-tap request and says what changed. */
export function adjustWorkout(
  items: PlannedItem[],
  adj: DayAdjustment,
  ctx: AdjustContext = {},
): AdjustResult {
  const library = ctx.library ?? EXERCISES;
  const get = lookup(library);

  if (adj.type === 'time') {
    const n = exercisesForMinutes(adj.minutes);
    if (items.length <= n) {
      return { items, changes: [], summary: `Cabe tudo em ${adj.minutes} min.` };
    }
    const ranked = items
      .map((it, index) => ({ it, index, compound: get(it.exercise_id)?.compound ?? false }))
      .sort((a, b) => Number(b.compound) - Number(a.compound) || a.index - b.index);
    const keep = new Set(ranked.slice(0, n).map((r) => r.index));
    const kept = items.filter((_, i) => keep.has(i));
    const removed = items.filter((_, i) => !keep.has(i));
    return {
      items: kept,
      changes: removed.map((r) => ({ type: 'removed', exercise_id: r.exercise_id })),
      summary: `${adj.minutes} min: ficam os ${n} principais, na mesma ordem. Saem ${joinPt(removed.map((r) => nameOf(get, r.exercise_id).toLowerCase()))}.`,
    };
  }

  if (adj.type === 'focus') {
    const keep = items.filter((it) => get(it.exercise_id)?.primary_group === adj.group);
    const used = new Set(keep.map((k) => k.exercise_id));
    const target = Math.max(items.length, 4);
    const pool = library
      .filter(
        (e) =>
          e.primary_group === adj.group &&
          !used.has(e.id) &&
          (e.equipment === 'peso_corporal' ||
            !ctx.available ||
            ctx.available.includes(e.equipment)) &&
          !(ctx.spareJoints ?? []).some((j) => e.joints.includes(j)),
      )
      .sort((a, b) => Number(b.compound) - Number(a.compound));
    const added: PlannedItem[] = [];
    const patterns = new Set(keep.map((k) => get(k.exercise_id)?.pattern));
    for (const e of pool) {
      if (keep.length + added.length >= target) break;
      if (patterns.has(e.pattern) && pool.some((o) => !patterns.has(o.pattern) && !used.has(o.id)))
        continue;
      patterns.add(e.pattern);
      used.add(e.id);
      const t = targetFor(e, {
        level: ctx.level ?? 'intermediario',
        returning: ctx.returning ?? false,
        goal: ctx.goal ?? 'hipertrofia',
      });
      added.push({
        exercise_id: e.id,
        sets: 3,
        target_min: t.min,
        target_max: t.max,
        rest_sec: restFor(e, ctx.goal),
        warmup_sets: 0,
      });
    }
    const removed = items.filter((it) => !keep.includes(it));
    const result = [...keep, ...added].sort(
      (a, b) =>
        Number(get(b.exercise_id)?.compound ?? false) -
        Number(get(a.exercise_id)?.compound ?? false),
    );
    return {
      items: result,
      changes: [
        ...removed.map((r): Change => ({ type: 'removed', exercise_id: r.exercise_id })),
        ...added.map((a): Change => ({ type: 'added', exercise_id: a.exercise_id })),
      ],
      summary: `Foco em ${GROUP_LABEL[adj.group].toLowerCase()}: ${result.length} ${plural(result.length, 'exercício', 'exercícios')}.`,
    };
  }

  const opts =
    adj.type === 'no_equipment'
      ? {
          without: [adj.equipment],
          available: ctx.available,
          spareJoints: ctx.spareJoints,
          library,
        }
      : { spareJoints: [...(ctx.spareJoints ?? []), adj.joint], available: ctx.available, library };
  const hits = (e: ExerciseDef | undefined) =>
    !!e &&
    (adj.type === 'no_equipment' ? e.equipment === adj.equipment : e.joints.includes(adj.joint));

  const changes: Change[] = [];
  const next: PlannedItem[] = [];
  const taken = new Set(items.map((i) => i.exercise_id));
  for (const it of items) {
    const e = get(it.exercise_id);
    if (!hits(e)) {
      next.push(it);
      continue;
    }
    const sub = findSubstitute(e as ExerciseDef, { ...opts, excludeIds: [...taken] });
    if (sub) {
      taken.add(sub.id);
      next.push({ ...it, exercise_id: sub.id });
      changes.push({ type: 'replaced', from: it.exercise_id, to: sub.id });
    } else {
      changes.push({ type: 'removed', exercise_id: it.exercise_id });
    }
  }
  const what =
    adj.type === 'no_equipment'
      ? `Sem ${EQUIPMENT_LABEL[adj.equipment].toLowerCase()}`
      : `Poupando ${adj.joint === 'lombar' ? 'a lombar' : `o ${JOINT_LABEL[adj.joint]}`}`;
  return {
    items: next,
    changes,
    summary:
      changes.length === 0
        ? `${what}: nada muda.`
        : `${what}: ${changes.length} ${plural(changes.length, 'mudança', 'mudanças')}.`,
  };
}

export function describeChange(change: Change, library: ExerciseDef[] = EXERCISES): string {
  const get = lookup(library);
  switch (change.type) {
    case 'removed':
      return `Sai ${nameOf(get, change.exercise_id)}`;
    case 'added':
      return `Entra ${nameOf(get, change.exercise_id)}`;
    case 'replaced':
      return `${nameOf(get, change.from)} vira ${nameOf(get, change.to)}`;
  }
}
