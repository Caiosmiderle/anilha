import { EXERCISES } from '../engine/exercises';
import { diffDays } from '../engine/dates';
import {
  FOCUS,
  RULES,
  type AnalysisContext,
  type AnalysisItem,
  type AnalysisSet,
} from './contract';

export type LocalRow = Record<string, unknown>;
export interface AnalysisInput {
  sessionID: string;
  tables: Record<string, LocalRow[]>;
  /** Local-only first-write snapshots, keyed by set ID and item ID. */
  planned?: Record<string, AnalysisSet>;
  rules?: Record<string, string>;
}
const num = (x: unknown, max: number): number | null =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? x : null;
export function numericSet(s: LocalRow): AnalysisSet {
  const whole = (v: unknown, max: number) => (Number.isInteger(v) ? num(v, max) : null);
  return {
    kind: s.kind === 'warmup' ? 'warmup' : 'work',
    load_kg: num(s.load_kg, 1000),
    reps: whole(s.reps, 500),
    seconds: whole(s.seconds, 7200),
    rir: whole(s.rir, 10),
  };
}
const name = (id: unknown) => EXERCISES.find((e) => e.id === id)?.name ?? 'Exercício personalizado';
const ordered = (rows: LocalRow[]) =>
  [...rows].sort(
    (a, b) =>
      Number(a.position ?? 0) - Number(b.position ?? 0) || String(a.id).localeCompare(String(b.id)),
  );
/** Pure allowlist projection, shared with Swift through generated parity vectors. */
export function buildAnalysisContext(input: AnalysisInput): AnalysisContext {
  const active = (t: string) => (input.tables[t] ?? []).filter((r) => r.deleted !== true);
  const session = active('sessions').find((s) => s.id === input.sessionID);
  if (!session || session.status !== 'done' || session.detail !== 'full')
    throw new Error('Conclua uma sessão detalhada antes de analisar.');
  const date = String(session.local_date);
  const plans = active('plans')
    .filter((p) => String(p.active_from) <= date)
    .sort(
      (a, b) =>
        String(b.active_from).localeCompare(String(a.active_from)) ||
        Number(b.updated_at ?? 0) - Number(a.updated_at ?? 0) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const plan = plans[0];
  const params = plan?.params as LocalRow | null | undefined;
  const rawFocus = params?.focus;
  const focus = (Array.isArray(rawFocus) ? rawFocus : [rawFocus ?? 'equilibrado']).filter(
    (f): f is string => typeof f === 'string' && FOCUS.includes(f),
  );
  const items = (s: LocalRow): AnalysisItem[] =>
    ordered(active('session_items').filter((i) => i.session_id === s.id)).map((i, slot) => {
      const sets = ordered(
        (input.tables.sets ?? []).filter(
          (v) => v.session_id === s.id && v.item_id === i.id && v.exercise_id === i.exercise_id,
        ),
      );
      const rule = input.rules?.[String(i.id)];
      return {
        slot,
        exercise: name(i.exercise_id),
        original: i.original_exercise_id ? name(i.original_exercise_id) : null,
        status: ['done', 'skipped', 'not_done', 'pending'].includes(String(i.status))
          ? (i.status as AnalysisItem['status'])
          : 'not_done',
        planned_sets: Number(i.planned_sets),
        target_min: Number(i.target_min),
        target_max: Number(i.target_max),
        warmup_sets: Number(i.warmup_sets),
        planned: sets.flatMap((v) =>
          input.planned?.[String(v.id)]
            ? [numericSet(input.planned[String(v.id)] as unknown as LocalRow)]
            : [],
        ),
        done: sets.filter((v) => !v.deleted && v.completed_at != null).map(numericSet),
        rule: RULES.includes(rule as AnalysisItem['rule'])
          ? (rule as AnalysisItem['rule'])
          : 'unknown',
      };
    });
  const previous =
    session.routine_id == null
      ? []
      : active('sessions')
          .filter(
            (s) =>
              s.id !== session.id &&
              s.routine_id === session.routine_id &&
              s.status === 'done' &&
              s.detail === 'full' &&
              Number(s.started_at) < Number(session.started_at),
          )
          .sort(
            (a, b) =>
              Number(b.started_at) - Number(a.started_at) ||
              String(a.id).localeCompare(String(b.id)),
          )
          .slice(0, 3)
          .map((s) => ({
            days_ago: Math.max(0, diffDays(String(s.local_date), date)),
            deload: s.deload === true,
            items: items(s),
          }));
  return {
    version: 1,
    week: plan ? Math.floor(diffDays(String(plan.active_from), date) / 7) + 1 : null,
    focus,
    deload: session.deload === true,
    items: items(session),
    previous,
  };
}
