import Anthropic from 'npm:@anthropic-ai/sdk@1.1.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleReview } from './core.ts';
const clientFor = (auth: string) =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
Deno.serve((req) =>
  handleReview(req, {
    async authorize(auth) {
      const client = clientFor(auth);
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return { status: 401, error: 'Entre na sua conta.' };
      const admin = await client.rpc('is_admin');
      return !admin.error && admin.data === true
        ? {}
        : { status: 403, error: 'Revisão disponível só para o dono por enquanto.' };
    },
    async begin(auth) {
      const { error } = await clientFor(auth).rpc('agent_begin_turn');
      return !error
        ? {}
        : {
            status: error.hint === 'limite' ? 429 : 403,
            error:
              error.hint === 'limite'
                ? 'Você chegou ao limite de hoje. Amanhã tem mais.'
                : 'Não foi possível iniciar a revisão.',
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
        timeout: 120000,
      });
      const res = await client.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 8000,
        system,
        tools: [{ ...(tool as Anthropic.Tool), strict: true }],
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
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
  }),
);
