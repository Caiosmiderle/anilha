import { weekEnd, weekStart } from '../engine/dates';
import type { SetRow } from '../engine/types';
import type { AnilhaDB } from './db';

/** Weekly volume only needs sets from this week's sessions, including the active one. */
export async function completedSetsInWeek(
  db: AnilhaDB,
  day: string,
  enabled: boolean,
): Promise<SetRow[]> {
  if (!enabled) return [];
  const sessionIds = await db.sessions
    .where('local_date')
    .between(weekStart(day), weekEnd(day), true, true)
    .filter((s) => !s.deleted)
    .primaryKeys();
  if (sessionIds.length === 0) return [];
  return db.sets
    .where('session_id')
    .anyOf(sessionIds)
    .filter((s) => !s.deleted && s.completed_at != null)
    .toArray();
}
