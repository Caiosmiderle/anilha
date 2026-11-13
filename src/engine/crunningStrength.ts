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
  sets: Pick<SetRow, 'session_id' | 'exercise_id' | 'kind' | 'completed_at' | 'deleted'>[];
  exercises: Pick<ExerciseDef, 'id' | 'primary_group' | 'secondary_groups' | 'muscles'>[];
  plans: PlanRow[];
  routines: Pick<RoutineRow, 'id' | 'name' | 'split_key' | 'origin'>[];
  routine_items: { routine_id: string; exercise_id: string }[];
  overrides: Pick<DayOverrideRow, 'local_date' | 'action'>[];
  /** CRUNNING's own planned runs, so legs stay off the eve of its important ones. */
  external_plans?: Pick<
    ExternalPlanItemRow,
    'deleted' | 'source' | 'kind' | 'local_date' | 'status' | 'important'
  >[];
}

/** Explicit allowlist: this projection cannot export notes, pain, names or email. */
export function strengthResponse(data: StrengthSnapshot, incremental: boolean) {
  const library = new Map([...EXERCISES, ...data.exercises].map((e) => [e.id, e]));
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
      return {
        data_local: d.date,
        nome: (routine?.name ?? (split ? splitLabel(split) : 'Treino')).slice(0, 60),
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
