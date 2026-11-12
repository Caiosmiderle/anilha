import Anthropic from 'npm:@anthropic-ai/sdk@1.1.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleAnalysis } from './core.ts';

const clientFor = (auth: string) =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
Deno.serve((req) =>
  handleAnalysis(req, {
    async begin(auth) {
      const client = clientFor(auth);
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return { status: 401, error: 'Entre na sua conta.' };
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
        timeout: 40000,
      });
      const res = await client.messages.create({
        model: 'claude-haiku-5-5',
        max_tokens: 1200,
        system,
        tools: [{ ...(tool as Anthropic.Tool), strict: true }],
        tool_choice: { type: 'tool', name: 'responder_analise', disable_parallel_tool_use: true },
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
