import Dexie, { type EntityTable } from 'dexie';
import type { ExternalPlanItemRow } from '../engine/types';
import { EXERCISES } from '../engine/exercises';
import type {
  BodyLogRow,
  DayOverrideRow,
  ExerciseRow,
  PainRow,
  PlanRow,
  ProfileRow,
  RecordRow,
  RoutineItemRow,
  RoutineRow,
  RunRow,
  SessionItemRow,
  SessionRow,
  SetRow,
} from '../engine/types';

/** Rows waiting to be pushed. One entry per row: the latest local version wins. */
export interface OutboxEntry {
  key: string;
  table: SyncedTable;
  id: string;
  ts: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const SYNCED_TABLES = [
  'external_plan_items',
  'profiles',
  'exercises',
  'plans',
  'routines',
  'routine_items',
  'sessions',
  'session_items',
  'sets',
  'runs',
  'pain_reports',
  'day_overrides',
  'records',
  'body_logs',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export interface RowByTable {
  external_plan_items: ExternalPlanItemRow;
  profiles: ProfileRow;
  exercises: ExerciseRow;
  plans: PlanRow;
  routines: RoutineRow;
  routine_items: RoutineItemRow;
  sessions: SessionRow;
  session_items: SessionItemRow;
  sets: SetRow;
  runs: RunRow;
  pain_reports: PainRow;
  day_overrides: DayOverrideRow;
  records: RecordRow;
  body_logs: BodyLogRow;
}

export type AnilhaDB = Dexie & {
  external_plan_items: EntityTable<ExternalPlanItemRow, 'id'>;
  profiles: EntityTable<ProfileRow, 'id'>;
  exercises: EntityTable<ExerciseRow, 'id'>;
  plans: EntityTable<PlanRow, 'id'>;
  routines: EntityTable<RoutineRow, 'id'>;
  routine_items: EntityTable<RoutineItemRow, 'id'>;
  sessions: EntityTable<SessionRow, 'id'>;
  session_items: EntityTable<SessionItemRow, 'id'>;
  sets: EntityTable<SetRow, 'id'>;
  runs: EntityTable<RunRow, 'id'>;
  pain_reports: EntityTable<PainRow, 'id'>;
  day_overrides: EntityTable<DayOverrideRow, 'id'>;
  records: EntityTable<RecordRow, 'id'>;
  body_logs: EntityTable<BodyLogRow, 'id'>;
  outbox: EntityTable<OutboxEntry, 'key'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

/** One local database per account, so a shared phone never mixes data. */
export function dbName(userId: string): string {
  return `anilha-${userId}`;
}

export function openDb(userId: string): AnilhaDB {
  const db = new Dexie(dbName(userId)) as AnilhaDB;
  db.version(1).stores({
    profiles: 'id',
    exercises: 'id, primary_group',
    plans: 'id, active_from',
    routines: 'id, position',
    routine_items: 'id, routine_id',
    sessions: 'id, local_date, status',
    session_items: 'id, session_id, exercise_id',
    sets: 'id, session_id, item_id, exercise_id',
    runs: 'id, local_date',
    pain_reports: 'id, local_date',
    day_overrides: 'id, local_date',
    records: 'id, local_date',
    outbox: 'key, ts',
    meta: 'key',
  });
  // Version 2: body logs. Pull everything again once: rows of the new table that an
  // older version skipped were already behind the cursor.
  db.version(2)
    .stores({ body_logs: 'id, local_date' })
    .upgrade((tx) => tx.table('meta').delete('cursor'));
  db.version(3)
    .stores({ external_plan_items: 'id, local_date' })
    .upgrade((tx) => tx.table('meta').delete('cursor'));
  return db;
}

/** Built-in exercises live locally; only user changes to them are synced. */
export async function ensureLibrary(db: AnilhaDB, userId: string): Promise<void> {
  const existing = new Set(await db.exercises.toCollection().primaryKeys());
  const missing = EXERCISES.filter((e) => !existing.has(e.id)).map((e): ExerciseRow => ({
    ...e,
    user_id: userId,
    updated_at: 0,
    deleted: false,
    note: null,
    builtin: true,
    archived: false,
  }));
  if (missing.length) await db.exercises.bulkAdd(missing);
}

export async function getMeta<T>(db: AnilhaDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(db: AnilhaDB, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
