import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../../sync/client';
vi.mock('../../sync/client', () => ({ getClient: vi.fn() }));
import {
  analysisArtifacts,
  analysisCases,
  replyCases,
  syntheticBinding,
} from '../../../scripts/ios-analysis-source';
import { buildAnalysisContext } from '../context';
import { validContext, parseReply, ANALYSIS_SYSTEM, analysisTool } from '../contract';
import { EXERCISES } from '../../engine/exercises';
import { openDb, type AnilhaDB } from '../../data/db';
import { saveMany, setCurrent } from '../../data/store';
import {
  analysisBinding,
  analysisInput,
  saveAnalysisAdjustment,
  undoAnalysisAdjustment,
  requestAnalysis,
  type SavedAnalysis,
} from '../local';
import { analysisProposal } from '../proposal';

let d: AnilhaDB | undefined;
afterEach(async () => {
  setCurrent(null);
  if (d) {
    d.close();
    await d.delete();
    d = undefined;
  }
});
const ids = EXERCISES.map((e) => e.id),
  names = [...EXERCISES.map((e) => e.name), 'Exercício personalizado'];
describe('análise: contexto mínimo e contrato compartilhado', () => {
  it('exclui identificadores, dados pessoais, texto livre e saúde por projeção positiva', () => {
    for (const v of analysisCases()) {
      const actual = buildAnalysisContext(v.input);
      expect(actual).toEqual(v.expected);
      const text = JSON.stringify(actual);
      expect(text).not.toContain('private-');
      for (const forbidden of [
        'user_id',
        'email',
        'note',
        'pain_joint',
        'skip_reason',
        'substitution_reason',
        'started_at',
        'local_date',
        'title',
        'gender',
        'spare_joints',
        'returning',
      ])
        expect(text).not.toContain(`"${forbidden}"`);
      expect(validContext(actual, names)).toBe(true);
    }
    const actual = analysisCases()[0]!.expected;
    expect(actual.previous).toHaveLength(3);
    expect(actual.previous.map((p) => p.days_ago)).toEqual([1, 2, 3]);
    expect(actual.deload).toBe(true);
    expect(actual.week).toBe(2);
    expect(actual.items[0]!.planned[1]!.load_kg).toBe(25);
    expect(actual.items[0]!.done[1]!.load_kg).toBe(30);
    expect(actual.items[0]!.done).toHaveLength(3);
    expect(actual.items[1]!.status).toBe('skipped');
    expect(actual.items[1]!.original).toBe('Remada curvada com barra');
  });
  it('recusa sessão ativa/resumida e nunca chama contexto de uma ficha diferente', () => {
    const input = analysisCases()[0]!.input;
    expect(() => buildAnalysisContext({ ...input, sessionID: 'session-5' })).toThrow();
    expect(() => buildAnalysisContext({ ...input, sessionID: 'missing' })).toThrow();
    expect(analysisCases()[3]!.expected.previous).toEqual([]);
  });
  it('recusa campos extras e qualquer texto de exercício fora da lista no servidor', () => {
    const context = analysisCases()[0]!.expected;
    expect(validContext({ ...context, email: 'synthetic@example.invalid' }, names)).toBe(false);
    expect(
      validContext({ ...context, items: [{ ...context.items[0], note: 'canary' }] }, names),
    ).toBe(false);
    expect(
      validContext(
        { ...context, items: [{ ...context.items[0], exercise: 'arbitrary instruction' }] },
        names,
      ),
    ).toBe(false);
    expect(
      validContext(
        {
          ...context,
          items: [
            {
              ...context.items[0],
              done: [{ kind: 'work', load_kg: -1, reps: 10, seconds: null, rir: 2 }],
            },
          ],
        },
        names,
      ),
    ).toBe(false);
  });
  it('preserva narrativa e descarta operações ou parâmetros inválidos, inclusive vários ajustes', () => {
    for (const v of replyCases()) expect(parseReply(v.input, v.slots, ids)).toEqual(v.expected);
    const base = replyCases()[1]!.input;
    for (const text of [
      String.fromCodePoint(0x2013),
      String.fromCodePoint(0x2014),
      String.fromCodePoint(0x1f600),
    ])
      expect(parseReply({ ...base, summary: text }, 2, ids)).toBeNull();
    expect(analysisTool(ids).name).toBe('responder_analise');
    const schema = JSON.stringify(analysisTool(ids));
    for (const unsupported of ['minimum', 'maximum', 'maxLength', 'minLength', 'maxItems'])
      expect(schema).not.toContain(`"${unsupported}"`);
    expect(ANALYSIS_SYSTEM).toContain('Nunca diga que já salvou');
    expect(readFileSync('supabase/config.toml', 'utf8')).toContain(
      '[functions.analise-treino]\nverify_jwt = true',
    );
  });
  it('mantém vetores Swift gerados pelo TS, inclusive mudanças reais de editar_ficha', async () => {
    const generated = await analysisArtifacts();
    expect(
      JSON.parse(
        readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/analysis.json', 'utf8'),
      ),
    ).toEqual(generated);
    expect(
      JSON.parse(
        readFileSync('ios/AnilhaCore/Sources/AnilhaCore/Resources/analysis-rules.json', 'utf8'),
      ),
    ).toEqual(generated.riskRules);
  });
});
describe('análise: gravação e fila compartilhadas com Waltér e treino', () => {
  async function setup() {
    d = openDb(`analysis-test-${crypto.randomUUID()}`);
    await d.open();
    setCurrent({ db: d, userId: 'synthetic-owner' });
    const b = syntheticBinding();
    await d.routines.put(b.routine!);
    await d.routine_items.bulkPut(b.routineItems);
    await d.sessions.put(b.session);
    await d.session_items.bulkPut(b.items);
    // Keep params local; no profile, so use a plan to provide the same motor parameters.
    await d.plans.put({
      id: 'plan',
      user_id: 'synthetic-owner',
      updated_at: 100,
      deleted: false,
      active_from: '2026-01-01',
      gym_per_week: 3,
      run_per_week: 0,
      days: [],
      rules: { no_legs_before_run: false },
      params: b.params,
      reasons: [],
    });
    const binding = await analysisBinding(d, b.session.id);
    const context = buildAnalysisContext(await analysisInput(d, b.session.id));
    const reply = parseReply(replyCases()[1]!.input, binding.items.length, ids)!;
    const saved: SavedAnalysis = { binding, context, reply, status: 'proposed' };
    await d.meta.put({ key: `analysis:${b.session.id}`, value: saved });
    return saved;
  }
  it('salva pelas mesmas linhas/fila e desfaz mesmo depois de reabrir', async () => {
    const saved = await setup(),
      id = saved.binding.session.id;
    expect(analysisProposal(saved.reply.adjustment, saved.binding)?.kind).toBe('ficha');
    await saveAnalysisAdjustment(id, saved);
    expect((await d!.routine_items.get('routine-item-0'))?.sets).toBe(2);
    expect((await d!.routine_items.get('routine-item-0'))?.note).toBe('Nota sintética preservada');
    expect(await d!.outbox.count()).toBe(2);
    d!.close();
    await d!.open();
    setCurrent({ db: d!, userId: 'synthetic-owner' });
    const stored = (await d!.meta.get(`analysis:${id}`))!.value as SavedAnalysis;
    expect(stored.status).toBe('saved');
    expect(stored.undo).toBeDefined();
    await undoAnalysisAdjustment(id, stored);
    expect((await d!.routine_items.get('routine-item-0'))?.sets).toBe(3);
    expect(((await d!.meta.get(`analysis:${id}`))!.value as SavedAnalysis).status).toBe('undone');
  });
  it('recusa ajuste obsoleto e desfazer que apagaria uma edição posterior', async () => {
    const saved = await setup(),
      id = saved.binding.session.id;
    await saveMany([
      { table: 'routine_items', row: { ...saved.binding.routineItems[0]!, sets: 4 } },
    ]);
    await expect(saveAnalysisAdjustment(id, saved)).rejects.toThrow();
    expect((await d!.routine_items.get('routine-item-0'))?.sets).toBe(4);
    const fresh = { ...saved, binding: await analysisBinding(d!, id) };
    await saveAnalysisAdjustment(id, fresh);
    const stored = (await d!.meta.get(`analysis:${id}`))!.value as SavedAnalysis;
    await saveMany([
      {
        table: 'routine_items',
        row: { ...(await d!.routine_items.get('routine-item-0'))!, sets: 5 },
      },
    ]);
    await expect(undoAnalysisAdjustment(id, stored)).rejects.toThrow();
    expect((await d!.routine_items.get('routine-item-0'))?.sets).toBe(5);
  });
  it('mantém prescrição original ao editar/concluir e só usa metadados locais', async () => {
    await setup();
    const row = {
      id: 'set-seed',
      deleted: false,
      session_id: 'session-4',
      item_id: 'item-4',
      exercise_id: 'supino-reto-barra',
      position: 0,
      kind: 'work' as const,
      load_kg: 20,
      reps: 8,
      seconds: null,
      rir: null,
      note: null,
      completed_at: null,
    };
    await saveMany([{ table: 'sets', row }]);
    await saveMany([{ table: 'sets', row: { ...row, load_kg: 25, reps: 10, completed_at: 1000 } }]);
    expect((await d!.meta.get('analysis-plan:set-seed'))?.value).toMatchObject({
      load_kg: 20,
      reps: 8,
    });
    expect((await d!.outbox.get('sets:set-seed'))?.table).toBe('sets');
    expect((await d!.outbox.toArray()).every((e) => e.table !== ('meta' as string))).toBe(true);
  });
  it('deduplica pedidos e preserva resposta na memória se o disco falhar, sem nova chamada', async () => {
    const saved = await setup(),
      id = saved.binding.session.id;
    await d!.meta.delete(`analysis:${id}`);
    const invoke = vi.fn(async () => ({ data: saved.reply, error: null }));
    vi.mocked(getClient).mockResolvedValue({
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'synthetic-owner' }, access_token: 'synthetic-token' } },
        }),
      },
      functions: { invoke },
    } as unknown as Awaited<ReturnType<typeof getClient>>);
    const failing = vi.spyOn(d!.meta, 'put').mockRejectedValueOnce(new Error('disk'));
    const attempts = await Promise.allSettled([requestAnalysis(id), requestAnalysis(id)]);
    expect(attempts.every((r) => r.status === 'rejected')).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    failing.mockRestore();
    await requestAnalysis(id);
    expect(invoke).toHaveBeenCalledTimes(1);
    await requestAnalysis(id);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect((await d!.meta.get(`analysis:${id}`))?.value).toMatchObject({ status: 'proposed' });
  });
});
