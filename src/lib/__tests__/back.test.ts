import { describe, expect, it } from 'vitest';
import { isBackSwipe, parentOf } from '../back';

describe('voltar', () => {
  it('abas não têm voltar; telas de dentro voltam para a mãe', () => {
    for (const tab of ['/', '/plano', '/historico', '/amigos', '/voce'])
      expect(parentOf(tab)).toBeNull();
    expect(parentOf('/plano/rotina/abc')).toBe('/plano');
    expect(parentOf('/historico/treino/abc')).toBe('/historico');
    expect(parentOf('/exercicios')).toBe('/plano');
    expect(parentOf('/exercicios/supino-reto')).toBe('/exercicios');
    expect(parentOf('/amigos/abc')).toBe('/amigos');
    expect(parentOf('/amigos/abc/fichas')).toBe('/amigos/abc');
    expect(parentOf('/amigos/grupo/abc')).toBe('/amigos');
    expect(parentOf('/convite/XYZ123')).toBe('/amigos');
    expect(parentOf('/avisos')).toBe('/');
    expect(parentOf('/ajustes')).toBe('/voce');
    expect(parentOf('/mensagens')).toBe('/voce');
    expect(parentOf('/admin')).toBe('/voce');
    expect(parentOf('/plano/fichas-prontas')).toBe('/plano');
  });

  it('arrastar da borda esquerda para o lado volta; rolar a tela não', () => {
    expect(isBackSwipe({ x: 6, y: 400 }, { x: 120, y: 410 })).toBe(true);
    // Away from the edge: a horizontal list, not a back gesture.
    expect(isBackSwipe({ x: 60, y: 400 }, { x: 200, y: 400 })).toBe(false);
    // Too short.
    expect(isBackSwipe({ x: 6, y: 400 }, { x: 50, y: 400 })).toBe(false);
    // Mostly vertical: scrolling.
    expect(isBackSwipe({ x: 6, y: 400 }, { x: 90, y: 600 })).toBe(false);
  });
});
