import Anthropic from 'npm:@anthropic-ai/sdk@1.1.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleAnalysis } from './core.ts';

const clientFor = (auth: string) =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
// Admins (public.admins, today only the owner) get Opus 5.5, like the CRUNNING analysis; everyone
// else stays on Haiku 5.5. Opus 5.5 rejects a forced tool_choice, so it gets `auto` with the
// single tool and the system prompt asking for it; the reply is validated the same way.
const HAIKU = 'claude-haiku-5-5';
const OPUS = 'claude-opus-5-5';
Deno.serve((req) => {
  let premium = false;
  return handleAnalysis(req, {
    async begin(auth) {
      const client = clientFor(auth);
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return { status: 401, error: 'Entre na sua conta.' };
      const admin = await client.rpc('is_admin');
      premium = !admin.error && admin.data === true;
      const begin = await client.rpc('agent_begin_turn');
      if (!begin.error) return {};
      return {
        status: begin.error.hint === 'limite' ? 429 : 403,
        error:
          begin.error.hint === 'limite'
            ? 'Você chegou ao limite de hoje. Amanhã tem mais.'
            : 'Não foi possível iniciar a análise.',
      };
    },
    async end(auth, input, output) {
      const { error } = await clientFor(auth).rpc('agent_end_turn', {
        p_input: input,
        p_output: output,
      });
      if (error) throw new Error('usage');
    },
    async model(system, tool, context) {
      const client = new Anthropic({
        apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
        maxRetries: 0,
        timeout: premium ? 120000 : 40000,
      });
      const res = await client.messages.create({
        model: premium ? OPUS : HAIKU,
        // Opus thinks before answering (it cannot be turned off): room for thinking plus the reply.
        max_tokens: premium ? 8000 : 1200,
        system,
        tools: [{ ...(tool as Anthropic.Tool), strict: true }],
        tool_choice: premium
          ? { type: 'auto', disable_parallel_tool_use: true }
          : { type: 'tool', name: 'responder_analise', disable_parallel_tool_use: true },
        messages: [{ role: 'user', content: JSON.stringify(context) }],
      });
      return {
        model: res.model,
        content: res.content,
        input:
          res.usage.input_tokens +
          (res.usage.cache_read_input_tokens ?? 0) +
          (res.usage.cache_creation_input_tokens ?? 0),
        output: res.usage.output_tokens,
        stop: res.stop_reason ?? '',
      };
    },
  });
});
