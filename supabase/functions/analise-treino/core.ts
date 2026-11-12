import {
  ANALYSIS_SYSTEM,
  analysisTool,
  CATALOG_IDS,
  CATALOG_NAMES,
  parseReply,
  validContext,
} from './contract.generated.ts';

export interface AnalysisDependencies {
  /** Both RPCs run with the caller JWT, never a service key. */
  begin(auth: string): Promise<{ status?: number; error?: string }>;
  end(auth: string, input: number, output: number): Promise<void>;
  model(
    system: string,
    tool: unknown,
    context: unknown,
  ): Promise<{
    content: { type: string; name?: string; input?: unknown }[];
    input: number;
    output: number;
    stop: string;
  }>;
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
export async function handleAnalysis(req: Request, deps: AnalysisDependencies): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer \S+$/.test(auth)) return json({ error: 'Entre na sua conta.' }, 401);
  const raw = await req.text();
  if (raw.length > 120000) return json({ error: 'Sessão grande demais para analisar.' }, 413);
  let context: unknown;
  try {
    const body = JSON.parse(raw);
    if (Object.keys(body).length !== 1 || !validContext(body.context, CATALOG_NAMES))
      throw new Error();
    context = body.context;
  } catch {
    return json({ error: 'Contexto inválido para análise.' }, 400);
  }
  const begin = await deps.begin(auth);
  if (begin.error) return json({ error: begin.error }, begin.status ?? 403);
  try {
    const result = await deps.model(ANALYSIS_SYSTEM, analysisTool(CATALOG_IDS), context);
    await deps.end(auth, result.input, result.output);
    const tools = result.content.filter((b) => b.type === 'tool_use');
    const reply =
      result.stop === 'tool_use' && tools.length === 1 && tools[0]?.name === 'responder_analise'
        ? parseReply(tools[0].input, (context as { items: unknown[] }).items.length, CATALOG_IDS)
        : null;
    if (!reply) return json({ error: 'O Waltér não concluiu a análise. Tente novamente.' }, 502);
    return json(reply);
  } catch {
    // No SDK errors, request payloads or model content in logs.
    return json({ error: 'O Waltér não respondeu agora. Tente novamente mais tarde.' }, 502);
  }
}
