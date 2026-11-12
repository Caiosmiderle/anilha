// Supabase Edge Function (Deno), internal use: the comparison of models for the agent.
// The script in scripts/agente-avaliar.ts sends each test request here; this calls Claude
// or Gemini with the keys from the secrets and returns the normalized reply. No app user
// calls it: only who holds the evaluation token (its SHA-256 is below, the token is not).
// Body {"ping": true} only checks that both keys answer.
import { callModel, type ModelRequest } from './llm.ts';

const TOKEN_SHA256 = 'd58463e9898f535b213a996269bea1064e6d1eca6b866aa0e7a32d9cca6dd13e';
const MODELS = new Set([
  'claude-haiku-5-5',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
]);
const EFFORTS = new Set(['low', 'medium', 'high']);

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function ping(provider: ModelRequest['provider'], model: string) {
  try {
    const r = await callModel({
      provider,
      model,
      system: 'Responda só com a palavra ok.',
      tools: [],
      messages: [{ role: 'user', content: 'Teste.' }],
      max_tokens: 1000,
    });
    return { ok: true, model, text: r.text.trim().slice(0, 40), ms: r.ms };
  } catch (err) {
    return { ok: false, model, error: (err as Error).message.slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);
  if ((await sha256(req.headers.get('x-eval-token') ?? '')) !== TOKEN_SHA256) {
    return json({ error: 'proibido' }, 403);
  }
  let body: (Partial<ModelRequest> & { ping?: boolean }) | null = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'corpo inválido' }, 400);
  }
  if (body?.ping) {
    const [claude, gemini] = await Promise.all([
      ping('anthropic', 'claude-haiku-5-5'),
      ping('gemini', 'gemini-3.5-flash-lite'),
    ]);
    return json({ claude, gemini });
  }
  if (!body?.provider || !body.model || !MODELS.has(body.model) || !body.messages?.length) {
    return json({ error: 'pedido incompleto ou modelo fora da lista' }, 400);
  }
  try {
    return json(
      await callModel({
        provider: body.provider,
        model: body.model,
        system: body.system ?? '',
        tools: body.tools ?? [],
        messages: body.messages,
        max_tokens: body.max_tokens,
        effort: body.effort && EFFORTS.has(body.effort) ? body.effort : undefined,
      }),
    );
  } catch (err) {
    return json({ error: (err as Error).message.slice(0, 500) }, 502);
  }
});
