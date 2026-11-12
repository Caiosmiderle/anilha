import type { ExerciseLog } from './progression';
import { workSets } from './progression';
import type { ExerciseDef, RecordKind } from './types';

/** Epley estimate. Only meaningful for loaded sets of up to 12 reps. */
export function estimate1RM(loadKg: number, reps: number): number | null {
  if (!(loadKg > 0) || !(reps >= 1) || reps > 12) return null;
  if (reps === 1) return loadKg;
  return loadKg * (1 + reps / 30);
}

export interface SessionBest {
  local_date: string;
  session_id: string;
  max_load: number | null;
  best_e1rm: number | null;
  max_reps: number | null;
  max_seconds: number | null;
  volume: number;
}

export function sessionBest(log: ExerciseLog, ex: Pick<ExerciseDef, 'measure'>): SessionBest {
  const sets = workSets(log, ex.measure);
  let maxLoad: number | null = null;
  let e1: number | null = null;
  let maxReps: number | null = null;
  let maxSec: number | null = null;
  let volume = 0;
  for (const s of sets) {
    if (s.load_kg != null && s.load_kg > 0 && (s.reps ?? 0) >= 1) {
      if (maxLoad == null || s.load_kg > maxLoad) maxLoad = s.load_kg;
      const est = estimate1RM(s.load_kg, s.reps ?? 0);
      if (est != null && (e1 == null || est > e1)) e1 = est;
      volume += s.load_kg * (s.reps ?? 0);
    }
    if (s.reps != null && (maxReps == null || s.reps > maxReps)) maxReps = s.reps;
    if (s.seconds != null && (maxSec == null || s.seconds > maxSec)) maxSec = s.seconds;
  }
  return {
    local_date: log.local_date,
    session_id: log.session_id,
    max_load: maxLoad,
    best_e1rm: e1,
    max_reps: maxReps,
    max_seconds: maxSec,
    volume,
  };
}

export interface RecordEvent {
  kind: RecordKind;
  value: number;
  previous: number;
  unit: string;
  local_date: string;
  session_id: string;
}

/**
 * New personal records per session, in order. The first session is the baseline,
 * never a record.
 */
export function detectRecords(
  logs: ExerciseLog[],
  ex: Pick<ExerciseDef, 'measure' | 'bodyweight'>,
): RecordEvent[] {
  const ordered = [...logs].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const events: RecordEvent[] = [];
  let bestLoad: number | null = null;
  let bestE1: number | null = null;
  let bestReps: number | null = null;
  let bestSec: number | null = null;
  let seen = 0;
  for (const log of ordered) {
    const b = sessionBest(log, ex);
    if (b.max_load == null && b.max_reps == null && b.max_seconds == null) continue;
    const first = seen === 0;
    seen += 1;
    if (ex.measure === 'time') {
      if (b.max_seconds != null) {
        if (!first && bestSec != null && b.max_seconds > bestSec) {
          events.push({
            kind: 'tempo',
            value: b.max_seconds,
            previous: bestSec,
            unit: 's',
            local_date: b.local_date,
            session_id: b.session_id,
          });
        }
        bestSec = Math.max(bestSec ?? 0, b.max_seconds);
      }
      continue;
    }
    if (b.max_load != null) {
      if (!first && bestLoad != null && b.max_load > bestLoad) {
        events.push({
          kind: 'carga',
          value: b.max_load,
          previous: bestLoad,
          unit: 'kg',
          local_date: b.local_date,
          session_id: b.session_id,
        });
      } else if (!first && bestE1 != null && b.best_e1rm != null && b.best_e1rm > bestE1 + 0.01) {
        events.push({
          kind: 'e1rm',
          value: b.best_e1rm,
          previous: bestE1,
          unit: 'kg',
          local_date: b.local_date,
          session_id: b.session_id,
        });
      }
      bestLoad = Math.max(bestLoad ?? 0, b.max_load);
      if (b.best_e1rm != null) bestE1 = Math.max(bestE1 ?? 0, b.best_e1rm);
    } else if (ex.bodyweight && b.max_reps != null) {
      if (!first && bestReps != null && b.max_reps > bestReps) {
        events.push({
          kind: 'repeticoes',
          value: b.max_reps,
          previous: bestReps,
          unit: 'reps',
          local_date: b.local_date,
          session_id: b.session_id,
        });
      }
      bestReps = Math.max(bestReps ?? 0, b.max_reps);
    }
  }
  return events;
}

export interface RunLike {
  id: string;
  local_date: string;
  distance_km: number;
  duration_sec: number;
}

export interface RunMilestone {
  kind: 'marco' | 'distancia';
  label: string;
  value: number;
  run_id: string;
  local_date: string;
}

const MILESTONES: [number, string][] = [
  [10, 'Primeira vez nos 10 km'],
  [21.0975, 'Primeira meia maratona'],
  [42.195, 'Primeira maratona'],
];

/** Milestones and distance records across runs, in order. */
export function runMilestones(runs: RunLike[]): RunMilestone[] {
  const ordered = [...runs].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const out: RunMilestone[] = [];
  let longest: number | null = null;
  const reached = new Set<number>();
  for (const r of ordered) {
    let milestone = false;
    for (const [km, label] of MILESTONES) {
      // 21,1 km counts as a half marathon: small rounding in what people log.
      if (!reached.has(km) && r.distance_km >= km - 0.05) {
        reached.add(km);
        out.push({
          kind: 'marco',
          label,
          value: r.distance_km,
          run_id: r.id,
          local_date: r.local_date,
        });
        milestone = true;
      }
    }
    if (!milestone && longest != null && r.distance_km > longest) {
      out.push({
        kind: 'distancia',
        label: 'Corrida mais longa',
        value: r.distance_km,
        run_id: r.id,
        local_date: r.local_date,
      });
    }
    longest = Math.max(longest ?? 0, r.distance_km);
  }
  return out;
}
