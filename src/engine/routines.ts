import type { RoutineOrigin, RoutineRow } from './types';

/** The generator's reason has always been "N exercícios, M séries de trabalho.". */
const GENERATED = /^\d+ exercícios, \d+ séries de trabalho\.$/;

/**
 * Where a routine came from. Rows written before the origin existed (or by an older app
 * version) are inferred the same way as the database backfill.
 */
export function routineOrigin(r: Pick<RoutineRow, 'id' | 'reason' | 'origin'>): RoutineOrigin {
  if (r.origin) return r.origin;
  if (r.id.startsWith('pronta-') || r.reason === 'Ficha pronta do Anilha') return 'pronta';
  if (r.id.startsWith('recebida-') || r.reason?.startsWith('Enviada ')) return 'recebida';
  if (r.reason && GENERATED.test(r.reason)) return 'plano';
  return 'pessoa';
}

/** The plan's fichas are replaced by a new plan; everything else belongs to the person. */
export function isPlanRoutine(r: Pick<RoutineRow, 'id' | 'reason' | 'origin'>): boolean {
  return routineOrigin(r) === 'plano';
}
