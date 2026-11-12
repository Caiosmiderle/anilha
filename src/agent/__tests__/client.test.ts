import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnilhaDB } from '../../data/db';
import { setCurrent } from '../../data/store';
import type { AgentContext } from '../context';

vi.mock('../../sync/client', () => ({ getClient: vi.fn() }));
vi.mock('../execute', () => ({ executeTool: vi.fn() }));
const { getClient } = await import('../../sync/client');
const { executeTool } = await import('../execute');
const { runTurn } = await import('../client');
const invoke = vi.fn();
const getSession = vi.fn();
const ctx = {} as AgentContext;
const owner = { db: {} as AnilhaDB, userId: 'a' };

beforeEach(() => {
  vi.clearAllMocks();
  setCurrent(owner);
  getSession.mockResolvedValue({
    data: { session: { user: { id: 'a' }, access_token: 'token-a' } },
  });
  vi.mocked(getClient).mockResolvedValue({ auth: { getSession }, functions: { invoke } } as never);
});

afterEach(() => setCurrent(null));

describe('turnos do assistente: cancelamento e conta', () => {
  it('não envia contexto se o turno já foi cancelado', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runTurn([], 'pedido', ctx, false, vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('não executa ferramentas nem continua a conversa após cancelar a chamada em andamento', async () => {
    const controller = new AbortController();
    invoke.mockImplementationOnce(async () => {
      controller.abort();
      return {
        data: {
          text: '',
          stop: 'tool_use',
          assistant: [{ type: 'tool_use', id: 't1', name: 'nova_ficha', input: {} }],
        },
        error: null,
      };
    });
    await expect(
      runTurn([], 'pedido', ctx, false, vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('recusa a sessão B quando o contexto local pertence à conta A', async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'b' }, access_token: 'token-b' } },
    });
    await expect(runTurn([], 'pedido privado', ctx, false, vi.fn())).rejects.toThrow(
      'A conta mudou',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('fixa o token da conta e descarta resposta recebida depois de sair', async () => {
    invoke.mockImplementationOnce(async (_fn, options) => {
      expect(options.headers.Authorization).toBe('Bearer token-a');
      setCurrent(null);
      return { data: { text: 'resposta', stop: 'end_turn', assistant: [] }, error: null };
    });
    await expect(runTurn([], 'pedido privado', ctx, false, vi.fn())).rejects.toThrow(
      'A conta mudou',
    );
    expect(executeTool).not.toHaveBeenCalled();
  });
});
