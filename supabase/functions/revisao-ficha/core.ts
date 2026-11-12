import {
  REVIEW_SYSTEM,
  reviewTool,
  CATALOG_IDS,
  CATALOG_NAMES,
  parseReviewReply,
  validReviewContext,
} from './contract.generated.ts';
import type { AnalysisDependencies } from '../analise-treino/core.ts';

export interface ReviewDependencies extends AnalysisDependencies {
  authorize(auth: string): Promise<{ status?: number; error?: string }>;
}
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
export async function handleReview(req: Request, deps: ReviewDependencies): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer \S+$/.test(auth)) return json({ error: 'Entre na sua conta.' }, 401);
  try {
    const access = await deps.authorize(auth);
    if (access.error) return json({ error: access.error }, access.status ?? 403);
    const raw = await req.text();
    if (raw.length > 60000) return json({ error: 'Ficha grande demais para revisar.' }, 413);
    let context: unknown;
    try {
      const body = JSON.parse(raw);
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        !validReviewContext(body.context, CATALOG_NAMES)
      )
        throw new Error();
      context = body.context;
    } catch {
      return json({ error: 'Contexto inválido para revisão.' }, 400);
    }
    const begin = await deps.begin(auth);
    if (begin.error) return json({ error: begin.error }, begin.status ?? 403);
    const result = await deps.model(REVIEW_SYSTEM, reviewTool(CATALOG_IDS), context);
    await deps.end(auth, result.input, result.output);
    const calls = result.content.filter((b) => b.type === 'tool_use');
    const reply =
      result.stop === 'tool_use' && calls.length === 1 && calls[0]?.name === 'responder_revisao'
        ? parseReviewReply(
            calls[0].input,
            (context as { items: unknown[] }).items.length,
            CATALOG_IDS,
          )
        : null;
    if (!reply) return json({ error: 'A revisão não foi concluída. Tente novamente.' }, 502);
    return json({
      ...reply,
      usage: {
        model: result.model ?? 'claude-sonnet-5-5',
        input_tokens: result.input,
        output_tokens: result.output,
      },
    });
  } catch {
    return json({ error: 'Não foi possível revisar agora. Tente novamente mais tarde.' }, 502);
  }
}
