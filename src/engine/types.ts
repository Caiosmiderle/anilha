/**
 * Domain types shared by the engine, the local database and the sync layer.
 * Persisted rows use snake_case so the same shape lives in IndexedDB and Postgres.
 * Timestamps are epoch milliseconds; calendar days are local 'YYYY-MM-DD' strings.
 */

export type Joint = 'ombro' | 'cotovelo' | 'joelho' | 'lombar' | 'punho';

/** Display groups: one fixed pastel each (see design/harbor-ui/EXTENSIONS.md). */
export type MuscleGroup = 'costas' | 'peito' | 'pernas' | 'ombros' | 'bracos' | 'core';

export type Muscle =
  | 'costas'
  | 'lombar'
  | 'trapezio'
  | 'peito'
  | 'ombro_anterior'
  | 'ombro_lateral'
  | 'ombro_posterior'
  | 'biceps'
  | 'triceps'
  | 'antebraco'
  | 'quadriceps'
  | 'posterior_coxa'
  | 'gluteos'
  | 'adutores'
  | 'panturrilha'
  | 'abdomen';

/** Finer groups used for weekly volume limits. */
export type VolumeGroup =
  | 'costas'
  | 'peito'
  | 'ombros'
  | 'biceps'
  | 'triceps'
  | 'quadriceps'
  | 'posteriores'
  | 'panturrilha'
  | 'core';

export type Equipment =
  'halteres' | 'barra' | 'polia' | 'maquina' | 'peso_corporal' | 'kettlebell' | 'barra_fixa';

export type Measure = 'weight_reps' | 'reps' | 'time';

export type Pattern =
  | 'puxar_vertical'
  | 'puxar_horizontal'
  | 'pullover'
  | 'empurrar_horizontal'
  | 'empurrar_vertical'
  | 'crucifixo'
  | 'crucifixo_inverso'
  | 'elevacao_lateral'
  | 'elevacao_frontal'
  | 'encolhimento'
  | 'rosca'
  | 'extensao_cotovelo'
  | 'agachamento'
  | 'avanco'
  | 'dobradica'
  | 'extensao_joelho'
  | 'flexao_joelho'
  | 'abducao'
  | 'aducao'
  | 'panturrilha'
  | 'extensao_lombar'
  | 'core_anti_extensao'
  | 'core_lateral'
  | 'core_flexao'
  | 'core_quadril'
  | 'core_rotacao';

export type SetKind = 'warmup' | 'work';
export type RunType = 'leve' | 'longo' | 'intervalado';

/** Cardio logged in the runs table; null (older rows) is a run. */
export type CardioKind =
  'corrida' | 'caminhada' | 'bike' | 'eliptico' | 'natacao' | 'remo' | 'escada' | 'outro';
export type Unit = 'kg' | 'lb';

export type SplitKey =
  | 'costas_biceps'
  | 'peito_triceps'
  | 'perna'
  | 'ombro_abdomen'
  | 'corpo_inteiro_a'
  | 'corpo_inteiro_b'
  | 'superior_a'
  | 'superior_b'
  | 'inferior_a'
  | 'inferior_b'
  | 'empurrar'
  | 'puxar'
  | 'peito'
  | 'costas'
  | 'bracos'
  | 'anterior'
  | 'posterior'
  | 'gluteos'
  | 'posterior_gluteos'
  | 'superiores'
  | 'superiores_b'
  | 'livre';

/**
 * How the gym days are split. Each style is a list of fichas (A, B, C...) done in
 * rotation: today is always the ficha after the last one done.
 */
export type SplitStyle = 'grupos' | 'superior_inferior' | 'corpo_inteiro';

export type Level = 'iniciante' | 'intermediario' | 'avancado';
export type Goal =
  'hipertrofia' | 'emagrecimento' | 'condicionamento' | 'saude' | 'forca' | 'corrida';

/** Columns every synced row carries. */
export interface SyncedRow {
  id: string;
  user_id: string;
  updated_at: number;
  deleted: boolean;
}

export interface ExerciseDef {
  id: string;
  name: string;
  primary_group: MuscleGroup;
  secondary_groups: MuscleGroup[];
  muscles: Muscle[];
  secondary_muscles: Muscle[];
  equipment: Equipment;
  measure: Measure;
  increment_kg: number;
  joints: Joint[];
  compound: boolean;
  bodyweight: boolean;
  pattern: Pattern;
  progression_hint: string | null;
  /**
   * Difficulty: the technique and base strength it asks. Every built-in exercise has one;
   * exercises the person creates do not.
   */
  level?: Level;
}

export interface ExerciseRow extends ExerciseDef, SyncedRow {
  note: string | null;
  builtin: boolean;
  archived: boolean;
}

export interface OnboardingParams {
  first_name: string;
  /** Required from October 2026: how the app and its team address the person. */
  last_name?: string;
  goal: Goal;
  gym_days: number;
  run_days: number;
  force_gym_days: boolean;
  minutes: number;
  equipment: Equipment[];
  level: Level;
  spare_joints: Joint[];
  returning: boolean;
  time: string;
  /** Missing in plans made before the split question: weekday-fixed splits. */
  split_style?: SplitStyle;
  /** Number of fichas for the muscle-group style: 3 (A to C) to 5 (A to E). */
  fichas?: number;
  /** Run days the person picked (0 = segunda); the rest the generator places. */
  run_weekdays?: number[];
  /** Gym days the person picked (0 = segunda); the rest the generator places. */
  gym_weekdays?: number[];
  /**
   * Where the work goes: one or more groups, or the whole body evenly ('equilibrado').
   * Older plans kept a single value. Missing: evenly.
   */
  focus?: TrainingFocus | TrainingFocus[];
  /** Age range, not the birth date: only what the plan needs. Missing: not asked yet. */
  age_range?: AgeRange | null;
  /** Optional. Only a small volume adjustment; it never changes the chosen focus. */
  gender?: Gender | null;
  /** Target race: the long run of each week climbs to it. */
  race?: Race | null;
  /** Recent race or time trial, for the paces of the runs. */
  run_mark?: RunMark | null;
}

export type RaceDistance = 5 | 10 | 21 | 42;

export interface Race {
  distance_km: RaceDistance;
  /** YYYY-MM-DD */
  date: string;
  /** Day the race was set: the cycle of long runs starts in its week. */
  from?: string;
}

/** A recent race or time trial: it sets the paces of each kind of run. */
export interface RunMark {
  distance_km: number;
  seconds: number;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * The whole body evenly, or more of some groups: legs and glutes (anterior, posterior and
 * glutes apart), back and shoulders, chest and arms, abs.
 */
export type TrainingFocus = 'equilibrado' | 'pernas' | 'costas_ombros' | 'peito_bracos' | 'abdomen';

export type AgeRange = '18-29' | '30-39' | '40-49' | '50-59' | '60+';

export type Gender = 'feminino' | 'masculino' | 'outro' | 'nao_informar';

export interface PlanDay {
  /** 0 = segunda ... 6 = domingo */
  weekday: number;
  kind: 'gym' | 'run' | 'rest';
  split_key: SplitKey | null;
  run_type: RunType | null;
  time: string;
}

export interface PlanRules {
  no_legs_before_run: boolean;
  /** Fichas in order (A, B, C...). When set, today is the ficha after the last one done. */
  rotation?: SplitKey[] | null;
}

export interface PlanRow extends SyncedRow {
  active_from: string;
  gym_per_week: number;
  run_per_week: number;
  days: PlanDay[];
  rules: PlanRules;
  params: OnboardingParams | null;
  reasons: string[];
}

/** plano: made by the plan (a new plan replaces it); pessoa: made by the person; pronta: from
 * the Anilha library; recebida: sent by a friend or by the Anilha. */
export type RoutineOrigin = 'plano' | 'pessoa' | 'pronta' | 'recebida';

export interface RoutineRow extends SyncedRow {
  name: string;
  split_key: SplitKey;
  position: number;
  reason: string | null;
  archived: boolean;
  /** Missing on rows from older app versions: routineOrigin() infers it. */
  origin?: RoutineOrigin | null;
}

export interface RoutineItemRow extends SyncedRow {
  routine_id: string;
  position: number;
  exercise_id: string;
  sets: number;
  target_min: number;
  target_max: number;
  rest_sec: number;
  warmup_sets: number;
  note: string | null;
  reason: string | null;
  /** Items with the same key alternate set by set (bi-set). */
  superset?: string | null;
}

export type SessionStatus = 'active' | 'done';
export type SessionSource = 'routine' | 'repeat' | 'blank' | 'import' | 'summary';

export interface SessionRow extends SyncedRow {
  local_date: string;
  started_at: number;
  ended_at: number | null;
  status: SessionStatus;
  split_key: SplitKey | null;
  title: string;
  routine_id: string | null;
  source: SessionSource;
  note: string | null;
  /** 'summary' sessions carry only type and date (imported or sample data). */
  detail: 'full' | 'summary';
  rest_started_at: number | null;
  rest_duration_sec: number | null;
  adjustments: string[];
  /** Done in a deload week: progression and records skip it. */
  deload?: boolean | null;
}

export type ItemStatus = 'pending' | 'done' | 'skipped' | 'not_done';

export interface SessionItemRow extends SyncedRow {
  session_id: string;
  position: number;
  exercise_id: string;
  /** Planned exercise when this one replaced it. */
  original_exercise_id: string | null;
  substitution_reason: string | null;
  status: ItemStatus;
  skip_reason: string | null;
  planned_sets: number;
  target_min: number;
  target_max: number;
  rest_sec: number;
  warmup_sets: number;
  note: string | null;
  pain_joint: Joint | null;
  added: boolean;
  /** Items with the same key alternate set by set (bi-set). */
  superset?: string | null;
}

export interface SetRow extends SyncedRow {
  session_id: string;
  item_id: string;
  exercise_id: string;
  position: number;
  kind: SetKind;
  load_kg: number | null;
  reps: number | null;
  seconds: number | null;
  rir: number | null;
  note: string | null;
  completed_at: number | null;
}

export interface RunRow extends SyncedRow {
  local_date: string;
  /** Null for cardio without distance (elliptical, stairs). A run always has one. */
  distance_km: number | null;
  activity?: CardioKind | null;
  duration_sec: number;
  run_type: RunType;
  rpe: number | null;
  note: string | null;
  source: 'manual' | 'import';
  external_id: string | null;
}

export interface PainRow extends SyncedRow {
  local_date: string;
  exercise_id: string;
  session_id: string | null;
  joint: Joint;
}

export type OverrideAction = 'rest' | 'run' | 'time' | 'focus' | 'no_equipment' | 'spare_joint';

export interface DayOverrideRow extends SyncedRow {
  local_date: string;
  action: OverrideAction;
  value: string | null;
}

export type RecordKind = 'carga' | 'e1rm' | 'repeticoes' | 'tempo' | 'distancia' | 'marco';

export interface RecordRow extends SyncedRow {
  exercise_id: string | null;
  exercise_name: string;
  kind: RecordKind;
  value: number;
  unit: string;
  local_date: string;
  session_id: string | null;
  run_id: string | null;
}

export interface ReminderSettings {
  /** Training reminder, at most one a day. */
  enabled: boolean;
  gym_time: string;
  run_eve_time: string;
  /** Notification when a rest ends. Missing means on. */
  rest?: boolean;
  /** Friends: reactions, invites, someone joining your group. Missing means on. */
  social?: boolean;
  /** Sunday 20:00, the week done against the plan. Missing follows the training reminder. */
  weekly?: boolean;
  /** The reminder was offered once (end of sign-up or Today); not offered again. */
  offered?: boolean;
}

export interface ProfileRow extends SyncedRow {
  display_name: string;
  unit: Unit;
  rest_sec: number;
  timezone: string;
  share_adherence: boolean;
  share_workouts: boolean;
  share_records: boolean;
  share_details: boolean;
  return_mode: 'auto' | 'on' | 'off';
  return_started_on: string | null;
  return_notice_seen: string | null;
  reminders: ReminderSettings;
  onboarding: OnboardingParams | null;
  /** Monday of an accepted deload week. */
  deload_week?: string | null;
  /** Day the deload suggestion was declined: it stays quiet for two weeks. */
  deload_dismissed?: string | null;
}

/** Body weight and waist on a day. Private: never shared with friends. */
export interface BodyLogRow extends SyncedRow {
  local_date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  note: string | null;
}
