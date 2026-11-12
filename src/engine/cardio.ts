import { weekStart } from './dates';
import { fmtNum } from './format';
import type { CardioKind, RunType } from './types';

/**
 * Cardio besides running. A run keeps everything it had (types, pace, milestones);
 * the others log time and effort, plus distance where people actually know it (bike,
 * walk, swim, rower). All of them fill the cardio days of the plan.
 *
 * `legs` is how much the activity loads the legs next to a run, for the "no legs the
 * day after a heavy run" rule: an estimate, not a measure. Running is 1, swimming 0.
 */
export interface CardioDef {
  label: string;
  /** Word used in sentences: "Salvar bike", "Apagar este remo?". */
  noun: string;
  fem: boolean;
  /** Unit the distance is typed in, or null when it is not asked. */
  distance: 'km' | 'm' | null;
  pace: 'min_km' | 'kmh' | 'per100m' | 'per500m' | null;
  legs: number;
}

export const CARDIO: Record<CardioKind, CardioDef> = {
  corrida: {
    label: 'Corrida',
    noun: 'corrida',
    fem: true,
    distance: 'km',
    pace: 'min_km',
    legs: 1,
  },
  caminhada: {
    label: 'Caminhada',
    noun: 'caminhada',
    fem: true,
    distance: 'km',
    pace: 'min_km',
    legs: 0.3,
  },
  bike: { label: 'Bike', noun: 'bike', fem: true, distance: 'km', pace: 'kmh', legs: 0.6 },
  eliptico: {
    label: 'Elíptico',
    noun: 'elíptico',
    fem: false,
    distance: null,
    pace: null,
    legs: 0.5,
  },
  natacao: {
    label: 'Natação',
    noun: 'natação',
    fem: true,
    distance: 'm',
    pace: 'per100m',
    legs: 0,
  },
  remo: { label: 'Remo', noun: 'remo', fem: false, distance: 'm', pace: 'per500m', legs: 0.4 },
  escada: { label: 'Escada', noun: 'escada', fem: true, distance: null, pace: null, legs: 0.8 },
  outro: {
    label: 'Outro cardio',
    noun: 'cardio',
    fem: false,
    distance: null,
    pace: null,
    legs: 0.5,
  },
};

export const CARDIO_KINDS = Object.keys(CARDIO) as CardioKind[];

/** Rows written before other cardio existed are runs. */
export function activityOf(r: { activity?: CardioKind | null }): CardioKind {
  return r.activity ?? 'corrida';
}

const RUN_TYPE_NAME: Record<RunType, string> = {
  leve: 'leve',
  longo: 'longa',
  intervalado: 'de qualidade',
};

/** "Corrida leve", "Bike", "Natação". */
export function cardioName(r: { activity?: CardioKind | null; run_type: RunType }): string {
  const kind = activityOf(r);
  return kind === 'corrida' ? `Corrida ${RUN_TYPE_NAME[r.run_type]}` : CARDIO[kind].label;
}

/** Distance as people say it: "5 km", "1.500 m"; null when there is none. */
export function distanceText(r: {
  activity?: CardioKind | null;
  distance_km: number | null;
}): string | null {
  if (r.distance_km == null || r.distance_km <= 0) return null;
  if (CARDIO[activityOf(r)].distance === 'm')
    return `${Math.round(r.distance_km * 1000).toLocaleString('pt-BR')} m`;
  return `${fmtNum(r.distance_km)} km`;
}

function clock(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pace in the unit of each sport: min/km, km/h, per 100 m, per 500 m. */
export function paceText(r: {
  activity?: CardioKind | null;
  distance_km: number | null;
  duration_sec: number;
}): string | null {
  const kind = CARDIO[activityOf(r)].pace;
  const km = r.distance_km;
  if (!kind || km == null || km <= 0 || r.duration_sec <= 0) return null;
  switch (kind) {
    case 'min_km':
      return `${clock(r.duration_sec / km)} /km`;
    case 'kmh':
      return `${fmtNum(Math.round((km / (r.duration_sec / 3600)) * 10) / 10)} km/h`;
    case 'per100m':
      return `${clock(r.duration_sec / (km * 10))} /100 m`;
    case 'per500m':
      return `${clock(r.duration_sec / (km * 2))} /500 m`;
  }
}

/** "Corrida leve de 5 km", "Bike de 20 km", "Elíptico de 30 min". */
export function cardioTitle(r: {
  activity?: CardioKind | null;
  run_type: RunType;
  distance_km: number | null;
  duration_sec: number;
}): string {
  const dist = distanceText(r);
  return `${cardioName(r)} de ${dist ?? `${Math.round(r.duration_sec / 60)} min`}`;
}

/**
 * Leg load: a run counts its kilometers; other cardio counts its minutes as if run at
 * 6 min/km, scaled by how much it uses the legs. Weighted by effort (1 to 10).
 */
export function cardioLegLoad(r: {
  activity?: CardioKind | null;
  distance_km: number | null;
  duration_sec?: number | undefined;
  rpe: number | null;
}): number {
  const kind = activityOf(r);
  const effort = (r.rpe ?? 5) / 10;
  if (kind === 'corrida') return (r.distance_km ?? (r.duration_sec ?? 0) / 360) * effort;
  return ((r.duration_sec ?? 0) / 360) * CARDIO[kind].legs * effort;
}

/**
 * Cardio that counts for the plan: every run, and other cardio only while it fills a
 * cardio day of that week's plan. Past that it is a bonus: not a deviation, and an
 * elliptical before lifting does not close the gym day.
 */
export function countedCardio<R extends { local_date: string; activity?: CardioKind | null }>(
  runs: R[],
  plannedFor: (weekStartDay: string) => number,
): R[] {
  const byWeek = new Map<string, R[]>();
  for (const r of runs) {
    const w = weekStart(r.local_date);
    const list = byWeek.get(w) ?? [];
    list.push(r);
    byWeek.set(w, list);
  }
  const out: R[] = [];
  for (const [w, list] of byWeek) {
    const sorted = [...list].sort((a, b) => a.local_date.localeCompare(b.local_date));
    const running = sorted.filter((r) => activityOf(r) === 'corrida');
    const others = sorted.filter((r) => activityOf(r) !== 'corrida');
    const slots = Math.max(0, plannedFor(w) - running.length);
    out.push(...running, ...others.slice(0, slots));
  }
  return out;
}
