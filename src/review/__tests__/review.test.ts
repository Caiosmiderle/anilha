import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import {
  reviewArtifacts,
  reviewCases,
  reviewReply,
  reviewAdjustments,
} from '../../../scripts/ios-review-source';
import { buildReviewContext } from '../context';
import { parseReviewReply, validReviewContext, REVIEW_SYSTEM } from '../contract';
import { runningContext, validRunning } from '../../analysis/running';
import { buildAnalysisContext } from '../../analysis/context';
import { validContext, estimatedCost } from '../../analysis/contract';
import { analysisCases } from '../../../scripts/ios-analysis-source';
import { EXERCISES } from '../../engine/exercises';
import { openDb, type AnilhaDB } from '../../data/db';
import { setCurrent, patch } from '../../data/store';
import {
  requestReview,
  reviewKey,
  reviewInput,
  reviewVersion,
  decideReview,
  type SavedReview,
} from '../local';
import { getClient } from '../../sync/client';
vi.mock('../../sync/client', () => ({ getClient: vi.fn() }));
let d: AnilhaDB | undefined;
const names = [...EXERCISES.map((e) => e.name), 'Exercício personalizado'],
  ids = EXERCISES.map((e) => e.id);
afterEach(async () => {
  setCurrent(null);
  if (d) {
    d.close();
    await d.delete();
    d = undefined;
  }
  vi.clearAllMocks();
});
it('projeta somente a lista permitida, calendário do motor e volume de todas as fichas', () => {
  for (const c of reviewCases()) {
    const result = buildReviewContext(c.input, c.routineID, false);
    expect(result).toEqual(c.expected);
    expect(validReviewContext(result, names)).toBe(true);
    const json = JSON.stringify(result);
    expect(json).not.toContain('private-');
    for (const key of [
      'name',
      'email',
      'note',
      'pain_joint',
      'age_range',
      'weight_kg',
      'spare_joints',
      'route',
      'gps',
      'started_at',
      'pace',
      'heartrate',
      'local_date',
      'user_id',
      'source_type',
    ])
      expect(json).not.toContain(`"${key}"`);
    expect(validReviewContext({ ...result, note: 'private' }, names)).toBe(false);
    expect(validReviewContext({ ...result, running: { ...result.running, gps: [] } }, names)).toBe(
      false,
    );
  }
  const c = reviewCases()[0]!;
  expect(c.expected.running.done.map((r) => r.days_ago)).toEqual([14, 2, 1, 0]);
  expect(c.expected.running.planned.map((r) => r.days_ahead)).toEqual([0, 1, 2, 14]);
  const another = { ...c.input.routines[0]!, id: 'other' };
  const expanded = buildReviewContext(
    {
      ...c.input,
      routines: [...c.input.routines, another],
      items: [
        ...c.input.items,
        ...c.input.items.map((i) => ({ ...i, id: i.id + 'other', routine_id: 'other' })),
      ],
    },
    c.routineID,
    false,
  );
  expect(expanded.volume.map((v) => v.sets)).toEqual(c.expected.volume.map((v) => v.sets * 2));
  expect(
    reviewCases()
      .at(-1)!
      .expected.schedule.some((d) => d.target && d.legs_before_run),
  ).toBe(true);
});
it('análise inclui janela de dois dias e aceita contexto legado sem running', () => {
  const c = analysisCases()[0]!,
    result = buildAnalysisContext(c.input);
  expect(result.running?.done.map((r) => r.days_ago)).toEqual([2, 1, 0]);
  expect(result.running?.planned.map((r) => r.days_ahead)).toEqual([0, 1, 2]);
  expect(validContext(result, names)).toBe(true);
  const legacy = { ...result };
  delete legacy.running;
  expect(validContext(legacy, names)).toBe(true);
  expect(validContext({ ...result, running: { ...result.running, health: 'x' } }, names)).toBe(
    false,
  );
  expect(validRunning(runningContext(c.input.tables, '2026-11-05', 14), 2)).toBe(false);
});
it('contrato descarta ajustes inválidos preservando parecer e limita três', () => {
  const fixture = reviewArtifacts();
  expect(
    JSON.parse(readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/review.json', 'utf8')),
  ).toEqual(fixture);
  for (const c of fixture.replies) expect(parseReviewReply(c.input, 2, ids)).toEqual(c.expected);
  expect(
    parseReviewReply(
      { ...reviewReply, ajustes: [{ ...reviewAdjustments[0], sets: 13 }, reviewAdjustments[1]] },
      2,
      ids,
    )?.ajustes,
  ).toEqual([reviewAdjustments[1]]);
  expect(REVIEW_SYSTEM).toContain('48 h');
  expect(REVIEW_SYSTEM).toContain('Doma');
  expect(
    estimatedCost({ model: 'claude-sonnet-5-5', input_tokens: 2000, output_tokens: 1000 }),
  ).toBe(0.014);
  const source = readFileSync('supabase/functions/revisao-ficha/index.ts', 'utf8');
  for (const part of [
    "model:'claude-sonnet-5-5'",
    'max_tokens:8000',
    'timeout:120000',
    'maxRetries:0',
    "type:'auto',disable_parallel_tool_use:true",
    "rpc('is_admin')",
  ])
      expect(source.replace(/\s/g,'')).toContain(part);
  expect(readFileSync('supabase/config.toml', 'utf8')).toMatch(
    /\[functions.revisao-ficha\]\s+verify_jwt = true/,
  );
});
async function setup() {
  d = openDb('review-' + crypto.randomUUID());
  await d.open();
  setCurrent({ db: d, userId: 'synthetic-owner' });
  const c = reviewCases()[0]!,
    input = c.input;
  await d.routines.bulkPut(input.routines);
  await d.routine_items.bulkPut(input.items);
  await d.plans.put({ ...input.plan!, params: input.params });
  const fresh = await reviewInput(d, input.today);
  const saved: SavedReview = {
    version: reviewVersion(fresh, c.routineID),
    context: c.expected,
    reply: reviewReply,
    exercises: input.items.map((i) => i.exercise_id),
    decisions: reviewAdjustments.map(() => ({ status: 'proposed' })),
  };
  await d.meta.put({ key: reviewKey(c.routineID), value: saved });
  return c;
}
for (const index of [0, 1, 2])
  it(`aplica e desfaz ${reviewAdjustments[index]!.operation} pela fila existente`, async () => {
    const c = await setup(),
      original = await d!.routine_items.toArray();
    await decideReview(c.routineID, index, 'apply', c.input.today);
    let saved = (await d!.meta.get(reviewKey(c.routineID)))!.value as SavedReview;
    expect(saved.decisions[index]!.status).toBe('saved');
    expect(await d!.outbox.count()).toBeGreaterThan(0);
    await decideReview(c.routineID, index, 'undo', c.input.today);
    saved = (await d!.meta.get(reviewKey(c.routineID)))!.value as SavedReview;
    expect(saved.decisions[index]!.status).toBe('undone');
    const live = (await d!.routine_items.toArray()).filter((i) => !i.deleted);
    expect(live.map((i) => [i.id, i.exercise_id, i.sets, i.target_min, i.target_max])).toEqual(
      original.map((i) => [i.id, i.exercise_id, i.sets, i.target_min, i.target_max]),
    );
  });
it('recusa separadamente e bloqueia ficha alterada sem perder edição', async () => {
  const c = await setup();
  await decideReview(c.routineID, 0, 'refuse', c.input.today);
  expect(await d!.outbox.count()).toBe(0);
  await patch('routine_items', c.input.items[0]!.id, { sets: 5 });
  await expect(decideReview(c.routineID, 1, 'apply', c.input.today)).rejects.toThrow('mudou');
  expect((await d!.routine_items.get(c.input.items[0]!.id))!.sets).toBe(5);
});
it('aplica os três e desfaz em ordem inversa sem perder os outros ajustes', async () => {
  const c = await setup();
  for (const index of [0, 1, 2]) await decideReview(c.routineID, index, 'apply', c.input.today);
  for (const index of [2, 1, 0]) await decideReview(c.routineID, index, 'undo', c.input.today);
  expect(
    (await d!.routine_items.toArray())
      .filter((i) => !i.deleted)
      .map((i) => [i.exercise_id, i.sets, i.target_min, i.target_max]),
  ).toEqual(c.input.items.map((i) => [i.exercise_id, i.sets, i.target_min, i.target_max]));
});
it('guarda uma resposta por versão, compartilha chamada e refaz só depois de edição', async () => {
  const c = await setup();
  await d!.meta.delete(reviewKey(c.routineID));
  const invoke = vi.fn(async () => ({
    data: {
      ...reviewReply,
      usage: { model: 'claude-sonnet-5-5', input_tokens: 2000, output_tokens: 1000 },
    },
    error: null,
  }));
  vi.mocked(getClient).mockResolvedValue({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'synthetic-owner' }, access_token: 'synthetic' } },
      }),
    },
    functions: { invoke },
  } as unknown as Awaited<ReturnType<typeof getClient>>);
  await Promise.all([
    requestReview(c.routineID, c.input.today),
    requestReview(c.routineID, c.input.today),
  ]);
  await requestReview(c.routineID, c.input.today);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0]).toBeDefined();
  await patch('routine_items', c.input.items[0]!.id, { sets: 5 });
  const disk = vi.spyOn(d!.meta, 'put').mockRejectedValueOnce(new Error('disk'));
  await expect(requestReview(c.routineID, c.input.today)).rejects.toThrow('disk');
  disk.mockRestore();
  await requestReview(c.routineID, c.input.today);
  expect(invoke).toHaveBeenCalledTimes(2);
});
