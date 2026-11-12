import { EXERCISES } from '../engine/exercises';
import { diffDays } from '../engine/dates';
import { parseReply } from './contract';
import type { LocalRow } from './context';
import { memoryText, type AnalysisMemory } from './memory-contract';

export interface MemoryInput {
  routineID: string | null;
  date: string;
  before: number;
  items: LocalRow[];
  analyses: LocalRow[];
}
const row = (v: unknown): LocalRow =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as LocalRow) : {};
const rows = (v: unknown): LocalRow[] => (Array.isArray(v) ? v.map(row) : []);
const ids = EXERCISES.map((e) => e.id);
const destinations = {
  proposed: 'pendente',
  saved: 'aplicado',
  refused: 'recusado',
  undone: 'desfeito',
} as const;
function previous(input: MemoryInput) {
  if (!input.routineID) return [];
  return input.analyses
    .flatMap((saved) => {
      const binding = row(saved.binding),
        session = row(binding.session),
        items = rows(binding.items);
      const reply = parseReply(saved.reply, items.length, ids);
      if (!reply || !/^\d{4}-\d{2}-\d{2}$/.test(String(session.local_date))) return [];
      const age = diffDays(String(session.local_date), input.date);
      if (
        session.deleted === true ||
        session.status !== 'done' ||
        session.routine_id !== input.routineID ||
        !(Number(session.started_at) < input.before) ||
        !Number.isInteger(age) ||
        age < 0 ||
        age > 100000 ||
        !Object.hasOwn(destinations, String(saved.status))
      )
        return [];
      return [{ saved, session, items, reply, age }];
    })
    .sort(
      (a, b) =>
        Number(b.session.started_at) - Number(a.session.started_at) ||
        String(a.session.id).localeCompare(String(b.session.id)),
    );
}
function currentSlot(input: MemoryInput, id: unknown): number | null {
  if (typeof id !== 'string' || !ids.includes(id)) return null;
  const matches = input.items.flatMap((i, slot) => (i.exercise_id === id ? [slot] : []));
  return matches.length === 1 ? matches[0]! : null;
}
/** Projects saved AI output only; no summary, notes, names or health fields are copied. */
export function buildMemory(input: MemoryInput): AnalysisMemory[] {
  return previous(input)
    .slice(0, 3)
    .map(({ saved, items, reply, age }) => ({
      days_ago: age,
      avaliacao: reply.avaliacao ?? null,
      items: (reply.proximaVez ?? [])
        .filter((p) => memoryText(p.comentario))
        .map((p) => ({
          slot: currentSlot(input, items[p.slot]?.exercise_id),
          comentario: p.comentario,
        })),
      adjustment: reply.adjustment
        ? {
            slot: currentSlot(input, items[reply.adjustment.slot]?.exercise_id),
            operation: reply.adjustment.operation,
            status: destinations[saved.status as keyof typeof destinations],
          }
        : null,
    }));
}
/** Latest analysis only. A replaced/deleted routine row invalidates its old hint. */
export function exerciseHint(
  input: MemoryInput,
  exerciseID: string,
  routineItems: LocalRow[],
): string | null {
  const latest = previous(input)[0];
  if (!latest || latest.age > 21 || currentSlot(input, exerciseID) === null) return null;
  const old = rows(row(latest.saved.binding).routineItems).filter(
    (i) => i.exercise_id === exerciseID,
  );
  const live = routineItems.filter(
    (i) => !i.deleted && i.routine_id === input.routineID && i.exercise_id === exerciseID,
  );
  if (old.length !== 1 || live.length !== 1 || old[0]!.id !== live[0]!.id) return null;
  const slot = latest.items.findIndex((i) => i.exercise_id === exerciseID);
  if (latest.items.filter((i) => i.exercise_id === exerciseID).length !== 1) return null;
  const comment = latest.reply.proximaVez?.find((p) => p.slot === slot)?.comentario;
  return memoryText(comment) && !/\p{N}/u.test(comment) ? comment : null;
}
