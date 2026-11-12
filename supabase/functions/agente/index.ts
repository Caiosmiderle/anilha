// Supabase Edge Function (Deno): the training assistant. The phone sends the conversation,
// with the results of the tools it ran on the person's own data; this checks the account
// and today's limit (agent_begin_turn), calls Claude with the instructions and tools fixed
// here and returns the reply. Nothing of the conversation is stored on the server.
import Anthropic from 'npm:@anthropic-ai/sdk@1.1.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SYSTEM, TOOLS } from './config.ts';

const MODEL = 'claude-haiku-5-5';
const MAX_BODY = 200_000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Entre na sua conta' }, 401);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'Conversa longa demais: comece outra' }, 413);
  let messages: Anthropic.MessageParam[];
  try {
    messages = (JSON.parse(raw) as { messages: Anthropic.MessageParam[] }).messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 40) throw new Error();
  } catch {
    return json({ error: 'Pedido inválido' }, 400);
  }

  // As the person: the database checks the beta and the limit with their own login.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
  const begin = await supabase.rpc('agent_begin_turn');
  if (begin.error) {
    const limit = begin.error.hint === 'limite';
    return json(
      { error: limit ? 'Você chegou ao limite de hoje. Amanhã tem mais.' : begin.error.message },
      limit ? 429 : 403,
    );
  }

  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  let res: Anthropic.Message;
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // The catalog and the rules are the same in every call: cached after the first.
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: (TOOLS as unknown as Anthropic.Tool[]).map((t) => ({ ...t, strict: true })),
      messages,
    });
  } catch (err) {
    console.error('agente: modelo', (err as Error).message);
    return json({ error: 'O assistente não respondeu agora. Tente de novo em instantes.' }, 502);
  }

  await supabase.rpc('agent_end_turn', {
    p_input: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0),
    p_output: res.usage.output_tokens,
  });

  let text = '';
  for (const block of res.content) if (block.type === 'text') text += block.text;
  if (res.stop_reason === 'refusal' && !text) {
    text = 'Com isso eu não consigo ajudar aqui. Posso ajudar com o seu treino.';
  }
  return json({ text, stop: res.stop_reason ?? 'unknown', assistant: res.content });
});
