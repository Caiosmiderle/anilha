import { useLiveQuery } from 'dexie-react-hooks';
import { useAccount } from '../app/account';
import type { SessionItemRow, SessionRow } from '../engine/types';
import type { LocalRow } from './context';
import { exerciseHint } from './memory';

export function useAnalysisHints(session: SessionRow, items: SessionItemRow[], today: string) {
  const { db } = useAccount();
  return (
    useLiveQuery(async () => {
      const analyses = (await db.meta.toArray())
        .filter((e) => e.key.startsWith('analysis:'))
        .map((e) => e.value as LocalRow);
      const routineItems = await db.routine_items.toArray();
      const input = {
        routineID: session.routine_id,
        date: today,
        before: session.started_at,
        items: items as unknown as LocalRow[],
        analyses,
      };
      return Object.fromEntries(
        items.map((i) => [
          i.id,
          exerciseHint(input, i.exercise_id, routineItems as unknown as LocalRow[]),
        ]),
      );
    }, [db, session.routine_id, session.started_at, items, today]) ?? {}
  );
}
