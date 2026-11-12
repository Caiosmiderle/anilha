import { fmtLoad } from '../engine/format';
import type { ExerciseRow, SetRow, Unit } from '../engine/types';

/** '12 kg × 10', '40 s', '15 reps', '+5 kg × 8'. Empty values read as what is missing. */
export function setText(
  set: Pick<SetRow, 'load_kg' | 'reps' | 'seconds'>,
  ex: ExerciseRow | undefined,
  unit: Unit,
): string {
  const load = set.load_kg != null && set.load_kg > 0 ? fmtLoad(set.load_kg, unit) : null;
  if (ex?.measure === 'time') {
    const sec = set.seconds != null ? `${set.seconds} s` : 'segundos';
    return load ? `${load} · ${sec}` : sec;
  }
  const reps = set.reps != null ? String(set.reps) : 'reps';
  if (ex?.bodyweight || ex?.measure === 'reps')
    return load ? `+${load} × ${reps}` : `${reps}${set.reps != null ? ' reps' : ''}`;
  return `${load ?? 'carga'} × ${reps}`;
}

export function measureLabel(e: Pick<ExerciseRow, 'measure' | 'bodyweight'>): string {
  if (e.measure === 'time') return 'tempo';
  if (e.measure === 'reps' || e.bodyweight) return 'repetições';
  return 'carga e repetições';
}
