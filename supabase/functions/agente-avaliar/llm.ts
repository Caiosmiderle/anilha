// One call to a model, the same shape whatever the provider: the agent and its comparison
// speak this; only this file knows Claude from Gemini. Keys come from the function secrets.
import Anthropic from 'npm:@anthropic-ai/sdk@1.1.0';

export type Provider = 'anthropic' | 'gemini';

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema of the input, with additionalProperties false and every field required. */
  input_schema: Record<string, unknown>;
}

export interface ModelRequest {
  provider: Provider;
  model: string;
  system: string;
  tools: ToolDef[];
  /**
   * Text, or the provider's own blocks when the conversation carries tool calls: Claude's
   * reply goes back exactly as it came (thinking included), then the tool results.
   */
  messages: { role: 'user' | 'assistant'; content: string | unknown[] }[];
  max_tokens?: number;
  /** How much Claude thinks before answering; its default is medium. Gemini ignores it. */
  effort?: 'low' | 'medium' | 'high';
}

export interface ModelReply {
  text: string;
  tool_calls: { name: string; input: unknown }[];
  stop: string;
  usage: { input: number; output: number; cached: number; thinking: number };
  ms: number;
  /** The reply as the provider sent it, to go back in the next turn. */
  assistant: unknown[];
}

const MAX_TOKENS = 4000;

export async function callModel(r: ModelRequest): Promise<ModelReply> {
  const started = Date.now();
  const reply = r.provider === 'anthropic' ? await callClaude(r) : await callGemini(r);
  return { ...reply, ms: Date.now() - started };
}

async function callClaude(r: ModelRequest): Promise<Omit<ModelReply, 'ms'>> {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const res = await client.messages.create({
    model: r.model,
    max_tokens: Math.min(r.max_tokens ?? MAX_TOKENS, MAX_TOKENS),
    // The catalog and the rules are the same in every call: cached after the first.
    system: [{ type: 'text', text: r.system, cache_control: { type: 'ephemeral' } }],
    tools: r.tools.map((t) => ({ ...t, strict: true })),
    messages: r.messages as Anthropic.MessageParam[],
    ...(r.effort ? { output_config: { effort: r.effort } } : {}),
  });
  let text = '';
  const tool_calls: ModelReply['tool_calls'] = [];
  for (const block of res.content) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') tool_calls.push({ name: block.name, input: block.input });
  }
  return {
    text,
    tool_calls,
    stop: res.stop_reason ?? 'unknown',
    usage: {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
      cached: res.usage.cache_read_input_tokens ?? 0,
      thinking: 0,
    },
    assistant: res.content,
  };
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: unknown };
}

async function callGemini(r: ModelRequest): Promise<Omit<ModelReply, 'ms'>> {
  if (r.messages.some((m) => typeof m.content !== 'string')) {
    throw new Error('Gemini: conversa com ferramentas ainda não suportada nesta função');
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: r.system }] },
        contents: r.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content as string }],
        })),
        tools: r.tools.length
          ? [
              {
                functionDeclarations: r.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.input_schema,
                })),
              },
            ]
          : undefined,
        generationConfig: { maxOutputTokens: Math.min(r.max_tokens ?? MAX_TOKENS, MAX_TOKENS) },
      }),
    },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body?.error?.message ?? 'erro'}`);
  const candidate = body.candidates?.[0];
  const parts: GeminiPart[] = candidate?.content?.parts ?? [];
  let text = '';
  const tool_calls: ModelReply['tool_calls'] = [];
  for (const p of parts) {
    if (p.thought) continue;
    if (p.text) text += p.text;
    if (p.functionCall) tool_calls.push({ name: p.functionCall.name, input: p.functionCall.args ?? {} });
  }
  const u = body.usageMetadata ?? {};
  return {
    text,
    tool_calls,
    stop: candidate?.finishReason ?? 'unknown',
    usage: {
      input: u.promptTokenCount ?? 0,
      output: u.candidatesTokenCount ?? 0,
      cached: u.cachedContentTokenCount ?? 0,
      thinking: u.thoughtsTokenCount ?? 0,
    },
    assistant: parts,
  };
}
