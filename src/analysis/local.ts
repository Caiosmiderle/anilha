import { applyProposal, undoSaved, UndoConflictError, type UndoSnapshot } from '../agent/apply';
import { currentStore, type CurrentStore } from '../data/store';
import type { AnilhaDB } from '../data/db';
import { planForDay } from '../engine/recommend';
import { EXERCISES } from '../engine/exercises';
import { getClient } from '../sync/client';
import { buildAnalysisContext, type AnalysisInput } from './context';
import {
  parseReply,
  parseUsage,
  type AnalysisUsage,
  type AnalysisContext,
  type AnalysisReply,
} from './contract';
import { analysisProposal, type AnalysisBinding } from './proposal';

export interface SavedAnalysis {
  context: AnalysisContext;
  binding: AnalysisBinding;
  reply: AnalysisReply;
  status: 'proposed' | 'saved' | 'refused' | 'undone';
  usage?: AnalysisUsage;
  undo?: UndoSnapshot;
}
const key = (id: string) => `analysis:${id}`;
const inFlight = new Map<string, Promise<SavedAnalysis>>();
const unpersisted = new WeakMap<CurrentStore, Map<string, SavedAnalysis>>();
const check = (owner: CurrentStore) => {
  if (currentStore() !== owner) throw new Error('A conta mudou. Abra o treino novamente.');
};
const stable = (value: unknown) =>
  JSON.stringify(value, (key, v) => {
    if (key === 'server_seq') return undefined;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v;
  });
export async function analysisInput(d: AnilhaDB, sessionID: string): Promise<AnalysisInput> {
  const tables: AnalysisInput['tables'] = {};
  for (const table of [
    'sessions',
    'session_items',
    'sets',
    'plans',
    'routines',
    'routine_items',
    'profiles',
    'exercises',
  ])
    tables[table] = await d.table(table).toArray();
  const planned: NonNullable<AnalysisInput['planned']> = {},
    rules: NonNullable<AnalysisInput['rules']> = {};
  for (const entry of await d.meta.toArray()) {
    if (entry.key.startsWith('analysis-plan:'))
      planned[entry.key.slice(14)] = entry.value as (typeof planned)[string];
    if (entry.key.startsWith('analysis-rule:')) rules[entry.key.slice(14)] = String(entry.value);
  }
  return { sessionID, tables, planned, rules };
}
export async function analysisBinding(d: AnilhaDB, id: string): Promise<AnalysisBinding> {
  const session = await d.sessions.get(id);
  if (!session || session.deleted || session.status !== 'done')
    throw new Error('Treino indisponível.');
  const items = (await d.session_items.where('session_id').equals(id).toArray())
    .filter((i) => !i.deleted)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const routine = session.routine_id ? ((await d.routines.get(session.routine_id)) ?? null) : null;
  const routineItems = routine
    ? (await d.routine_items.where('routine_id').equals(routine.id).toArray())
        .filter((i) => !i.deleted)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    : [];
  const plan = planForDay(await d.plans.toArray(), session.local_date);
  const profile = (await d.profiles.toArray()).find((p) => !p.deleted);
  const routines = (await d.routines.toArray())
    .filter((r) => !r.deleted && !r.archived)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const allRoutineItems = (await d.routine_items.toArray())
    .filter((i) => !i.deleted)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return {
    session,
    items,
    routine,
    routineItems,
    routines,
    allRoutineItems,
    plan,
    params: profile?.onboarding ?? plan?.params ?? null,
  };
}
export async function requestAnalysis(id: string): Promise<SavedAnalysis> {
  const owner = currentStore();
  if (!owner) throw new Error('Entre na sua conta.');
  const flightKey = `${owner.db.name}:${id}`;
  const running = inFlight.get(flightKey);
  if (running) return running;
  const task = (async () => {
    const cached = (await owner.db.meta.get(key(id)))?.value as SavedAnalysis | undefined;
    check(owner);
    if (cached) return cached;
    const persist = async (saved: SavedAnalysis) => {
      check(owner);
      let pending = unpersisted.get(owner);
      if (!pending) {
        pending = new Map();
        unpersisted.set(owner, pending);
      }
      pending.set(id, saved);
      try {
        await owner.db.meta.put({ key: key(id), value: saved });
        pending.delete(id);
      } catch {
        throw new Error(
          'A análise chegou, mas não foi possível guardá-la. Tente novamente para guardar sem nova chamada.',
        );
      }
      return saved;
    };
    const received = unpersisted.get(owner)?.get(id);
    if (received) return persist(received);
    const { context, binding } = await owner.db.transaction(
      'r',
      [
        owner.db.sessions,
        owner.db.session_items,
        owner.db.sets,
        owner.db.plans,
        owner.db.routines,
        owner.db.routine_items,
        owner.db.profiles,
        owner.db.exercises,
        owner.db.meta,
      ],
      async () => ({
        context: buildAnalysisContext(await analysisInput(owner.db, id)),
        binding: await analysisBinding(owner.db, id),
      }),
    );
    const client = await getClient();
    const { data: auth } = await client.auth.getSession();
    check(owner);
    if (auth.session?.user.id !== owner.userId)
      throw new Error('Entre na sua conta para analisar.');
    const { data, error } = await client.functions.invoke('analise-treino', {
      body: { context },
      headers: { Authorization: `Bearer ${auth.session.access_token}` },
      timeout: 45000,
    });
    check(owner);
    if (error) {
      let message = 'Não foi possível analisar agora. Tente novamente.';
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = String(body.error);
      } catch {
        /* generic message */
      }
      throw new Error(message);
    }
    const { usage: rawUsage, ...rawReply } = data;
    const reply = parseReply(
      rawReply,
      context.items.length,
      EXERCISES.map((e) => e.id),
    );
    if (!reply) throw new Error('Resposta de análise inválida.');
    const saved: SavedAnalysis = {
      context,
      binding,
      reply,
      status: 'proposed',
      usage: parseUsage(rawUsage) ?? undefined,
    };
    return persist(saved);
  })();
  inFlight.set(flightKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(flightKey);
  }
}
export async function updateAnalysis(id: string, saved: SavedAnalysis): Promise<void> {
  const owner = currentStore();
  if (!owner) throw new Error('Entre na sua conta.');
  await owner.db.transaction('rw', owner.db.meta, async () => {
    const previous = (await owner.db.meta.get(key(id)))?.value as SavedAnalysis | undefined;
    check(owner);
    if (previous?.status !== 'proposed' || saved.status === 'saved' || saved.status === 'undone')
      throw new UndoConflictError();
    await owner.db.meta.put({ key: key(id), value: saved });
  });
}
export async function saveAnalysisAdjustment(id: string, saved: SavedAnalysis): Promise<void> {
  const owner = currentStore();
  if (!owner || saved.status !== 'proposed') throw new UndoConflictError();
  const d = owner.db;
  await d.transaction(
    'rw',
    [
      d.routines,
      d.routine_items,
      d.sessions,
      d.session_items,
      d.plans,
      d.profiles,
      d.outbox,
      d.meta,
    ],
    async () => {
      const liveSaved = (await d.meta.get(key(id)))?.value as SavedAnalysis | undefined;
      if (liveSaved?.status !== 'proposed') throw new UndoConflictError();
      const live = await analysisBinding(d, id);
      check(owner);
      if (stable(live) !== stable(saved.binding)) throw new UndoConflictError();
      const proposal = analysisProposal(saved.reply.adjustment, saved.binding);
      if (!proposal) throw new Error('Este ajuste não pode ser aplicado à ficha atual.');
      await applyProposal(proposal, saved.binding.session.local_date, async (undo) => {
        check(owner);
        await d.meta.put({ key: key(id), value: { ...saved, status: 'saved', undo } });
      });
    },
  );
}
export async function undoAnalysisAdjustment(id: string, saved: SavedAnalysis): Promise<void> {
  const owner = currentStore();
  if (!owner || saved.status !== 'saved' || !saved.undo) throw new UndoConflictError();
  await undoSaved(saved.undo, owner, async () => {
    await owner.db.meta.put({ key: key(id), value: { ...saved, status: 'undone' } });
  });
}
