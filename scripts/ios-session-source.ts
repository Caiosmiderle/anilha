import 'fake-indexeddb/auto';
import { openDb, ensureLibrary } from '../src/data/db';
import { setCurrent, saveMany } from '../src/data/store';
import {
  defaultProfile,
  startSession,
  completeSet,
  finishSession,
  skipItem,
  substituteExercise,
} from '../src/data/ops';

// This fixture is produced by the PWA's actual writes, not a handwritten payload.
export async function sessionArtifact() {
  const owner = '00000000-0000-4000-8000-000000000031';
  const d = openDb(owner);
  await d.delete();
  await d.open();
  setCurrent({ db: d, userId: owner });
  const realNow = Date.now,
    realUUID = crypto.randomUUID;
  let sequence = 100;
  const base = 1_900_000_000_000;
  Date.now = () => base;
  crypto.randomUUID = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
  try {
    await ensureLibrary(d, owner);
    const catalog = (await d.exercises.toArray()).filter((e) =>
      ['supino-reto-barra', 'remada-baixa', 'prancha'].includes(e.id),
    );
    if (catalog.length !== 3) throw new Error('Fixture exercise IDs changed');
    const routine = {
      id: '00000000-0000-4000-8000-000000000030',
      deleted: false,
      name: 'Ficha sintética iOS',
      split_key: 'peito_triceps' as const,
      position: 0,
      archived: false,
      reason: null,
    };
    const items = ['supino-reto-barra', 'remada-baixa'].map((exercise_id, position) => ({
      id: `fixture-item-${position}`,
      deleted: false,
      routine_id: routine.id,
      position,
      exercise_id,
      sets: 2,
      target_min: 8,
      target_max: 10,
      rest_sec: 90,
      warmup_sets: 0,
      note: null,
      reason: null,
      superset: null,
    }));
    await saveMany([
      {
        table: 'profiles',
        row: { ...defaultProfile(owner, 'Pessoa fictícia'), timezone: 'America/Sao_Paulo' },
      },
      { table: 'routines', row: routine },
      ...items.map((row) => ({ table: 'routine_items' as const, row })),
    ]);
    const initial = {
      profiles: await d.profiles.toArray(),
      routines: await d.routines.toArray(),
      routine_items: await d.routine_items.toArray(),
    };
    const session = await startSession({
      title: routine.name,
      split_key: routine.split_key,
      routine_id: routine.id,
      source: 'routine',
      items,
      today: '2030-03-17',
    });
    const start = {
      sessions: await d.sessions.toArray(),
      session_items: await d.session_items.toArray(),
      sets: await d.sets.toArray(),
    };
    const first = start.session_items.find((i) => i.position === 0)!;
    const firstSets = start.sets
      .filter((s) => s.item_id === first.id)
      .sort((a, b) => a.position - b.position);
    for (const set of firstSets)
      await completeSet(set.id, {
        load_kg: set.kind === 'warmup' ? 10 : 40,
        reps: set.kind === 'warmup' ? 6 : 8,
        seconds: null,
      });
    const second = start.session_items.find((i) => i.position === 1)!;
    await substituteExercise(second.id, 'prancha', null, '2030-03-17');
    await skipItem(second.id, null);
    await finishSession(session);
    const tables = ['sessions', 'session_items', 'sets', 'records'] as const;
    const changes = (
      await Promise.all(
        tables.map(async (table) =>
          (await d.table(table).toArray()).map((row: Record<string, unknown>) => ({ table, row })),
        ),
      )
    ).flat();
    // updated_at is the format contract here. Clock monotonicity and in-flight ACKs have separate cache tests.
    const clean = <T>(value: T): T =>
      JSON.parse(JSON.stringify(value, (key, v) => (key === 'updated_at' ? base : v))) as T;
    return clean({
      owner,
      now: base,
      today: '2030-03-17',
      catalog,
      initial,
      start,
      payload: { changes },
    });
  } finally {
    Date.now = realNow;
    crypto.randomUUID = realUUID;
    setCurrent(null);
    await d.delete();
  }
}
