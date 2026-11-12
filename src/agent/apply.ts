import { planChanges } from '../data/ops';
import { currentStore, db, hasCurrent, newId, saveMany, uid, type Change } from '../data/store';
import { EXERCISES_BY_ID } from '../engine/exercises';
import type { MuscleGroup, RoutineItemRow, RoutineRow, SplitKey } from '../engine/types';
import type { ContextFicha } from './context';
import type { Proposal } from './execute';

/** Puts everything a save changed back as it was. */
export type Undo = () => Promise<void>;
export interface UndoSnapshot {
  changes: Change[];
  before: (Change['row'] | undefined)[];
  after: Change['row'][];
}

/** Undo must never replace a newer edit, including one synced from another device. */
export class UndoConflictError extends Error {
  constructor() {
    super(
      'Os dados mudaram depois desta proposta. Não dá para voltar sem apagar mudanças mais recentes.',
    );
    this.name = 'UndoConflictError';
  }
}

/**
 * Writes the changes and keeps each row as it was before, so "Voltar ao anterior" restores
 * them and drops the rows that did not exist. Synced like any other write.
 */
export async function applyWithUndo(
  changes: Change[],
  captured?: (snapshot: UndoSnapshot) => Promise<void>,
): Promise<Undo> {
  const d = db();
  const userId = uid();
  const tables = [...new Set(changes.map((c) => c.table))].map((t) => d.table(t));
  const sameAccount = () => hasCurrent() && db() === d && uid() === userId;
  const snapshots = await d.transaction('rw', [...tables, d.outbox, d.meta], async () => {
    const before = await Promise.all(changes.map((c) => d.table(c.table).get(c.row.id)));
    if (!sameAccount()) throw new UndoConflictError();
    await saveMany(changes);
    const after = await Promise.all(changes.map((c) => d.table(c.table).get(c.row.id)));
    if (captured) await captured({ changes, before, after });
    return { before, after };
  });
  return () => undoSaved({ changes, ...snapshots }, { db: d, userId });
}

/** Persistable undo, with the same revision/account checks as the chat. */
export async function undoSaved(
  snapshots: UndoSnapshot,
  owner: NonNullable<ReturnType<typeof currentStore>>,
  restored?: () => Promise<void>,
): Promise<void> {
  const { db: d, userId } = owner;
  const changes = snapshots.changes;
  const sameAccount = () => hasCurrent() && db() === d && uid() === userId;
  const tables = [...new Set(changes.map((c) => c.table))].map((t) => d.table(t));
  if (!sameAccount()) throw new UndoConflictError();
  await d.transaction('rw', [...tables, d.outbox, d.meta], async () => {
    const current = await Promise.all(changes.map((c) => d.table(c.table).get(c.row.id)));
    // Every local or synced write changes updated_at. Check all rows before restoring any.
    if (
      !sameAccount() ||
      current.some((row, i) => !row || row.updated_at !== snapshots.after[i]?.updated_at)
    ) {
      throw new UndoConflictError();
    }
    await saveMany(
      changes.map((c, i) => {
        const old = snapshots.before[i] as Change['row'] | undefined;
        return (
          old ? { table: c.table, row: old } : { table: c.table, row: { ...c.row, deleted: true } }
        ) as Change;
      }),
    );
    await restored?.();
  });
}

export async function applyProposal(
  p: Proposal,
  today: string,
  captured?: (snapshot: UndoSnapshot) => Promise<void>,
): Promise<Undo> {
  const owner = currentStore();
  async function applyPrepared(preparing: Promise<Change[]>): Promise<Undo> {
    const changes = await preparing;
    if (!owner || currentStore() !== owner) throw new UndoConflictError();
    return applyWithUndo(changes, captured);
  }
  switch (p.kind) {
    case 'plano':
      return applyPrepared(planChanges(p.plan, p.after, today));
    case 'ficha':
      return applyPrepared(fichaChanges(p.before.id, p.after));
    case 'nova':
      return applyPrepared(newFichaChanges(p.ficha, p.replaces?.id ?? null));
    case 'lugar':
      return async () => {};
  }
}

/**
 * A ficha edited: exercises that stay keep their row (warm-up, note, bi-set), the ones that
 * leave are deleted, the new ones are added, everything in the new order.
 */
export async function fichaChanges(routineId: string, after: ContextFicha): Promise<Change[]> {
  const old = (await db().routine_items.where('routine_id').equals(routineId).toArray())
    .filter((i) => !i.deleted)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const unused = [...old];
  const changes: Change[] = after.items.map((it, position) => {
    const at = unused.findIndex((o) => o.exercise_id === it.exercise_id);
    const kept = at >= 0 ? unused.splice(at, 1)[0] : undefined;
    const row: Omit<RoutineItemRow, 'user_id' | 'updated_at'> = kept
      ? { ...kept, ...it, position }
      : {
          id: newId(),
          deleted: false,
          routine_id: routineId,
          position,
          warmup_sets: 0,
          note: null,
          reason: null,
          ...it,
        };
    return { table: 'routine_items', row };
  });
  for (const o of unused) changes.push({ table: 'routine_items', row: { ...o, deleted: true } });
  return changes;
}

/** Where a new ficha of these exercises sits among the groups, by its main group. */
const SPLIT_OF_GROUP: Record<MuscleGroup, SplitKey> = {
  pernas: 'perna',
  peito: 'peito',
  costas: 'costas',
  ombros: 'ombro_abdomen',
  bracos: 'bracos',
  core: 'ombro_abdomen',
};

function splitOf(f: ContextFicha): SplitKey {
  const count = new Map<MuscleGroup, number>();
  for (const it of f.items) {
    const g = EXERCISES_BY_ID.get(it.exercise_id)?.primary_group;
    if (g) count.set(g, (count.get(g) ?? 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'pernas';
  return SPLIT_OF_GROUP[top];
}

/**
 * A new ficha. In place of another, it takes that one's place in the week (its split and
 * origin) and the other is archived; otherwise it is the person's own, one more.
 */
async function newFichaChanges(f: ContextFicha, replaces: string | null): Promise<Change[]> {
  const d = db();
  const routines = (await d.routines.toArray()).filter((r) => !r.deleted && !r.archived);
  const out = replaces ? (routines.find((r) => r.id === replaces) ?? null) : null;
  const id = newId();
  const routine: Omit<RoutineRow, 'user_id' | 'updated_at'> = {
    id,
    deleted: false,
    name: f.name,
    split_key: out?.split_key ?? splitOf(f),
    position: out ? out.position : Math.max(-1, ...routines.map((r) => r.position)) + 1,
    reason: 'Montada com o assistente',
    archived: false,
    origin: out?.origin ?? 'pessoa',
  };
  const changes: Change[] = [{ table: 'routines', row: routine }];
  f.items.forEach((it, position) =>
    changes.push({
      table: 'routine_items',
      row: {
        id: newId(),
        deleted: false,
        routine_id: id,
        position,
        warmup_sets: 0,
        note: null,
        reason: null,
        ...it,
      },
    }),
  );
  if (out) changes.push({ table: 'routines', row: { ...out, archived: true } });
  return changes;
}
