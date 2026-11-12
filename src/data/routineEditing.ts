import type { RoutineItemRow, RoutineRow } from '../engine/types';
import type { Change } from './store';

/** Manual creation and deletion shared with the native parity fixtures. */
export function blankRoutine(id: string, position: number): Omit<RoutineRow, 'user_id' | 'updated_at'> {
  return {
    id, deleted: false, name: 'Novo treino', split_key: 'livre', position,
    reason: null, archived: false, origin: 'pessoa',
  };
}

export function deleteRoutineChanges(routines: RoutineRow[], items: RoutineItemRow[]): Change[] {
  const ids = new Set(routines.map((r) => r.id));
  return [
    ...routines.map((r) => ({ table: 'routines' as const, row: { ...r, deleted: true } })),
    ...items.filter((i) => ids.has(i.routine_id))
      .map((i) => ({ table: 'routine_items' as const, row: { ...i, deleted: true } })),
  ];
}
