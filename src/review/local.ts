import { currentStore } from '../data/store';
import type { AnilhaDB } from '../data/db';
import { planForDay } from '../engine/recommend';
import { weekStart } from '../engine/dates';
import { getClient } from '../sync/client';
import { EXERCISES } from '../engine/exercises';
import { buildAgentContext } from '../agent/live';
import { executeTool, type Proposal } from '../agent/execute';
import { applyProposal, undoSaved, type UndoSnapshot } from '../agent/apply';
import { parseUsage, type AnalysisUsage, validAdjustment } from '../analysis/contract';
import { buildReviewContext, type ReviewInput } from './context';
import { parseReviewReply, type ReviewContext, type ReviewReply } from './contract';

export interface ReviewDecision {
  status: 'proposed' | 'saved' | 'refused' | 'undone';
  proposal?: Proposal;
  undo?: UndoSnapshot;
}
export interface SavedReview {
  version: string;
  context: ReviewContext;
  reply: ReviewReply;
  usage?: AnalysisUsage;
  exercises: string[];
  decisions: ReviewDecision[];
}
const stable = (x: unknown, ignoreTime = false): string =>
  JSON.stringify(x, (key, value) =>
    key === 'server_seq' || (ignoreTime && key === 'updated_at')
      ? undefined
      : value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value,
  );
export const reviewKey = (id: string) => `review:${id}`;
const ordered = <T extends { position: number; id: string }>(a: T[]) =>
  a.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
export async function reviewInput(d: AnilhaDB, today: string): Promise<ReviewInput> {
  const plan = planForDay(await d.plans.toArray(), today);
  const profile = (await d.profiles.toArray()).find((p) => !p.deleted);
  const params = profile?.onboarding ?? plan?.params;
  if (!params) throw new Error('Crie um plano antes de revisar.');
  return {
    analyses: (await d.meta.toArray())
      .filter((e) => e.key.startsWith('analysis:'))
      .map((e) => e.value as unknown as Record<string, unknown>),
    today,
    params,
    plan,
    deload: profile?.deload_week === weekStart(today),
    health: false,
    returnMode: false,
    routines: ordered((await d.routines.toArray()).filter((r) => !r.deleted && !r.archived)),
    items: ordered((await d.routine_items.toArray()).filter((i) => !i.deleted)),
    sessions: await d.sessions.toArray(),
    runs: await d.runs.toArray(),
    externalPlans: await d.external_plan_items.toArray(),
    overrides: await d.day_overrides.toArray(),
  };
}
/** updated_at on child rows is part of the version: editing an item does not touch its parent. */
export function reviewVersion(input: ReviewInput, id: string): string {
  return stable([
    input.routines.find((r) => r.id === id),
    input.items.filter((i) => i.routine_id === id),
  ]);
}
export function reviewProposal(
  saved: SavedReview,
  index: number,
  input: ReviewInput,
  id: string,
): Proposal | null {
  const a = saved.reply.ajustes[index];
  if (!a) return null;
  const { motivo, ...adjustment } = a;
  if (
    !validAdjustment(
      adjustment,
      saved.exercises.length,
      EXERCISES.map((e) => e.id),
    )
  )
    return null;
  const exercise = saved.exercises[a.slot];
  const items = input.items.filter((i) => i.routine_id === id);
  if (
    items.filter((i) => i.exercise_id === exercise).length !== 1 ||
    (a.operation === 'trocar' && items.some((i) => i.exercise_id === a.replacement))
  )
    return null;
  return executeTool(
    'editar_ficha',
    {
      ficha_id: id,
      mudancas: [
        {
          tipo: a.operation,
          exercicio_id: exercise,
          novo_exercicio_id: a.replacement,
          series: a.sets,
          repeticoes_min: a.min,
          repeticoes_max: a.max,
          descanso_segundos: null,
          posicao: null,
        },
      ],
      motivo,
    },
    buildAgentContext(input),
  ).proposal;
}
const flights = new WeakMap<AnilhaDB, Map<string, Promise<SavedReview>>>();
const received = new WeakMap<AnilhaDB, Map<string, SavedReview>>();
export async function requestReview(id: string, today: string): Promise<SavedReview> {
  const owner = currentStore();
  if (!owner) throw new Error('Entre na sua conta.');
  const d = owner.db;
  const check = () => {
    if (currentStore() !== owner) throw new Error('A conta mudou.');
  };
  let tasks = flights.get(d);
  if (!tasks) {
    tasks = new Map();
    flights.set(d, tasks);
  }
  const running = tasks.get(id);
  if (running) return running;
  const task = (async () => {
    const input = await reviewInput(d, today),
      version = reviewVersion(input, id);
    const previouslyReceived = received.get(d)?.get(id);
    const stored = (await d.meta.get(reviewKey(id)))?.value as SavedReview | undefined;
    const cached = previouslyReceived?.version === version ? previouslyReceived : stored;
    check();
    if (cached?.reply && cached.version === version) {
      await d.meta.put({ key: reviewKey(id), value: cached });
      received.get(d)?.delete(id);
      return cached;
    }
    const context = buildReviewContext(input, id, input.deload === true);
    const client = await getClient();
    const { data: auth } = await client.auth.getSession();
    check();
    if (auth.session?.user.id !== owner.userId) throw new Error('Entre na sua conta.');
    const { data, error } = await client.functions.invoke('revisao-ficha', {
      body: { context },
      headers: { Authorization: `Bearer ${auth.session.access_token}` },
      timeout: 125000,
    });
    check();
    if (error) {
      let message = 'Não foi possível revisar agora. Uma tentativa enviada conta no limite diário.';
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = String(body.error);
      } catch {
        /* use fallback */
      }
      throw new Error(message);
    }
    const { usage, ...raw } = data;
    const reply = parseReviewReply(
      raw,
      context.items.length,
      EXERCISES.map((e) => e.id),
    );
    if (!reply) throw new Error('Resposta de revisão inválida.');
    const saved: SavedReview = {
      version,
      context,
      reply,
      usage: parseUsage(usage) ?? undefined,
      exercises: input.items.filter((i) => i.routine_id === id).map((i) => i.exercise_id),
      decisions: reply.ajustes.map(() => ({ status: 'proposed' })),
    };
    let pending = received.get(d);
    if (!pending) {
      pending = new Map();
      received.set(d, pending);
    }
    pending.set(id, saved);
    await d.meta.put({ key: reviewKey(id), value: saved });
    pending.delete(id);
    return saved;
  })();
  tasks.set(id, task);
  try {
    return await task;
  } finally {
    tasks.delete(id);
  }
}
export async function decideReview(
  id: string,
  index: number,
  action: 'apply' | 'refuse' | 'undo',
  today: string,
): Promise<void> {
  const owner = currentStore();
  if (!owner) throw new Error('Entre na sua conta.');
  const d = owner.db;
  await d.transaction('rw', d.tables, async () => {
    const saved = (await d.meta.get(reviewKey(id)))?.value as SavedReview | undefined;
    const input = await reviewInput(d, today);
    if (currentStore() !== owner || !saved || saved.version !== reviewVersion(input, id))
      throw new Error('A ficha mudou. Revise a versão atual.');
    const decision = saved.decisions[index];
    if (!decision) throw new Error('Ajuste indisponível.');
    const persist = async () => {
      saved.version = reviewVersion(await reviewInput(d, today), id);
      await d.meta.put({ key: reviewKey(id), value: saved });
    };
    if (action === 'undo') {
      if (decision.status !== 'saved' || !decision.undo) throw new Error('Ajuste indisponível.');
      // Applying another adjustment rewrites kept rows too. Rebase only unchanged content,
      // after the whole routine version was checked, preserving independent adjustments.
      for (let i = 0; i < decision.undo.changes.length; i++) {
        const change = decision.undo.changes[i]!;
        const live = await d.table(change.table).get(change.row.id);
        if (stable(live, true) !== stable(decision.undo.after[i], true))
          throw new Error('Outro ajuste mudou este exercício. Desfaça o mais recente primeiro.');
        decision.undo.after[i] = live;
      }
      await undoSaved(decision.undo, owner, async () => {
        decision.status = 'undone';
        await persist();
      });
    } else {
      if (decision.status !== 'proposed') throw new Error('Ajuste já decidido.');
      if (action === 'refuse') {
        decision.status = 'refused';
        await persist();
      } else {
        const proposal = reviewProposal(saved, index, input, id);
        if (!proposal) throw new Error('Este ajuste não pode ser aplicado à ficha atual.');
        decision.proposal = proposal;
        await applyProposal(proposal, today, async (undo) => {
          const indices = undo.changes.flatMap((_, i) =>
            stable(undo.before[i], true) !== stable(undo.after[i], true) ? [i] : [],
          );
          if (!indices.length) throw new Error('Este ajuste já está na ficha.');
          decision.status = 'saved';
          decision.undo = {
            changes: indices.map((i) => undo.changes[i]!),
            before: indices.map((i) => undo.before[i]),
            after: indices.map((i) => undo.after[i]!),
          };
          await persist();
        });
      }
    }
  });
}
