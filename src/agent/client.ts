import { getClient } from '../sync/client';
import { currentStore, type CurrentStore } from '../data/store';
import { contextText, type AgentContext } from './context';
import { executeTool, type Proposal } from './execute';

/** A message as the model sees it: text, or the blocks of a turn with tools. */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string | unknown[];
}

interface Reply {
  text: string;
  stop: string;
  assistant: unknown[];
}

interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** What the screen shows while the assistant works: the real step, never a made-up one. */
export type Stage = { kind: 'lendo' } | { kind: 'ferramenta'; tool: string };

export interface TurnResult {
  messages: AgentMessage[];
  /** The message for the person. */
  text: string;
  proposals: Proposal[];
  /** For the queue: the highest level the tools reached (0 a plain answer). */
  level: 0 | 1 | 2 | 3;
  request: { pedido: string; categoria: string } | null;
  tools: string[];
}

export class AgentError extends Error {}

async function callAgent(
  messages: AgentMessage[],
  owner: CurrentStore | null,
  signal?: AbortSignal,
): Promise<Reply> {
  signal?.throwIfAborted();
  const client = await getClient();
  const { data: auth } = await client.auth.getSession();
  signal?.throwIfAborted();
  if (!owner || currentStore() !== owner || auth.session?.user.id !== owner.userId)
    throw new AgentError('A conta mudou. Abra o assistente novamente.');
  const { data, error } = await client.functions.invoke<Reply>('agente', {
    body: { messages },
    headers: { Authorization: `Bearer ${auth.session.access_token}` },
    signal,
    timeout: 45_000,
  });
  signal?.throwIfAborted();
  if (currentStore() !== owner) throw new AgentError('A conta mudou. Abra o assistente novamente.');
  if (error) {
    // The function says why in plain words (limit, beta, model down): show that.
    let message = 'O assistente não respondeu agora. Tente de novo em instantes.';
    const ctx = (error as { context?: Response }).context;
    try {
      const body = (await ctx?.json()) as { error?: string } | undefined;
      if (body?.error) message = body.error;
    } catch {
      // No body: the generic message stays.
    }
    throw new AgentError(message);
  }
  if (!data) throw new AgentError('O assistente não respondeu agora. Tente de novo em instantes.');
  return data;
}

/**
 * One request of the person, the whole way: the model calls tools, they run here on the
 * person's data, the results go back, until the model writes to the person. The context
 * goes with the first message, and again after anything was saved.
 */
export async function runTurn(
  history: AgentMessage[],
  ask: string,
  ctx: AgentContext,
  withContext: boolean,
  onStage: (s: Stage) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const owner = currentStore();
  const messages: AgentMessage[] = [
    ...history,
    { role: 'user', content: withContext ? `${contextText(ctx)}\n\nPedido: ${ask}` : ask },
  ];
  const proposals: Proposal[] = [];
  const tools: string[] = [];
  let level: TurnResult['level'] = 0;
  let request: TurnResult['request'] = null;
  onStage({ kind: 'lendo' });
  for (let round = 0; round < 4; round += 1) {
    const reply = await callAgent(messages, owner, signal);
    signal?.throwIfAborted();
    messages.push({ role: 'assistant', content: reply.assistant });
    const uses = reply.assistant.filter(
      (b): b is ToolUse => (b as { type?: string }).type === 'tool_use',
    );
    if (reply.stop !== 'tool_use' || !uses.length) {
      return { messages, text: reply.text, proposals, level, request, tools };
    }
    const results = uses.map((u) => {
      tools.push(u.name);
      onStage({ kind: 'ferramenta', tool: u.name });
      const out = executeTool(u.name, u.input, ctx);
      if (out.proposal) proposals.push(out.proposal);
      if (out.level > level) level = out.level;
      if (out.request) request = out.request;
      return { type: 'tool_result', tool_use_id: u.id, content: out.result };
    });
    messages.push({ role: 'user', content: results });
  }
  // Four rounds of tools without a word for the person: never leave them without an answer.
  return {
    messages,
    text: proposals.length
      ? 'Montei a proposta abaixo. Revise e toque em Salvar se estiver de acordo.'
      : 'Não consegui fechar uma resposta agora. Pode pedir de outro jeito?',
    proposals,
    level,
    request,
    tools,
  };
}
