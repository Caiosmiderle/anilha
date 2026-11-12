import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { openDatabase, createUser, callRpc } from '../../server/pg';
import {
  handleAnalysis,
  type AnalysisDependencies,
} from '../../supabase/functions/analise-treino/core';
import { analysisCases, replyCases } from '../../scripts/ios-analysis-source';
import { handleReview, type ReviewDependencies } from '../../supabase/functions/revisao-ficha/core';
import { reviewCases, reviewReply } from '../../scripts/ios-review-source';
let db: PGlite;
const user = '00000000-0000-4000-8000-000000000081';
const claims = { sub: user, role: 'authenticated' as const };
const req = (
  body: unknown = { context: analysisCases()[0]!.expected },
  auth = 'Bearer local-user',
) =>
  new Request('http://127.0.0.1/functions/v1/analise-treino', {
    method: 'POST',
    headers: { authorization: auth },
    body: JSON.stringify(body),
  });
const model = vi.fn<AnalysisDependencies['model']>(async () => ({
  stop: 'tool_use',
  input: 1000,
  output: 150,
  content: [{ type: 'tool_use', name: 'responder_analise', input: replyCases()[1]!.input }],
}));
const deps: AnalysisDependencies = {
  async begin() {
    try {
      await callRpc(db, claims, 'agent_begin_turn', {});
      return {};
    } catch {
      return { status: 429, error: 'Limite diário.' };
    }
  },
  async end(_auth, input, output) {
    await callRpc(db, claims, 'agent_end_turn', { p_input: input, p_output: output });
  },
  model,
};
beforeAll(async () => {
  db = await openDatabase();
  await createUser(db, user, 'analysis@synthetic.invalid');
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe('função de análise com modelo simulado e RPCs reais locais', () => {
  it('exige credencial e valida contexto antes de pagar ou contar uso', async () => {
    expect((await handleAnalysis(req(undefined, ''), deps)).status).toBe(401);
    expect(
      (
        await handleAnalysis(
          req({ context: { ...analysisCases()[0]!.expected, note: 'canary' } }),
          deps,
        )
      ).status,
    ).toBe(400);
    expect((await handleAnalysis(req({ context: {}, messages: [] }), deps)).status).toBe(400);
    expect(model).not.toHaveBeenCalled();
  });
  it('usa o mesmo orçamento do chat, registra tokens e devolve a estrutura validada', async () => {
    await callRpc(db, claims, 'agent_begin_turn', {}); // chat call
    const response = await handleAnalysis(req(), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...replyCases()[1]!.expected,
      usage: { model: 'claude-haiku-5-5', input_tokens: 1000, output_tokens: 150 },
    });
    expect(
      (
        await db.query<{ messages: number; input_tokens: number; output_tokens: number }>(
          'select messages,input_tokens,output_tokens from public.agent_usage where user_id=$1',
          [user],
        )
      ).rows[0],
    ).toMatchObject({ messages: 2, input_tokens: 1000, output_tokens: 150 });
  });
  it('descarta ajuste desconhecido mas preserva texto e contabiliza a chamada', async () => {
    model.mockResolvedValueOnce({
      stop: 'tool_use',
      input: 100,
      output: 50,
      content: [{ type: 'tool_use', name: 'responder_analise', input: replyCases()[5]!.input }],
    });
    const response = await handleAnalysis(req(), deps);
    expect(response.status).toBe(200);
    expect((await response.json()).adjustment).toBeNull();
  });
  it('recusa resposta truncada, múltiplas ferramentas e falha sem registrar payload', async () => {
    model.mockResolvedValueOnce({
      stop: 'max_tokens',
      input: 100,
      output: 1200,
      content: [{ type: 'tool_use', name: 'responder_analise', input: replyCases()[1]!.input }],
    });
    expect((await handleAnalysis(req(), deps)).status).toBe(502);
    model.mockResolvedValueOnce({
      stop: 'tool_use',
      input: 100,
      output: 30,
      content: [
        { type: 'tool_use', name: 'responder_analise', input: replyCases()[1]!.input },
        { type: 'tool_use', name: 'responder_analise', input: replyCases()[1]!.input },
      ],
    });
    expect((await handleAnalysis(req(), deps)).status).toBe(502);
    model.mockRejectedValueOnce(new Error('secret-canary'));
    const response = await handleAnalysis(req(), deps);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret-canary');
  });
  it('atingir o limite compartilhado impede chamar o modelo', async () => {
    await db.query('update public.agent_usage set messages=60 where user_id=$1', [user]);
    const before = model.mock.calls.length;
    expect((await handleAnalysis(req(), deps)).status).toBe(429);
    expect(model.mock.calls.length).toBe(before);
    await expect(callRpc(db, claims, 'agent_begin_turn', {})).rejects.toThrow();
  });
  it('revisão exige admin antes de reservar uso e compartilha cota e tokens', async () => {
    await db.query(
      'update public.agent_usage set messages=2,input_tokens=0,output_tokens=0 where user_id=$1',
      [user],
    );
    const reviewModel = vi.fn<ReviewDependencies['model']>(async () => ({
      model: 'claude-sonnet-5-5',
      stop: 'tool_use',
      input: 2000,
      output: 1000,
      content: [{ type: 'tool_use', name: 'responder_revisao', input: reviewReply }],
    }));
    const reviewDeps: ReviewDependencies = {
      ...deps,
      model: reviewModel,
      async authorize() {
        return (await callRpc(db, claims, 'is_admin', {})) === true
          ? {}
          : { status: 403, error: 'Revisão disponível só para o dono por enquanto.' };
      },
    };
    const request = () => req({ context: reviewCases()[0]!.expected });
    let response = await handleReview(request(), reviewDeps);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Revisão disponível só para o dono por enquanto.',
    });
    expect(reviewModel).not.toHaveBeenCalled();
    await db.query('insert into public.admins(user_id) values ($1)', [user]);
    expect(
      (
        await handleReview(
          req({ context: { ...reviewCases()[0]!.expected, note: 'secret' } }),
          reviewDeps,
        )
      ).status,
    ).toBe(400);
    response = await handleReview(request(), reviewDeps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...reviewReply,
      usage: { model: 'claude-sonnet-5-5', input_tokens: 2000, output_tokens: 1000 },
    });
    expect(
      (
        await db.query(
          'select messages,input_tokens,output_tokens from public.agent_usage where user_id=$1',
          [user],
        )
      ).rows[0],
    ).toMatchObject({ messages: 3, input_tokens: 2000, output_tokens: 1000 });
    reviewModel.mockResolvedValueOnce({
      stop: 'tool_use',
      input: 100,
      output: 50,
      content: [
        {
          type: 'tool_use',
          name: 'responder_revisao',
          input: { ...reviewReply, ajustes: [{ ...reviewReply.ajustes[0], sets: 99 }] },
        },
      ],
    });
    expect((await (await handleReview(request(), reviewDeps)).json()).ajustes).toEqual([]);
    reviewModel.mockResolvedValueOnce({
      stop: 'max_tokens',
      input: 100,
      output: 8000,
      content: [],
    });
    expect((await handleReview(request(), reviewDeps)).status).toBe(502);
    reviewModel.mockRejectedValueOnce(new Error('private-secret'));
    expect(await (await handleReview(request(), reviewDeps)).text()).not.toContain(
      'private-secret',
    );
    await db.query('update public.agent_usage set messages=60 where user_id=$1', [user]);
    expect((await handleReview(request(), reviewDeps)).status).toBe(429);
    expect((await handleReview(req(undefined, ''), reviewDeps)).status).toBe(401);
  });
});
