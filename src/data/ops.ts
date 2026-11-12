/**
 * Every write the app makes. All go through saveMany(), so each change is local
 * first (instant on screen, works offline) and queued for sync.
 */
import type { PlannedItem } from '../engine/adjust';
import { EXERCISES_BY_ID } from '../engine/exercises';
import type { GeneratedPlan } from '../engine/generator';
import { fullName } from '../engine/format';
import { isPlanRoutine } from '../engine/routines';
import { restFor, targetFor } from '../engine/generator';
import { buildExerciseLogs } from '../engine/history';
import { prefillFromSuggestion, suggestNext, type Suggestion } from '../engine/progression';
import { activityOf } from '../engine/cardio';
import { detectRecords, runMilestones, type RunLike } from '../engine/records';
import { returnModeState } from '../engine/returnMode';
import { weekStart } from '../engine/dates';
import { moveInWorkout } from '../engine/workoutOrder';
import { DELOAD, deloadSets } from '../engine/deload';
import { SPLITS } from '../engine/taxonomy';
import {
  WARMUP,
  WARMUP_REST_SEC,
  warmupLoads,
  warmupStyleFor,
  withMandatoryWarmup,
  type WarmupStyle,
} from '../engine/warmup';
import type {
  CardioKind,
  Measure,
  ExerciseRow,
  Joint,
  OnboardingParams,
  OverrideAction,
  ProfileRow,
  RecordRow,
  ReminderSettings,
  RunRow,
  SessionItemRow,
  SessionRow,
  SessionSource,
  SetKind,
  SetRow,
  SplitKey,
} from '../engine/types';
import { db, newId, patch, save, saveMany, uid, type Change, type Writable } from './store';

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  gym_time: '05:30',
  run_eve_time: '21:00',
};

export function defaultProfile(userId: string, name = ''): Writable<ProfileRow> {
  return {
    id: userId,
    deleted: false,
    display_name: name,
    unit: 'kg',
    rest_sec: 90,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    share_adherence: true,
    share_workouts: true,
    share_records: true,
    share_details: false,
    return_mode: 'auto',
    return_started_on: null,
    return_notice_seen: null,
    reminders: DEFAULT_REMINDERS,
    onboarding: null,
  };
}

export async function getProfile(): Promise<ProfileRow | undefined> {
  return db().profiles.get(uid());
}

export async function updateProfile(changes: Partial<ProfileRow>): Promise<void> {
  const current = (await getProfile()) ?? (defaultProfile(uid()) as ProfileRow);
  await save('profiles', { ...current, ...changes, id: uid() });
}

/** Preferences only: the plan, fichas, calendar and workout history are left intact. */
export async function saveTrainingProfile(params: OnboardingParams): Promise<void> {
  const saved = await patch('profiles', uid(), { onboarding: params });
  if (!saved) throw new Error('Seu perfil não foi encontrado. Abra a tela novamente.');
}

async function exerciseMap(): Promise<Map<string, ExerciseRow>> {
  return new Map((await db().exercises.toArray()).map((e) => [e.id, e]));
}

/** Suggestion for the next sets of an exercise, from local history only. */
export async function suggestionFor(
  exerciseId: string,
  target: { sets: number; min: number; max: number },
  today: string,
  excludeSessionId?: string,
): Promise<Suggestion | null> {
  const d = db();
  const exercise = (await d.exercises.get(exerciseId)) ?? EXERCISES_BY_ID.get(exerciseId);
  if (!exercise) return null;
  const sets = (await d.sets.where('exercise_id').equals(exerciseId).toArray()).filter(
    (s) => !s.deleted,
  );
  const sessionIds = [...new Set(sets.map((s) => s.session_id))];
  const sessions = (await d.sessions.bulkGet(sessionIds)).filter((s): s is SessionRow => !!s);
  const items = (await d.session_items.bulkGet([...new Set(sets.map((s) => s.item_id))])).filter(
    (i): i is SessionItemRow => !!i,
  );
  const logs = buildExerciseLogs(exerciseId, sessions, items, sets, { excludeSessionId });
  const profile = await getProfile();
  const allDates = (
    await d.sessions.filter((s) => !s.deleted && s.status === 'done').toArray()
  ).map((s) => s.local_date);
  const ret = returnModeState({
    today,
    trainingDates: allDates,
    setting: profile?.return_mode ?? 'auto',
    manualStartedOn: profile?.return_started_on,
  });
  return suggestNext({
    exercise,
    logs,
    target,
    today,
    returnMode: ret.active,
    unit: profile?.unit ?? 'kg',
  });
}

async function lastWarmups(exerciseId: string, excludeSessionId?: string): Promise<SetRow[]> {
  const d = db();
  const sets = (await d.sets.where('exercise_id').equals(exerciseId).toArray()).filter(
    (s) => !s.deleted && s.completed_at != null && s.session_id !== excludeSessionId,
  );
  const warm = sets.filter((s) => s.kind === 'warmup');
  if (!warm.length) return [];
  const lastSession = warm.reduce((a, b) =>
    (a.completed_at ?? 0) > (b.completed_at ?? 0) ? a : b,
  ).session_id;
  return warm.filter((s) => s.session_id === lastSession).sort((a, b) => a.position - b.position);
}

function blankSet(
  sessionId: string,
  itemId: string,
  exerciseId: string,
  position: number,
  kind: SetKind,
): Writable<SetRow> {
  return {
    id: newId(),
    deleted: false,
    session_id: sessionId,
    item_id: itemId,
    exercise_id: exerciseId,
    position,
    kind,
    load_kg: null,
    reps: null,
    seconds: null,
    rir: null,
    note: null,
    completed_at: null,
  };
}

/** Pending sets for an item, prefilled from the suggestion (or the last session). */
/** Progressive warm-up from intermediate up; simple for beginners and in return mode. */
export async function currentWarmupStyle(today: string): Promise<WarmupStyle> {
  const profile = await getProfile();
  const dates = (
    await db()
      .sessions.filter((s) => !s.deleted && s.status === 'done')
      .toArray()
  ).map((s) => s.local_date);
  const ret = returnModeState({
    today,
    trainingDates: dates,
    setting: profile?.return_mode ?? 'auto',
    manualStartedOn: profile?.return_started_on,
  });
  return warmupStyleFor(profile?.onboarding?.level, ret.active);
}

async function plannedSets(
  sessionId: string,
  itemId: string,
  exerciseId: string,
  plan: { sets: number; target_min: number; target_max: number; warmup_sets: number },
  today: string,
  startPosition = 0,
  warmStyle?: WarmupStyle,
  /** Deload week: 10% less load on every set. */
  deload = false,
  captureRule?: (rule: string) => void,
): Promise<Writable<SetRow>[]> {
  const exercise = (await db().exercises.get(exerciseId)) ?? EXERCISES_BY_ID.get(exerciseId);
  const time = exercise?.measure === 'time';
  const out: Writable<SetRow>[] = [];
  let pos = startPosition;
  const s = await suggestionFor(
    exerciseId,
    { sets: plan.sets, min: plan.target_min, max: plan.target_max },
    today,
    sessionId,
  );
  captureRule?.(s?.kind ?? 'unknown');
  // Warm-up from today's working load: 6 reps at 40% and 80%. Without a known load
  // (first time), last session's warm-up loads, and the rule shows on the card.
  const weighted = exercise?.measure === 'weight_reps';
  const step = exercise?.increment_kg ?? 2.5;
  const lighter = (kg: number | null) =>
    kg == null || !deload
      ? kg
      : Math.round(Math.round((kg * DELOAD.loadFactor) / step) * step * 100) / 100;
  const workLoad = lighter(s ? prefillFromSuggestion(s, 0).load_kg : null);
  const style = plan.warmup_sets > 0 ? (warmStyle ?? (await currentWarmupStyle(today))) : 'simple';
  const loads = weighted
    ? warmupLoads(workLoad, plan.warmup_sets, exercise?.increment_kg ?? 2.5, style)
    : [];
  const warm = plan.warmup_sets > 0 ? await lastWarmups(exerciseId, sessionId) : [];
  for (let i = 0; i < plan.warmup_sets; i += 1) {
    const prev = warm[Math.min(i, warm.length - 1)];
    out.push({
      ...blankSet(sessionId, itemId, exerciseId, pos++, 'warmup'),
      load_kg: loads[i] ?? prev?.load_kg ?? null,
      reps: weighted ? WARMUP[style].reps : (prev?.reps ?? null),
      seconds: prev?.seconds ?? null,
    });
  }
  for (let i = 0; i < plan.sets; i += 1) {
    const pre = s ? prefillFromSuggestion(s, i) : { load_kg: null, value: null };
    out.push({
      ...blankSet(sessionId, itemId, exerciseId, pos++, 'work'),
      load_kg: lighter(pre.load_kg),
      reps: time ? null : pre.value,
      seconds: time ? pre.value : null,
    });
  }
  return out;
}

export interface StartInput {
  title: string;
  split_key: SplitKey | null;
  routine_id: string | null;
  source: SessionSource;
  items: PlannedItem[];
  adjustments?: string[];
  today: string;
}

export async function startSession(input: StartInput): Promise<string> {
  const active = await db()
    .sessions.where('status')
    .equals('active')
    .filter((s) => !s.deleted)
    .first();
  if (active) return active.id;
  const sessionId = newId();
  const now = Date.now();
  const measures = new Map<string, Measure | undefined>();
  for (const it of input.items) {
    const ex = (await db().exercises.get(it.exercise_id)) ?? EXERCISES_BY_ID.get(it.exercise_id);
    measures.set(it.exercise_id, ex?.measure);
  }
  // Every workout opens with a warm-up, whatever the routine says.
  const style = await currentWarmupStyle(input.today);
  // Deload week: same exercises, half the sets, 10% less load; progression skips it.
  const deload = (await getProfile())?.deload_week === weekStart(input.today);
  const items = withMandatoryWarmup(
    deload ? input.items.map((it) => ({ ...it, sets: deloadSets(it.sets) })) : input.items,
    (id) => measures.get(id),
    style,
  );
  const changes: Change[] = [
    {
      table: 'sessions',
      row: {
        id: sessionId,
        deleted: false,
        local_date: input.today,
        started_at: now,
        ended_at: null,
        status: 'active',
        split_key: input.split_key,
        title: input.title,
        routine_id: input.routine_id,
        source: input.source,
        note: null,
        detail: 'full',
        rest_started_at: null,
        rest_duration_sec: null,
        adjustments: deload
          ? [...(input.adjustments ?? []), 'Semana leve: metade das séries e 10% menos carga.']
          : (input.adjustments ?? []),
        deload: deload || null,
      },
    },
  ];
  const analysisRules: { key: string; value: unknown }[] = [];
  for (const [position, it] of items.entries()) {
    const itemId = newId();
    changes.push({
      table: 'session_items',
      row: {
        id: itemId,
        deleted: false,
        session_id: sessionId,
        position,
        exercise_id: it.exercise_id,
        original_exercise_id: null,
        substitution_reason: null,
        status: 'pending',
        skip_reason: null,
        planned_sets: it.sets,
        target_min: it.target_min,
        target_max: it.target_max,
        rest_sec: it.rest_sec,
        warmup_sets: it.warmup_sets,
        note: null,
        pain_joint: null,
        added: false,
        superset: it.superset ?? null,
      },
    });
    const sets = await plannedSets(
      sessionId,
      itemId,
      it.exercise_id,
      it,
      input.today,
      0,
      style,
      deload,
      (rule) => analysisRules.push({ key: `analysis-rule:${itemId}`, value: rule }),
    );
    changes.push(...sets.map((row) => ({ table: 'sets' as const, row })));
  }
  await saveMany(changes, analysisRules);
  return sessionId;
}

/** Repeat what was actually executed in the last session of the same type. */
export async function itemsFromLastSession(split: SplitKey): Promise<PlannedItem[] | null> {
  const d = db();
  const last = (
    await d.sessions
      .filter(
        (s) => !s.deleted && s.status === 'done' && s.split_key === split && s.detail === 'full',
      )
      .toArray()
  ).sort((a, b) => b.started_at - a.started_at)[0];
  if (!last) return null;
  return itemsFromSession(last.id);
}

/** What was done in one session, to do it again: exercises in order, with their sets. */
export async function itemsFromSession(sessionId: string): Promise<PlannedItem[]> {
  const d = db();
  const items = (await d.session_items.where('session_id').equals(sessionId).toArray())
    .filter((i) => !i.deleted && i.status === 'done')
    .sort((a, b) => a.position - b.position);
  const sets = (await d.sets.where('session_id').equals(sessionId).toArray()).filter(
    (s) => !s.deleted && s.completed_at != null,
  );
  return items.map((i) => {
    const work = sets.filter((s) => s.item_id === i.id && s.kind === 'work').length;
    const warm = sets.filter((s) => s.item_id === i.id && s.kind === 'warmup').length;
    return {
      exercise_id: i.exercise_id,
      sets: work || i.planned_sets,
      target_min: i.target_min,
      target_max: i.target_max,
      rest_sec: i.rest_sec,
      warmup_sets: warm,
      superset: i.superset ?? null,
    };
  });
}

export async function routinePlannedItems(routineId: string): Promise<PlannedItem[]> {
  const items = (await db().routine_items.where('routine_id').equals(routineId).toArray())
    .filter((i) => !i.deleted)
    .sort((a, b) => a.position - b.position);
  return items.map((i) => ({
    exercise_id: i.exercise_id,
    sets: i.sets,
    target_min: i.target_min,
    target_max: i.target_max,
    rest_sec: i.rest_sec,
    warmup_sets: i.warmup_sets,
    superset: i.superset ?? null,
  }));
}

export interface SetValues {
  load_kg: number | null;
  reps: number | null;
  seconds: number | null;
  kind?: SetKind;
}

/**
 * The rest that starts after a set: the warm-up's own, else the exercise's, else the
 * profile's. Zero chosen in the exercise means no rest at all: no timer, no chime.
 */
function restAfter(
  kind: SetRow['kind'],
  itemRest: number | undefined,
  profileRest: number | undefined,
  now: number,
): Pick<SessionRow, 'rest_started_at' | 'rest_duration_sec'> {
  const sec = kind === 'warmup' ? WARMUP_REST_SEC : (itemRest ?? profileRest ?? 90);
  return sec > 0
    ? { rest_started_at: now, rest_duration_sec: sec }
    : { rest_started_at: null, rest_duration_sec: null };
}

/** One tap: the set is done, rest starts counting from the wall clock. */
export async function completeSet(
  setId: string,
  values: SetValues,
  /** rest: false in the middle of a bi-set round: straight to the partner exercise. */
  opts: { rest?: boolean } = {},
): Promise<void> {
  const d = db();
  const set = await d.sets.get(setId);
  if (!set) return;
  const item = await d.session_items.get(set.item_id);
  const session = await d.sessions.get(set.session_id);
  const profile = await getProfile();
  const now = Date.now();
  const changes: Change[] = [
    {
      table: 'sets',
      row: {
        ...set,
        ...values,
        kind: values.kind ?? set.kind,
        rir: (values.kind ?? set.kind) === 'warmup' ? null : set.rir,
        completed_at: now,
      },
    },
  ];
  if (item && item.status !== 'done')
    changes.push({ table: 'session_items', row: { ...item, status: 'done' } });
  if (session) {
    changes.push({
      table: 'sessions',
      row: {
        ...session,
        ...(opts.rest === false
          ? { rest_started_at: null, rest_duration_sec: null }
          : restAfter(values.kind ?? set.kind, item?.rest_sec, profile?.rest_sec, now)),
      },
    });
  }
  await saveMany(changes);
}

export async function updateSet(setId: string, changes: Partial<SetRow>): Promise<void> {
  await patch('sets', setId, changes);
  await afterFinishedEdit(setId);
}

/**
 * A set of a finished workout changed: the exercise is done or not done again, and its
 * records are recalculated from all of its history.
 */
async function afterFinishedEdit(setId: string): Promise<void> {
  const d = db();
  const set = await d.sets.get(setId);
  if (!set) return;
  const session = await d.sessions.get(set.session_id);
  if (session?.status !== 'done') return;
  const item = await d.session_items.get(set.item_id);
  if (item && item.status !== 'skipped') {
    const done = (await itemSets(item.id)).some((x) => x.completed_at != null);
    const status = done ? 'done' : 'not_done';
    if (status !== item.status) await patch('session_items', item.id, { status });
  }
  await recomputeRecords([set.exercise_id]);
}

/** Adds a done set to a finished workout, copying the last one; returns its id to edit. */
export async function addDoneSet(itemId: string): Promise<string | null> {
  const d = db();
  const item = await d.session_items.get(itemId);
  if (!item) return null;
  const session = await d.sessions.get(item.session_id);
  const sets = await itemSets(itemId);
  const last = [...sets].reverse().find((x) => x.completed_at != null && x.kind === 'work');
  const row = {
    ...blankSet(
      item.session_id,
      item.id,
      item.exercise_id,
      (sets[sets.length - 1]?.position ?? -1) + 1,
      'work',
    ),
    load_kg: last?.load_kg ?? null,
    reps: last?.reps ?? null,
    seconds: last?.seconds ?? null,
    completed_at: session?.ended_at ?? Date.now(),
  };
  await saveMany([{ table: 'sets', row }]);
  await afterFinishedEdit(row.id);
  return row.id;
}

/**
 * Records of these exercises recalculated from scratch: after an edit, a deleted set or
 * a deleted workout, a later session may become the record, or a record may vanish.
 */
export async function recomputeRecords(exerciseIds: string[]): Promise<void> {
  const d = db();
  const exMap = await exerciseMap();
  const changes: Change[] = [];
  for (const exerciseId of new Set(exerciseIds)) {
    const ex = exMap.get(exerciseId) ?? EXERCISES_BY_ID.get(exerciseId);
    if (!ex) continue;
    const sets = (await d.sets.where('exercise_id').equals(exerciseId).toArray()).filter(
      (x) => !x.deleted,
    );
    const sessions = (await d.sessions.bulkGet([...new Set(sets.map((x) => x.session_id))])).filter(
      (x): x is SessionRow => !!x && !x.deleted && x.status === 'done',
    );
    const items = (await d.session_items.bulkGet([...new Set(sets.map((x) => x.item_id))])).filter(
      (x): x is SessionItemRow => !!x && !x.deleted,
    );
    const byId = new Map(sessions.map((x) => [x.id, x]));
    const logs = buildExerciseLogs(exerciseId, sessions, items, sets);
    const wanted = new Map<string, Writable<RecordRow>>();
    for (const ev of detectRecords(logs, ex)) {
      const id = `${exerciseId}:${ev.kind}:${ev.session_id}`;
      wanted.set(id, {
        id,
        deleted: false,
        exercise_id: exerciseId,
        exercise_name: ex.name,
        kind: ev.kind,
        value: Math.round(ev.value * 100) / 100,
        unit: ev.unit,
        local_date: byId.get(ev.session_id)?.local_date ?? ev.local_date,
        session_id: ev.session_id,
        run_id: null,
      });
    }
    const existing = await d.records
      .filter((r) => r.exercise_id === exerciseId && r.run_id == null)
      .toArray();
    for (const r of existing) {
      const w = wanted.get(r.id);
      if (!w && !r.deleted) changes.push({ table: 'records', row: { ...r, deleted: true } });
      if (w && (r.deleted || r.value !== w.value || r.local_date !== w.local_date))
        changes.push({ table: 'records', row: w });
      wanted.delete(r.id);
    }
    for (const w of wanted.values()) changes.push({ table: 'records', row: w });
  }
  if (changes.length) await saveMany(changes);
}

/** Run milestones recalculated over all runs (after a deleted or edited run). */
/** Distance milestones are for runs only: other cardio has no comparable kilometers. */
async function runsForMilestones(): Promise<RunLike[]> {
  return (
    await db()
      .runs.filter((r) => !r.deleted && activityOf(r) === 'corrida' && r.distance_km != null)
      .toArray()
  ).map((r) => ({
    id: r.id,
    local_date: r.local_date,
    distance_km: r.distance_km as number,
    duration_sec: r.duration_sec,
  }));
}

export async function recomputeRunRecords(): Promise<void> {
  const d = db();
  const runs = await runsForMilestones();
  const wanted = new Map<string, Writable<RecordRow>>();
  for (const m of runMilestones(runs)) {
    const id = `run:${m.kind}:${m.label}:${m.run_id}`;
    wanted.set(id, {
      id,
      deleted: false,
      exercise_id: null,
      exercise_name: m.label,
      kind: m.kind,
      value: Math.round(m.value * 100) / 100,
      unit: 'km',
      local_date: m.local_date,
      session_id: null,
      run_id: m.run_id,
    });
  }
  const changes: Change[] = [];
  for (const r of await d.records.filter((x) => x.run_id != null).toArray()) {
    const w = wanted.get(r.id);
    if (!w && !r.deleted) changes.push({ table: 'records', row: { ...r, deleted: true } });
    if (w && (r.deleted || r.value !== w.value)) changes.push({ table: 'records', row: w });
    wanted.delete(r.id);
  }
  for (const w of wanted.values()) changes.push({ table: 'records', row: w });
  if (changes.length) await saveMany(changes);
}

export async function setEffort(setId: string, rir: number | null): Promise<void> {
  await patch('sets', setId, { rir });
}

export async function toggleKind(setId: string): Promise<void> {
  const set = await db().sets.get(setId);
  if (!set) return;
  const kind: SetKind = set.kind === 'work' ? 'warmup' : 'work';
  await patch('sets', setId, { kind, rir: kind === 'warmup' ? null : set.rir });
}

export async function uncompleteSet(setId: string): Promise<void> {
  await patch('sets', setId, { completed_at: null });
}

async function itemSets(itemId: string): Promise<SetRow[]> {
  return (await db().sets.where('item_id').equals(itemId).toArray())
    .filter((s) => !s.deleted)
    .sort((a, b) => a.position - b.position);
}

export async function addSet(itemId: string): Promise<void> {
  const item = await db().session_items.get(itemId);
  if (!item) return;
  const sets = await itemSets(itemId);
  const last = [...sets].reverse().find((s) => s.kind === 'work') ?? sets[sets.length - 1];
  await saveMany([
    {
      table: 'sets',
      row: {
        ...blankSet(
          item.session_id,
          item.id,
          item.exercise_id,
          (sets[sets.length - 1]?.position ?? -1) + 1,
          'work',
        ),
        load_kg: last?.load_kg ?? null,
        reps: last?.reps ?? null,
        seconds: last?.seconds ?? null,
      },
    },
    { table: 'session_items', row: { ...item, planned_sets: Math.min(12, item.planned_sets + 1) } },
  ]);
}

export async function removePendingSet(itemId: string): Promise<boolean> {
  const item = await db().session_items.get(itemId);
  const pending = (await itemSets(itemId)).filter((s) => s.completed_at == null);
  const last = pending[pending.length - 1];
  if (!item || !last) return false;
  await saveMany([
    { table: 'sets', row: { ...last, deleted: true } },
    { table: 'session_items', row: { ...item, planned_sets: Math.max(0, item.planned_sets - 1) } },
  ]);
  return true;
}

export async function deleteSet(setId: string): Promise<void> {
  await patch('sets', setId, { deleted: true });
  await afterFinishedEdit(setId);
}

/**
 * Swap the exercise. The item keeps the planned one in original_exercise_id, so the
 * history shows what was planned and what was done. Done sets stay with the
 * exercise that was actually executed.
 */
export async function substituteExercise(
  itemId: string,
  newExerciseId: string,
  reason: string | null,
  today: string,
): Promise<void> {
  const d = db();
  const item = await d.session_items.get(itemId);
  if (!item || item.exercise_id === newExerciseId) return;
  const sets = await itemSets(itemId);
  const done = sets.filter((s) => s.completed_at != null);
  const pending = sets.filter((s) => s.completed_at == null);
  const changes: Change[] = pending.map((s) => ({
    table: 'sets' as const,
    row: { ...s, deleted: true },
  }));
  const analysisRules: { key: string; value: unknown }[] = [];
  const ex = (await d.exercises.get(newExerciseId)) ?? EXERCISES_BY_ID.get(newExerciseId);
  const target = ex ? sameUnitTarget(item, ex) : { min: item.target_min, max: item.target_max };
  const remaining = Math.max(
    1,
    pending.filter((s) => s.kind === 'work').length || item.planned_sets,
  );

  if (done.length === 0) {
    const next: Writable<SessionItemRow> = {
      ...item,
      exercise_id: newExerciseId,
      original_exercise_id: item.original_exercise_id ?? item.exercise_id,
      substitution_reason: reason,
      target_min: target.min,
      target_max: target.max,
      warmup_sets: 0,
    };
    changes.push({ table: 'session_items', row: next });
    const sets2 = await plannedSets(
      item.session_id,
      item.id,
      newExerciseId,
      { sets: remaining, target_min: target.min, target_max: target.max, warmup_sets: 0 },
      today,
      0,
      undefined,
      false,
      (rule) => analysisRules.push({ key: `analysis-rule:${item.id}`, value: rule }),
    );
    changes.push(...sets2.map((row) => ({ table: 'sets' as const, row })));
  } else {
    const siblings = (
      await d.session_items.where('session_id').equals(item.session_id).toArray()
    ).filter((i) => !i.deleted && i.position > item.position);
    changes.push({
      table: 'session_items',
      row: { ...item, status: 'done', planned_sets: done.length },
    });
    for (const s of siblings)
      changes.push({ table: 'session_items', row: { ...s, position: s.position + 1 } });
    const newItemId = newId();
    changes.push({
      table: 'session_items',
      row: {
        ...item,
        id: newItemId,
        position: item.position + 1,
        exercise_id: newExerciseId,
        original_exercise_id: item.original_exercise_id ?? item.exercise_id,
        substitution_reason: reason,
        status: 'pending',
        planned_sets: remaining,
        target_min: target.min,
        target_max: target.max,
        warmup_sets: 0,
        pain_joint: null,
        note: null,
        added: false,
      },
    });
    const sets2 = await plannedSets(
      item.session_id,
      newItemId,
      newExerciseId,
      { sets: remaining, target_min: target.min, target_max: target.max, warmup_sets: 0 },
      today,
      0,
      undefined,
      false,
      (rule) => analysisRules.push({ key: `analysis-rule:${newItemId}`, value: rule }),
    );
    changes.push(...sets2.map((row) => ({ table: 'sets' as const, row })));
  }
  await saveMany(changes, analysisRules);
}

function sameUnitTarget(
  item: SessionItemRow,
  ex: ExerciseRow | (typeof EXERCISES_BY_ID extends ReadonlyMap<string, infer V> ? V : never),
) {
  const oldEx = EXERCISES_BY_ID.get(item.exercise_id);
  const oldTime = oldEx?.measure === 'time';
  const newTime = ex.measure === 'time';
  if (oldTime === newTime) return { min: item.target_min, max: item.target_max };
  return targetFor(ex, { level: 'intermediario', returning: false, goal: 'hipertrofia' });
}

/** Equipment busy: the exercise goes to the end, or comes right before the one in progress. */
export async function moveWorkoutItem(itemId: string, where: 'agora' | 'fim'): Promise<void> {
  const item = await db().session_items.get(itemId);
  if (!item) return;
  const items = (await db().session_items.where('session_id').equals(item.session_id).toArray())
    .filter((i) => !i.deleted)
    .sort((a, b) => a.position - b.position);
  const sets = await db().sets.where('session_id').equals(item.session_id).toArray();
  const pending = new Set(
    sets.filter((s) => !s.deleted && s.completed_at == null).map((s) => s.item_id),
  );
  const order = moveInWorkout(
    items.map((i) => ({
      id: i.id,
      superset: i.superset ?? null,
      pending: i.status !== 'skipped' && pending.has(i.id),
    })),
    itemId,
    where,
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  const changes: Change[] = [];
  order.forEach((id, position) => {
    const row = byId.get(id);
    if (row && row.position !== position)
      changes.push({ table: 'session_items', row: { ...row, position } });
  });
  if (changes.length) await saveMany(changes);
}

export async function skipItem(itemId: string, reason: string | null): Promise<void> {
  const item = await db().session_items.get(itemId);
  if (!item) return;
  const pending = (await itemSets(itemId)).filter((s) => s.completed_at == null);
  await saveMany([
    { table: 'session_items', row: { ...item, status: 'skipped', skip_reason: reason } },
    ...pending.map((s) => ({ table: 'sets' as const, row: { ...s, deleted: true } })),
  ]);
}

export async function unskipItem(itemId: string, today: string): Promise<void> {
  const item = await db().session_items.get(itemId);
  if (!item) return;
  const sets = await plannedSets(
    item.session_id,
    item.id,
    item.exercise_id,
    {
      sets: item.planned_sets || 3,
      target_min: item.target_min,
      target_max: item.target_max,
      warmup_sets: 0,
    },
    today,
    (await itemSets(itemId)).length,
  );
  await saveMany([
    { table: 'session_items', row: { ...item, status: 'pending', skip_reason: null } },
    ...sets.map((row) => ({ table: 'sets' as const, row })),
  ]);
}

export async function addExercise(
  sessionId: string,
  exerciseId: string,
  today: string,
): Promise<string> {
  const d = db();
  const items = (await d.session_items.where('session_id').equals(sessionId).toArray()).filter(
    (i) => !i.deleted,
  );
  const ex = (await d.exercises.get(exerciseId)) ?? EXERCISES_BY_ID.get(exerciseId);
  if (!ex) throw new Error('Exercício não existe');
  const profile = await getProfile();
  const t = targetFor(ex, {
    level: profile?.onboarding?.level ?? 'intermediario',
    returning: profile?.onboarding?.returning ?? false,
    goal: profile?.onboarding?.goal ?? 'hipertrofia',
  });
  const itemId = newId();
  const item: Writable<SessionItemRow> = {
    id: itemId,
    deleted: false,
    session_id: sessionId,
    position: items.reduce((m, i) => Math.max(m, i.position), -1) + 1,
    exercise_id: exerciseId,
    original_exercise_id: null,
    substitution_reason: null,
    status: 'pending',
    skip_reason: null,
    planned_sets: 3,
    target_min: t.min,
    target_max: t.max,
    rest_sec: restFor(ex, profile?.onboarding?.goal),
    warmup_sets: 0,
    note: null,
    pain_joint: null,
    added: true,
  };
  const sets = await plannedSets(
    sessionId,
    itemId,
    exerciseId,
    { sets: 3, target_min: t.min, target_max: t.max, warmup_sets: 0 },
    today,
  );
  await saveMany([
    { table: 'session_items', row: item },
    ...sets.map((row) => ({ table: 'sets' as const, row })),
  ]);
  return itemId;
}

export async function markPain(itemId: string, joint: Joint, today: string): Promise<void> {
  const item = await db().session_items.get(itemId);
  if (!item) return;
  await saveMany([
    { table: 'session_items', row: { ...item, pain_joint: joint } },
    {
      table: 'pain_reports',
      row: {
        id: newId(),
        deleted: false,
        local_date: today,
        exercise_id: item.exercise_id,
        session_id: item.session_id,
        joint,
      },
    },
  ]);
}

export async function setItemNote(itemId: string, note: string): Promise<void> {
  await patch('session_items', itemId, { note: note.trim() || null });
}

export async function setSessionNote(sessionId: string, note: string): Promise<void> {
  await patch('sessions', sessionId, { note: note.trim() || null });
}

export async function changeRest(sessionId: string, deltaSec: number | 'skip'): Promise<void> {
  const s = await db().sessions.get(sessionId);
  if (!s || s.rest_started_at == null) return;
  if (deltaSec === 'skip') {
    await patch('sessions', sessionId, { rest_started_at: null, rest_duration_sec: null });
    return;
  }
  await patch('sessions', sessionId, {
    rest_duration_sec: Math.min(900, Math.max(0, (s.rest_duration_sec ?? 90) + deltaSec)),
  });
}

/** Apply sets parsed from quick text: fill pending sets first, then add more. */
export async function applyParsedSets(
  itemId: string,
  parsed: {
    kind: SetKind;
    load_kg: number | null;
    reps: number | null;
    seconds: number | null;
    rir: number | null;
  }[],
): Promise<void> {
  const d = db();
  const item = await d.session_items.get(itemId);
  if (!item) return;
  const sets = await itemSets(itemId);
  const pending = sets.filter(
    (s) => s.completed_at == null && s.kind === (parsed[0]?.kind ?? 'work'),
  );
  let position = (sets[sets.length - 1]?.position ?? -1) + 1;
  const now = Date.now();
  const changes: Change[] = [];
  parsed.forEach((p, i) => {
    const target = pending[i];
    const values = { ...p, completed_at: now + i };
    if (target) changes.push({ table: 'sets', row: { ...target, ...values } });
    else
      changes.push({
        table: 'sets',
        row: {
          ...blankSet(item.session_id, item.id, item.exercise_id, position++, p.kind),
          ...values,
        },
      });
  });
  changes.push({ table: 'session_items', row: { ...item, status: 'done' } });
  const session = await d.sessions.get(item.session_id);
  const profile = await getProfile();
  if (session) {
    changes.push({
      table: 'sessions',
      row: {
        ...session,
        ...restAfter(
          parsed[parsed.length - 1]?.kind ?? 'work',
          item.rest_sec,
          profile?.rest_sec,
          now,
        ),
      },
    });
  }
  await saveMany(changes);
}

export interface FinishResult {
  records: RecordRow[];
  doneSets: number;
}

/**
 * Ends the session, early or not. Done sets stay; untouched items are kept as
 * "não feito" so the history still shows the plan.
 */
export async function finishSession(sessionId: string): Promise<FinishResult> {
  const d = db();
  const session = await d.sessions.get(sessionId);
  if (!session) return { records: [], doneSets: 0 };
  const items = (await d.session_items.where('session_id').equals(sessionId).toArray()).filter(
    (i) => !i.deleted,
  );
  const sets = (await d.sets.where('session_id').equals(sessionId).toArray()).filter(
    (s) => !s.deleted,
  );
  const changes: Change[] = [];
  for (const s of sets)
    if (s.completed_at == null) changes.push({ table: 'sets', row: { ...s, deleted: true } });
  for (const it of items) {
    const done = sets.some((s) => s.item_id === it.id && s.completed_at != null);
    const status = it.status === 'skipped' ? 'skipped' : done ? 'done' : 'not_done';
    if (status !== it.status) changes.push({ table: 'session_items', row: { ...it, status } });
  }
  changes.push({
    table: 'sessions',
    row: {
      ...session,
      status: 'done',
      ended_at: Date.now(),
      rest_started_at: null,
      rest_duration_sec: null,
    },
  });
  await saveMany(changes);
  const records = await recordsForSession(sessionId);
  if (records.length) await saveMany(records.map((row) => ({ table: 'records' as const, row })));
  return {
    records: records as RecordRow[],
    doneSets: sets.filter((s) => s.completed_at != null && s.kind === 'work').length,
  };
}

async function recordsForSession(sessionId: string): Promise<Writable<RecordRow>[]> {
  const d = db();
  const session = await d.sessions.get(sessionId);
  if (!session) return [];
  const exMap = await exerciseMap();
  const mine = (await d.sets.where('session_id').equals(sessionId).toArray()).filter(
    (s) => !s.deleted && s.completed_at != null && s.kind === 'work',
  );
  const out: Writable<RecordRow>[] = [];
  for (const exerciseId of new Set(mine.map((s) => s.exercise_id))) {
    const ex = exMap.get(exerciseId);
    if (!ex) continue;
    const sets = (await d.sets.where('exercise_id').equals(exerciseId).toArray()).filter(
      (s) => !s.deleted,
    );
    const sessions = (await d.sessions.bulkGet([...new Set(sets.map((s) => s.session_id))])).filter(
      (s): s is SessionRow => !!s,
    );
    const items = (await d.session_items.bulkGet([...new Set(sets.map((s) => s.item_id))])).filter(
      (i): i is SessionItemRow => !!i,
    );
    const logs = buildExerciseLogs(exerciseId, sessions, items, sets);
    for (const ev of detectRecords(logs, ex).filter((e) => e.session_id === sessionId)) {
      out.push({
        id: `${exerciseId}:${ev.kind}:${sessionId}`,
        deleted: false,
        exercise_id: exerciseId,
        exercise_name: ex.name,
        kind: ev.kind,
        value: Math.round(ev.value * 100) / 100,
        unit: ev.unit,
        local_date: session.local_date,
        session_id: sessionId,
        run_id: null,
      });
    }
  }
  return out;
}

/** Throw away a session that has nothing done yet. */
export async function discardSession(sessionId: string): Promise<void> {
  const d = db();
  const items = (await d.session_items.where('session_id').equals(sessionId).toArray()).filter(
    (i) => !i.deleted,
  );
  const sets = (await d.sets.where('session_id').equals(sessionId).toArray()).filter(
    (s) => !s.deleted,
  );
  const session = await d.sessions.get(sessionId);
  if (!session) return;
  await saveMany([
    ...sets.map((row) => ({ table: 'sets' as const, row: { ...row, deleted: true } })),
    ...items.map((row) => ({ table: 'session_items' as const, row: { ...row, deleted: true } })),
    { table: 'sessions', row: { ...session, deleted: true } },
  ]);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const exercises = (await db().sets.where('session_id').equals(sessionId).toArray()).map(
    (x) => x.exercise_id,
  );
  await discardSession(sessionId);
  // Its records go, and a later session may become the record instead.
  await recomputeRecords(exercises);
}

export interface RunInput {
  id?: string;
  local_date: string;
  distance_km: number | null;
  /** Null or 'corrida' is a run. */
  activity?: CardioKind | null;
  duration_sec: number;
  run_type: RunRow['run_type'];
  rpe: number | null;
  note: string | null;
  /** From a watch file: the start time, so the same file is recognized. */
  external_id?: string | null;
}

export async function saveRun(input: RunInput): Promise<{ milestones: RecordRow[] }> {
  const id = input.id ?? newId();
  const ownerDb = db();
  const existing = input.id ? await ownerDb.runs.get(input.id) : undefined;
  if (db() !== ownerDb) throw new Error('A conta mudou. Tente novamente.');
  await save('runs', {
    ...existing,
    id,
    deleted: false,
    local_date: input.local_date,
    distance_km: input.distance_km,
    activity: input.activity && input.activity !== 'corrida' ? input.activity : null,
    duration_sec: input.duration_sec,
    run_type: input.run_type,
    rpe: input.rpe,
    note: input.note,
    source: existing?.source ?? (input.external_id ? 'import' : 'manual'),
    external_id: input.external_id ?? null,
    started_at:
      existing?.started_at ??
      (input.external_id && Number.isFinite(Date.parse(input.external_id))
        ? Date.parse(input.external_id)
        : null),
  });
  const runs = await runsForMilestones();
  const events = runMilestones(runs).filter((m) => m.run_id === id);
  const rows: Writable<RecordRow>[] = events.map((m) => ({
    id: `run:${m.kind}:${m.label}:${id}`,
    deleted: false,
    exercise_id: null,
    exercise_name: m.label,
    kind: m.kind,
    value: Math.round(m.value * 100) / 100,
    unit: 'km',
    local_date: m.local_date,
    session_id: null,
    run_id: id,
  }));
  // An edit can change which run holds each record: recalculate them all.
  await recomputeRunRecords();
  return { milestones: rows as RecordRow[] };
}

/** Deletes the run and the distance records it set, on every device. */
export async function deleteRun(id: string): Promise<void> {
  const d = db();
  const run = await d.runs.get(id);
  if (!run) return;
  await saveMany([{ table: 'runs', row: { ...run, deleted: true } }]);
  // Its milestones go, and an older run may hold the distance record again.
  await recomputeRunRecords();
}

export async function setDayOverride(
  day: string,
  action: OverrideAction | null,
  value: string | null = null,
): Promise<void> {
  const id = `day-${day}`;
  const existing = await db().day_overrides.get(id);
  if (!action) {
    if (existing) await patch('day_overrides', id, { deleted: true });
    return;
  }
  await save('day_overrides', { id, deleted: false, local_date: day, action, value });
}

/**
 * Saves a generated plan as the plan in force from today. Old routines are archived,
 * never deleted, so past sessions keep their history.
 */
export async function adoptPlan(
  generated: GeneratedPlan,
  params: OnboardingParams,
  today: string,
): Promise<void> {
  await saveMany(await planChanges(generated, params, today));
}

/**
 * The rows a new plan writes: its fichas, the plan and the profile, with the old plan's
 * fichas archived. Apart from adoptPlan, so the assistant can keep what it replaces.
 */
export async function planChanges(
  generated: GeneratedPlan,
  params: OnboardingParams,
  today: string,
): Promise<Change[]> {
  const d = db();
  // Only the old plan's fichas leave; what the person created, received or added stays.
  const oldRoutines = (
    await d.routines.filter((r) => !r.deleted && !r.archived && isPlanRoutine(r)).toArray()
  ).map((r) => ({
    table: 'routines' as const,
    row: { ...r, origin: 'plano' as const, archived: true },
  }));
  const changes: Change[] = [...oldRoutines];
  changes.push({
    table: 'plans',
    row: {
      id: newId(),
      deleted: false,
      active_from: today,
      gym_per_week: generated.gym_per_week,
      run_per_week: generated.run_per_week,
      // In a rotation the ficha of each day comes from the last one done, not the weekday.
      days: generated.rules.rotation
        ? generated.days.map((d) => (d.kind === 'gym' ? { ...d, split_key: null } : d))
        : generated.days,
      rules: generated.rules,
      params,
      reasons: generated.reasons,
    },
  });
  generated.routines.forEach((r, position) => {
    const routineId = newId();
    changes.push({
      table: 'routines',
      row: {
        id: routineId,
        deleted: false,
        name: r.name,
        split_key: r.split_key,
        position,
        reason: r.reason,
        archived: false,
        origin: 'plano',
      },
    });
    r.items.forEach((it, i) =>
      changes.push({
        table: 'routine_items',
        row: { id: newId(), deleted: false, routine_id: routineId, position: i, note: null, ...it },
      }),
    );
  });
  const profile = (await getProfile()) ?? (defaultProfile(uid()) as ProfileRow);
  changes.push({
    table: 'profiles',
    row: {
      ...profile,
      id: uid(),
      display_name: fullName(params) || profile.display_name,
      onboarding: params,
      return_mode: params.returning
        ? 'on'
        : profile.return_mode === 'on'
          ? 'auto'
          : profile.return_mode,
      return_started_on: params.returning
        ? (profile.return_started_on ?? today)
        : profile.return_started_on,
    },
  });
  return changes;
}

export function splitTitle(split: SplitKey | null): string {
  return split ? SPLITS[split].label : 'Treino livre';
}

export async function saveBodyLog(input: {
  id?: string;
  local_date: string;
  weight_kg: number | null;
  waist_cm: number | null;
}): Promise<void> {
  await save('body_logs', {
    id: input.id ?? newId(),
    deleted: false,
    local_date: input.local_date,
    weight_kg: input.weight_kg,
    waist_cm: input.waist_cm,
    note: null,
  });
}

export async function deleteBodyLog(id: string): Promise<void> {
  await patch('body_logs', id, { deleted: true });
}

/** Accepts the suggested lighter week: from now until Sunday. */
export async function acceptDeload(today: string): Promise<void> {
  await updateProfile({ deload_week: weekStart(today) });
}

export async function dismissDeload(today: string): Promise<void> {
  await updateProfile({ deload_dismissed: today });
}

/** Back to the normal plan before the week ends. */
export async function endDeload(): Promise<void> {
  await updateProfile({ deload_week: null });
}
