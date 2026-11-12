import { db, saveMany, type Change } from '../data/store';
import { EXERCISES_BY_ID } from '../engine/exercises';
import { DEFAULT_PATTERN } from '../engine/taxonomy';
import type { ExerciseRow, RoutineItemRow } from '../engine/types';
import { rpc } from './client';
import { invalidateRemote, useRemote } from './remote';

/**
 * Sending a ficha: a friend (or the Anilha team, from the panel) suggests one of their
 * routines. Who receives it sees it in the inbox and adds it to their own fichas, where
 * it becomes a routine like any other, or declines. Nothing changes without accepting.
 */
export interface SharedItem {
  exercise_id: string;
  sets: number;
  target_min: number;
  target_max: number;
  rest_sec: number;
  warmup_sets: number;
  note: string | null;
  superset: string | null;
}

/** An exercise the sender created: the one who receives it does not have it yet. */
export type SharedExercise = Pick<ExerciseRow, 'id' | 'name'> &
  Partial<
    Pick<
      ExerciseRow,
      | 'primary_group'
      | 'secondary_groups'
      | 'muscles'
      | 'secondary_muscles'
      | 'equipment'
      | 'measure'
      | 'increment_kg'
      | 'joints'
      | 'compound'
      | 'bodyweight'
      | 'pattern'
      | 'progression_hint'
    >
  >;

export interface SharedRoutine {
  id: string;
  from_team: boolean;
  sender_name: string;
  name: string;
  note: string | null;
  items: SharedItem[];
  exercises: SharedExercise[];
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  mine: boolean;
}

/**
 * A conversa com um amigo: só as fichas que um mandou para o outro, e o que quem recebeu
 * fez com cada uma. Sem texto livre.
 */
export interface ThreadItem {
  id: string;
  mine: boolean;
  name: string;
  note: string | null;
  exercises: number;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  answered_at: string | null;
}

export function useRoutineThread(friendId: string | null) {
  return useRemote<ThreadItem[]>('routine_thread', { p_friend: friendId }, friendId !== null);
}

export function useMyFriends() {
  return useRemote<{ id: string; name: string }[]>('my_friends', {});
}

export function useSharedRoutine(id: string | null) {
  return useRemote<SharedRoutine | null>('shared_routine', { p_id: id }, id !== null);
}

/** What travels: the items in order, and the exercises the sender created. */
export function routinePayload(
  items: RoutineItemRow[],
  exMap: Map<string, ExerciseRow>,
): { items: SharedItem[]; exercises: SharedExercise[] } {
  const ordered = items.filter((i) => !i.deleted).sort((a, b) => a.position - b.position);
  const custom = new Map<string, SharedExercise>();
  for (const it of ordered) {
    const ex = exMap.get(it.exercise_id);
    if (!ex || ex.builtin || EXERCISES_BY_ID.has(ex.id)) continue;
    custom.set(ex.id, {
      id: ex.id,
      name: ex.name,
      primary_group: ex.primary_group,
      secondary_groups: ex.secondary_groups,
      muscles: ex.muscles,
      secondary_muscles: ex.secondary_muscles,
      equipment: ex.equipment,
      measure: ex.measure,
      increment_kg: ex.increment_kg,
      joints: ex.joints,
      compound: ex.compound,
      bodyweight: ex.bodyweight,
      pattern: ex.pattern,
      progression_hint: ex.progression_hint,
    });
  }
  return {
    items: ordered.map((i) => ({
      exercise_id: i.exercise_id,
      sets: i.sets,
      target_min: i.target_min,
      target_max: i.target_max,
      rest_sec: i.rest_sec,
      warmup_sets: i.warmup_sets,
      note: i.note,
      superset: i.superset ?? null,
    })),
    exercises: [...custom.values()],
  };
}

type SendResult = { id?: string; error?: string };

export async function sendRoutine(
  to: string,
  name: string,
  note: string,
  payload: ReturnType<typeof routinePayload>,
): Promise<SendResult> {
  const r = await rpc<SendResult>('send_routine', {
    p_to: to,
    p_name: name,
    p_note: note,
    p_items: payload.items,
    p_exercises: payload.exercises,
  });
  invalidateRemote('routine_thread');
  return r;
}

/** The panel: the team sends to anyone, signed "Anilha". */
export async function adminSendRoutine(
  to: string,
  name: string,
  note: string,
  payload: ReturnType<typeof routinePayload>,
): Promise<SendResult> {
  return rpc<SendResult>('admin_send_routine', {
    p_to: to,
    p_name: name,
    p_note: note,
    p_items: payload.items,
    p_exercises: payload.exercises,
  });
}

/** Ids made from the sent ficha: adding the same ficha twice writes the same rows. */
export function receivedRoutineId(sharedId: string): string {
  return `recebida-${sharedId}`;
}

function exerciseRow(ex: SharedExercise): Omit<ExerciseRow, 'user_id' | 'updated_at'> {
  const group = ex.primary_group ?? 'core';
  return {
    id: ex.id,
    deleted: false,
    name: ex.name,
    primary_group: group,
    secondary_groups: ex.secondary_groups ?? [],
    muscles: ex.muscles ?? [],
    secondary_muscles: ex.secondary_muscles ?? [],
    equipment: ex.equipment ?? 'peso_corporal',
    measure: ex.measure ?? 'weight_reps',
    increment_kg: ex.increment_kg ?? 2.5,
    joints: ex.joints ?? [],
    compound: ex.compound ?? false,
    bodyweight: ex.bodyweight ?? false,
    pattern: ex.pattern ?? DEFAULT_PATTERN[group],
    progression_hint: ex.progression_hint ?? null,
    note: null,
    builtin: false,
    archived: false,
  };
}

/**
 * Copies a ficha into this person's routines (and the exercises they lack). The ids come
 * from the source, so copying the same ficha again writes the same rows.
 */
export async function saveCopiedRoutine(input: {
  routineId: string;
  name: string;
  reason: string;
  origin: 'pronta' | 'recebida';
  items: SharedItem[];
  exercises: SharedExercise[];
}): Promise<void> {
  const d = db();
  const { routineId } = input;
  const have = new Set(await d.exercises.toCollection().primaryKeys());
  const existing = await d.routines.get(routineId);
  const position =
    existing?.position ?? (await d.routines.filter((r) => !r.deleted && !r.archived).count());
  const changes: Change[] = [];
  for (const ex of input.exercises) {
    if (!have.has(ex.id)) changes.push({ table: 'exercises', row: exerciseRow(ex) });
  }
  changes.push({
    table: 'routines',
    row: {
      id: routineId,
      deleted: false,
      name: input.name,
      split_key: 'livre',
      position,
      reason: input.reason,
      archived: false,
      origin: input.origin,
    },
  });
  input.items.forEach((it, i) =>
    changes.push({
      table: 'routine_items',
      row: {
        id: `${routineId}-${i}`,
        deleted: false,
        routine_id: routineId,
        position: i,
        exercise_id: it.exercise_id,
        sets: it.sets,
        target_min: it.target_min,
        target_max: it.target_max,
        rest_sec: it.rest_sec,
        warmup_sets: it.warmup_sets,
        note: it.note,
        reason: null,
        superset: it.superset,
      },
    }),
  );
  await saveMany(changes);
}

/**
 * Adds a received ficha to this person's routines, then tells the server. Written on the
 * phone first: offline, it is there already, and accepting again later writes the same rows.
 */
export async function addSharedRoutine(s: SharedRoutine): Promise<string> {
  const routineId = receivedRoutineId(s.id);
  await saveCopiedRoutine({
    routineId,
    name: s.name,
    reason: s.from_team ? 'Enviada pelo Anilha' : `Enviada por ${s.sender_name}`,
    origin: 'recebida',
    items: s.items,
    exercises: s.exercises,
  });
  // An "invalid" answer means it was already answered (a retry): the copy above stands.
  await rpc('answer_shared_routine', { p_id: s.id, p_accept: true });
  invalidateRemote('inbox');
  invalidateRemote('shared_routine');
  invalidateRemote('routine_thread');
  return routineId;
}

export async function declineSharedRoutine(id: string): Promise<void> {
  await rpc('answer_shared_routine', { p_id: id, p_accept: false });
  invalidateRemote('inbox');
  invalidateRemote('shared_routine');
  invalidateRemote('routine_thread');
}
