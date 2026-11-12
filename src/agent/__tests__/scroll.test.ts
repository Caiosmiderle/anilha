import { describe, expect, it } from 'vitest';
import { isNearConversationEnd } from '../scroll';

describe('posição de leitura da conversa', () => {
  it.each([
    [1000, 600, 400, true],
    [1000, 521, 400, true],
    [1000, 520, 400, true],
    [1000, 519, 400, false],
    [1000, 0, 400, false],
    [300, 0, 400, true],
    [0, 0, 0, true],
    [1000, 610, 400, true],
    [300, -50, 400, true],
    [1000, -50, 400, false],
  ])(
    'altura %i, posição %i, janela %i: acompanha %s',
    (scrollHeight, scrollTop, clientHeight, expected) => {
      expect(isNearConversationEnd({ scrollHeight, scrollTop, clientHeight })).toBe(expected);
    },
  );

  it('permite um limite explícito sem arredondar a posição', () => {
    expect(
      isNearConversationEnd({ scrollHeight: 1000, scrollTop: 599.5, clientHeight: 400 }, 0),
    ).toBe(false);
    expect(
      isNearConversationEnd({ scrollHeight: 1000, scrollTop: 599.5, clientHeight: 400 }, 1),
    ).toBe(true);
  });
});
