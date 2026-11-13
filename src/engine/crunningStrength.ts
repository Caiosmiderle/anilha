import { EXERCISES } from './exercises';
import { addDays } from './dates';
import { planForDay } from './recommend';
import { projectDays } from './weekView';
import { splitLabel } from './taxonomy';
import type {
  DayOverrideRow,
  ExerciseDef,
  ExternalPlanItemRow,
  PlanRow,
  RoutineRow,
  SessionRow,
  SetRow,
} from './types';

export interface StrengthSnapshot {
  cursor: string;
  today: string;
  changed: string[];
  sessions: (Pick<
    SessionRow,
    | 'id'
    | 'updated_at'
    | 'deleted'
    | 'local_date'
    | 'started_at'
    | 'ended_at'
    | 'status'
    | 'title'
    | 'split_key'
  > & { partial?: boolean })[];
  sets: (Pick<SetRow, 'session_id' | 'exercise_id' | 'kind' | 'completed_at' | 'deleted'> &
    Partial<Pick<SetRow, 'item_id' | 'position' | 'load_kg' | 'reps' | 'seconds'>>)[];
  /** Order of the exercises in each session. */
  session_items?: { id: string; session_id: string; position: number; deleted: boolean }[];
  exercises: (Pick<ExerciseDef, 'id' | 'primary_group' | 'secondary_groups' | 'muscles'> & {
    name?: string;
  })[];
  plans: PlanRow[];
  routines: Pick<RoutineRow, 'id' | 'name' | 'split_key' | 'origin'>[];
  routine_items: {
    routine_id: string;
    exercise_id: string;
    position?: number;
    sets?: number;
    target_min?: number;
    target_max?: number;
  }[];
  overrides: Pick<DayOverrideRow, 'local_date' | 'action'>[];
  /** CRUNNING's own planned runs, so legs stay off the eve of its important ones. */
  external_plans?: Pick<
    ExternalPlanItemRow,
    'deleted' | 'source' | 'kind' | 'local_date' | 'status' | 'important'
  >[];
}

const MAX_EXERCISES = 30;
const MAX_SETS = 20;
const num = (x: number | null | undefined) =>
  typeof x === 'number' && Number.isFinite(x) ? x : null;

/**
 * Explicit allowlist: this projection cannot export notes, pain, effort, names of people or
 * email. The detail is exercise names, groups, loads, reps and seconds, for CRUNNING's own
 * screen (never for its AI), and a link that opens the session or ficha in the Anilha app.
 */
export function strengthResponse(data: StrengthSnapshot, incremental: boolean) {
  const library = new Map([...EXERCISES, ...data.exercises].map((e) => [e.id, e]));
  const catalogNames = new Map(EXERCISES.map((e) => [e.id, e.name]));
  const exerciseName = (id: string) =>
    (data.exercises.find((e) => e.id === id)?.name ?? catalogNames.get(id) ?? 'Exercício').slice(
      0,
      60,
    );
  const group = (id: string) => library.get(id)?.primary_group ?? null;
  const itemOrder = new Map((data.session_items ?? []).map((i) => [i.id, i.position]));
  const doneDetail = (sessionID: string) => {
    const done = data.sets.filter(
      (x) => x.session_id === sessionID && !x.deleted && x.completed_at != null,
    );
    const byItem = new Map<string, typeof done>();
    for (const x of done) {
      const key = x.item_id ?? x.exercise_id;
      byItem.set(key, [...(byItem.get(key) ?? []), x]);
    }
    const first = (xs: typeof done) => Math.min(...xs.map((x) => x.completed_at ?? 0));
    return [...byItem.entries()]
      .sort(
        ([a, xs], [b, ys]) =>
          (itemOrder.get(a) ?? Infinity) - (itemOrder.get(b) ?? Infinity) || first(xs) - first(ys),
      )
      .slice(0, MAX_EXERCISES)
      .map(([, xs]) => ({
        nome: exerciseName(xs[0]!.exercise_id),
        grupo: group(xs[0]!.exercise_id),
        series: [...xs]
          .sort(
            (a, b) =>
              (a.position ?? 0) - (b.position ?? 0) ||
              (a.completed_at ?? 0) - (b.completed_at ?? 0),
          )
          .slice(0, MAX_SETS)
          .map((x) => ({
            tipo: x.kind === 'warmup' ? 'aquecimento' : 'trabalho',
            carga_kg: num(x.load_kg),
            reps: num(x.reps),
            segundos: num(x.seconds),
          })),
      }));
  };
  const legMuscles = ['quadriceps', 'posterior_coxa', 'gluteos', 'adutores', 'panturrilha'];
  const legs = (id: string) => {
    const e = library.get(id);
    return (
      !!e &&
      (e.primary_group === 'pernas' ||
        e.secondary_groups.includes('pernas') ||
        e.muscles.some((m) => legMuscles.includes(m)))
    );
  };
  const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
  const feitas = data.sessions
    .filter(
      (s) =>
        data.changed.includes(s.id) && (incremental || s.local_date >= addDays(data.today, -13)),
    )
    .map((s) => {
      const sets = data.sets.filter(
        (x) =>
          x.session_id === s.id &&
          !x.deleted &&
          x.kind === 'work' &&
          x.completed_at != null &&
          legs(x.exercise_id),
      );
      return {
        origem_id: s.id,
        atualizado_em: iso(s.updated_at),
        apagado: s.deleted,
        data_local: s.local_date,
        inicio: iso(s.started_at),
        fim: iso(s.ended_at),
        status: s.partial ? 'parcial' : 'concluida',
        pernas: sets.length > 0,
        series_pernas: sets.length,
        esforco: null,
        duracao_s:
          s.ended_at == null ? null : Math.max(0, Math.round((s.ended_at - s.started_at) / 1000)),
        nome: s.title.slice(0, 60),
        link: s.deleted ? null : `anilha://treino/${s.id}`,
        exercicios: s.deleted ? [] : doneDetail(s.id),
      };
    });
  // Reuse the PWA's projection, including rotation, overrides, and leg/run ordering.
  const plan = planForDay(data.plans, data.today);
  const sessions = data.sessions.filter((s) => !s.deleted);
  const days = plan
    ? projectDays(
        {
          plan,
          today: data.today,
          sessions,
          runs: [],
          overrides: data.overrides,
          externalPlans: (data.external_plans ?? []).map((p) => ({ ...p, name: null })),
        },
        data.today,
        14,
      )
    : [];
  const planejadas = days
    .filter(
      (d) =>
        d.kind === 'gym' ||
        (data.overrides.some((o) => o.local_date === d.date && o.action === 'rest') &&
          plan?.days.some((p) => p.weekday === d.weekday && p.kind === 'gym')),
    )
    .map((d) => {
      const plannedSplit = plan?.days.find((p) => p.weekday === d.weekday)?.split_key;
      const split = d.split_key ?? plannedSplit;
      const routine =
        data.routines.find((r) => r.split_key === split && r.origin === 'plano') ??
        data.routines.find((r) => r.split_key === split);
      const items = routine
        ? data.routine_items
            .filter((i) => i.routine_id === routine.id)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .slice(0, MAX_EXERCISES)
        : [];
      return {
        data_local: d.date,
        nome: (routine?.name ?? (split ? splitLabel(split) : 'Treino')).slice(0, 60),
        ficha_id: routine?.id ?? null,
        link: routine ? `anilha://ficha/${routine.id}` : null,
        exercicios: items.map((i) => ({
          nome: exerciseName(i.exercise_id),
          grupo: group(i.exercise_id),
          series: num(i.sets),
          reps_min: num(i.target_min),
          reps_max: num(i.target_max),
        })),
        pernas:
          !!routine &&
          data.routine_items.some((i) => i.routine_id === routine.id && legs(i.exercise_id)),
        status:
          d.state === 'feito'
            ? 'feito'
            : d.kind === 'rest'
              ? 'pulado'
              : split !== plannedSplit && !plan?.rules.rotation
                ? 'movido'
                : 'planejado',
      };
    });
  return { versao: 1, cursor: data.cursor, feitas, planejadas };
}
