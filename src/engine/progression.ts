import { diffDays } from './dates';
import { capitalizeFirst, fmtLoad, fmtNum, joinPt, kgToUnit, LB_PER_KG } from './format';
import type { ExerciseDef, Measure, SetKind, Unit } from './types';

/** Completed set, as the engine sees it. */
export interface LoggedSet {
  kind: SetKind;
  load_kg: number | null;
  reps: number | null;
  seconds: number | null;
  rir: number | null;
}

/** All completed sets of one exercise in one session. */
export interface ExerciseLog {
  local_date: string;
  session_id: string;
  target_min: number;
  target_max: number;
  sets: LoggedSet[];
}

export interface Target {
  sets: number;
  min: number;
  max: number;
}

export type SuggestionKind =
  | 'first_time'
  | 'increase'
  | 'progress_variation'
  | 'confirm'
  | 'reps_first'
  | 'hold_effort'
  | 'hold_reps'
  | 'hold_below'
  | 'decrease'
  | 'retrain';

export interface Suggestion {
  kind: SuggestionKind;
  /** Load to use next time (kg). Null when there is no basis or no external load. */
  load_kg: number | null;
  /** Reps (or seconds) to aim for next time. */
  target_min: number;
  target_max: number;
  measure: Measure;
  confidence: 'normal' | 'low';
  missing_effort: boolean;
  /** One sentence: why. */
  reason: string;
  /** One sentence: what to do. */
  goal: string;
  /** Extra line for return mode. */
  rir_hint: string | null;
  based_on: {
    local_date: string;
    load_kg: number | null;
    values: number[];
    /** Load of each work set, in order: a pyramid or back-off sets keep their own. */
    loads: (number | null)[];
    last_rir: number | null;
  } | null;
}

export interface ProgressionInput {
  exercise: Pick<ExerciseDef, 'measure' | 'increment_kg' | 'bodyweight' | 'progression_hint'>;
  logs: ExerciseLog[];
  target: Target;
  today: string;
  returnMode?: boolean;
  unit?: Unit;
}

export const DETRAINING_DAYS = 21;

/**
 * Near failure each repetition is worth about 2.5% of the load: on the bench press, 70% of
 * the maximum gives about 14 repetitions and 80% about 9 (Nuzzo and colleagues, 2024). It
 * says where the reps land after a jump in load.
 */
export const LOAD_PER_REP = 0.025;
/**
 * Past the top in every set by this much raises the load without waiting another session:
 * 2 reps (ACSM, 2009: one to two over the target), or 10 s in a timed exercise.
 */
export const CLEAR_MARGIN = { reps: 2, time: 10 } as const;
/** Most reps asked before a big jump: hypertrophy holds up to about 30 near failure. */
export const MAX_REPS_FIRST = 30;

/**
 * Reps needed in every set before moving to `upKg`, so that after the jump the person still
 * lands on the floor of the range: 2 kg is 5% on a 40 kg bar but 33% on a 6 kg dumbbell.
 */
export function repsBeforeJump(loadKg: number, upKg: number, floor: number): number {
  const lost = Math.ceil((upKg / loadKg - 1) / LOAD_PER_REP - 1e-9);
  return Math.min(MAX_REPS_FIRST, floor + Math.max(0, lost));
}

export function setValue(set: LoggedSet, measure: Measure): number | null {
  return measure === 'time' ? set.seconds : set.reps;
}

export function workSets(log: ExerciseLog, measure: Measure): LoggedSet[] {
  return log.sets.filter((s) => s.kind === 'work' && setValue(s, measure) != null);
}

function suffix(measure: Measure): string {
  return measure === 'time' ? ' s' : '';
}

function unitWord(measure: Measure, n: number): string {
  if (measure === 'time') return 's';
  return n === 1 ? 'repetição' : 'repetições';
}

/** Work sets with different loads (a pyramid, back-off sets), not one load for all. */
function variedLoads(loads: (number | null)[]): boolean {
  return new Set(loads.map((l) => Math.round((l ?? 0) * 100))).size > 1;
}

function maxLoad(sets: LoggedSet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.load_kg != null && s.load_kg > 0 && (best == null || s.load_kg > best)) best = s.load_kg;
  }
  return best;
}

/** Next load up, respecting the minimum increment in the user's unit. */
export function nextLoadUp(loadKg: number, incrementKg: number, unit: Unit = 'kg'): number {
  if (unit === 'kg') return round2(loadKg + incrementKg);
  const incLb = Math.max(2.5, Math.round((incrementKg * LB_PER_KG) / 2.5) * 2.5);
  const currentLb = Math.round(kgToUnit(loadKg, 'lb') * 2) / 2;
  return (currentLb + incLb) / LB_PER_KG;
}

export function nextLoadDown(loadKg: number, incrementKg: number, unit: Unit = 'kg'): number {
  if (unit === 'kg') return round2(Math.max(0, loadKg - incrementKg));
  const incLb = Math.max(2.5, Math.round((incrementKg * LB_PER_KG) / 2.5) * 2.5);
  const currentLb = Math.round(kgToUnit(loadKg, 'lb') * 2) / 2;
  return Math.max(0, currentLb - incLb) / LB_PER_KG;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Evaluation {
  log: ExerciseLog;
  values: number[];
  loads: (number | null)[];
  allTop: boolean;
  anyBelow: boolean;
  lastRir: number | null;
  load: number | null;
  min: number;
  max: number;
}

function evaluate(log: ExerciseLog, measure: Measure): Evaluation | null {
  const sets = workSets(log, measure);
  if (sets.length === 0) return null;
  const values = sets.map((s) => setValue(s, measure) as number);
  const min = log.target_min;
  const max = Math.max(log.target_min, log.target_max);
  return {
    log,
    values,
    loads: sets.map((s) => s.load_kg),
    // Reps above the top of the range count as hitting the top.
    allTop: values.every((v) => v >= max),
    anyBelow: values.some((v) => v < min),
    lastRir: sets[sets.length - 1]?.rir ?? null,
    load: maxLoad(sets),
    min,
    max,
  };
}

/**
 * Double progression on the work sets of the last sessions of this exercise. The top of the
 * range once is not enough: the load goes up after two sessions in a row at the top with the
 * same load, or one with every set 2 reps past it; and only when the next load still lets
 * the person reach the floor of the range. Warm-up sets never count. Pure and deterministic.
 */
export function suggestNext(input: ProgressionInput): Suggestion {
  const { exercise, target, today } = input;
  const unit = input.unit ?? 'kg';
  const measure = exercise.measure;
  const sfx = suffix(measure);
  const rirHint = input.returnMode
    ? 'Modo retorno: pare cada série com 2 a 3 repetições na reserva.'
    : null;

  const evaluated = [...input.logs]
    .sort((a, b) => (a.local_date === b.local_date ? 0 : a.local_date < b.local_date ? -1 : 1))
    .map((log) => evaluate(log, measure))
    .filter((e): e is Evaluation => e !== null);

  const base = {
    measure,
    rir_hint: rirHint,
    target_min: target.min,
    target_max: target.max,
  };

  const last = evaluated[evaluated.length - 1];
  if (!last) {
    return {
      ...base,
      kind: 'first_time',
      load_kg: null,
      confidence: 'normal',
      missing_effort: false,
      reason: 'Primeira vez neste exercício.',
      goal: `Meta: ${target.sets}x ${target.min}-${target.max}${sfx}. Esta sessão vira a base.`,
      based_on: null,
    };
  }

  const loaded = last.load != null;
  const loadText = loaded ? fmtLoad(last.load as number, unit) : '';
  const basedOn = {
    local_date: last.log.local_date,
    load_kg: last.load,
    values: last.values,
    loads: last.loads,
    last_rir: last.lastRir,
  };
  // Only the heaviest set moves when the loads vary: say so instead of one load for all.
  const heaviest = variedLoads(last.loads) ? ' a série mais pesada' : '';
  const hint = exercise.progression_hint;
  const variation = `progrida a variação${hint ? ` (${hint})` : ''} ou adicione carga`;

  // Detraining: no increase after a long gap, even if the top was hit.
  const gap = diffDays(last.log.local_date, today);
  if (gap > DETRAINING_DAYS) {
    const weeks = Math.floor(gap / 7);
    const lower = loaded ? nextLoadDown(last.load as number, exercise.increment_kg, unit) : null;
    const goal = loaded
      ? lower != null && lower > 0
        ? `Repita ${loadText} ou reduza para ${fmtLoad(lower, unit)}. Subir só depois de reencontrar a faixa.`
        : `Repita ${loadText} e reencontre a faixa antes de subir.`
      : `Repita a última meta com folga antes de progredir.`;
    return {
      ...base,
      kind: 'retrain',
      load_kg: last.load,
      confidence: 'normal',
      missing_effort: false,
      reason: `Último registro há ${weeks} semanas.`,
      goal,
      based_on: basedOn,
    };
  }

  const valuesText = joinPt(last.values.map((v) => fmtNum(v)));

  if (last.allTop) {
    const topText = `Bateu ${last.max}${sfx} ou mais em todas as séries`;
    if (last.lastRir != null && last.lastRir <= 1) {
      return {
        ...base,
        kind: 'hold_effort',
        load_kg: last.load,
        confidence: 'normal',
        missing_effort: false,
        reason: `${topText}, mas a última foi no limite.`,
        goal:
          exercise.bodyweight && !loaded
            ? `Repita com mais folga. Depois ${variation}.`
            : `Fique em ${loadText} e repita com mais folga antes de subir.`,
        based_on: basedOn,
      };
    }
    // A big step for this load (light dumbbells): more reps first, or the next load lands
    // below the floor. Bodyweight lifts carry the body too, so the extra load is a small step.
    if (loaded && measure !== 'time' && !exercise.bodyweight) {
      const load = last.load as number;
      const up = nextLoadUp(load, exercise.increment_kg, unit);
      const need = repsBeforeJump(load, up, target.min);
      if (Math.min(...last.values) < need) {
        const pct = Math.round((up / load - 1) * 100);
        return {
          ...base,
          kind: 'reps_first',
          load_kg: last.load,
          confidence: 'normal',
          missing_effort: false,
          reason: `${topText}, mas ${fmtLoad(up, unit)} é ${pct}% a mais e as repetições cairiam abaixo de ${target.min}.`,
          goal: `Fique em ${loadText} e busque ${need} repetições em todas antes de subir.`,
          based_on: basedOn,
        };
      }
    }

    // One good day can be a fluke: the top again with the same load, or a clear margin.
    const prev = evaluated[evaluated.length - 2];
    const again =
      prev != null && prev.allTop && Math.abs((prev.load ?? 0) - (last.load ?? 0)) < 0.01;
    const margin = measure === 'time' ? CLEAR_MARGIN.time : CLEAR_MARGIN.reps;
    const clear = last.values.every((v) => v >= last.max + margin);
    if (!again && !clear) {
      return {
        ...base,
        kind: 'confirm',
        load_kg: last.load,
        confidence: 'normal',
        missing_effort: false,
        reason: `${topText} pela primeira vez${loaded ? ` com ${loadText}` : ''}.`,
        goal: loaded
          ? `Repita ${loadText}: se bater o topo de novo, a carga sobe.`
          : `Repita: se bater o topo de novo, ${variation}.`,
        based_on: basedOn,
      };
    }

    const missing = last.lastRir == null;
    const why = again
      ? `${topText} pela segunda sessão seguida`
      : `Passou de ${last.max}${sfx} com sobra em todas as séries`;
    const reason = missing
      ? `${why}, mas faltou registrar o esforço.`
      : `${why}, com folga na última.`;
    if (!loaded) {
      return {
        ...base,
        kind: 'progress_variation',
        load_kg: null,
        confidence: missing ? 'low' : 'normal',
        missing_effort: missing,
        reason,
        goal: `${capitalizeFirst(variation)}${missing ? ', com cautela' : ''}.`,
        based_on: basedOn,
      };
    }
    const up = nextLoadUp(last.load as number, exercise.increment_kg, unit);
    return {
      ...base,
      kind: 'increase',
      load_kg: up,
      confidence: missing ? 'low' : 'normal',
      missing_effort: missing,
      reason,
      goal: `Suba${heaviest} para ${fmtLoad(up, unit)}${missing ? ' com cautela' : ''} e volte para ${target.min}${measure === 'time' ? ' s' : ` ${unitWord(measure, target.min)}`}.`,
      based_on: basedOn,
    };
  }

  if (last.anyBelow) {
    const prev = evaluated[evaluated.length - 2];
    if (prev?.anyBelow && loaded) {
      const down = nextLoadDown(last.load as number, exercise.increment_kg, unit);
      if (down > 0) {
        return {
          ...base,
          kind: 'decrease',
          load_kg: down,
          confidence: 'normal',
          missing_effort: false,
          reason: `Abaixo do piso de ${last.min}${sfx} em duas sessões seguidas.`,
          goal: `Reduza${heaviest} para ${fmtLoad(down, unit)} e volte para a faixa.`,
          based_on: basedOn,
        };
      }
    }
    return {
      ...base,
      kind: 'hold_below',
      load_kg: last.load,
      confidence: 'normal',
      missing_effort: false,
      reason: `Fez ${valuesText}${sfx}: abaixo do piso de ${last.min}${sfx}.`,
      goal: loaded
        ? `Fique em ${loadText}. Se ficar abaixo de novo, a gente reduz.`
        : `Mantenha a variação e busque ${last.min}${sfx} em todas.`,
      based_on: basedOn,
    };
  }

  return {
    ...base,
    kind: 'hold_reps',
    load_kg: last.load,
    confidence: 'normal',
    missing_effort: false,
    reason: `Fez ${valuesText}${sfx}: dentro da faixa, abaixo do topo.`,
    goal: loaded
      ? `Fique em ${loadText} e some ${measure === 'time' ? 'segundos' : 'repetições'} até ${last.max}${sfx} em todas.`
      : `Some ${measure === 'time' ? 'segundos' : 'repetições'} até ${last.max}${sfx} em todas.`,
    based_on: basedOn,
  };
}

/** Values to prefill the next session's sets with. */
export interface Prefill {
  load_kg: number | null;
  value: number | null;
}

/**
 * Prefill for work sets: the suggestion when there is one, otherwise the last session.
 * Reps go to the bottom of the range after a load increase, else repeat last time. When the
 * loads varied (a pyramid, back-off sets), each set keeps its own and only the heaviest
 * moves: one load for all would turn 40/30/20 kg into 42/42/42.
 */
export function prefillFromSuggestion(s: Suggestion, setIndex: number): Prefill {
  if (!s.based_on) return { load_kg: null, value: null };
  const moved = s.kind === 'increase' || s.kind === 'decrease';
  const last = lastTimeFill(s, setIndex);
  const { load_kg: top, loads } = s.based_on;
  if (variedLoads(loads)) {
    const heaviest = last.load_kg != null && top != null && Math.abs(last.load_kg - top) < 0.01;
    return moved && heaviest ? { load_kg: s.load_kg, value: s.target_min } : last;
  }
  if (moved) return { load_kg: s.load_kg, value: s.target_min };
  return { load_kg: s.load_kg, value: last.value ?? s.target_min };
}

/** What the set had last time, by position: also what turning a suggestion down goes back to. */
export function lastTimeFill(s: Suggestion, setIndex: number): Prefill {
  if (!s.based_on) return { load_kg: null, value: null };
  const { values, loads } = s.based_on;
  const at = Math.min(setIndex, values.length - 1);
  return { load_kg: loads[at] ?? null, value: values[at] ?? null };
}
