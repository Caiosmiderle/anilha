import { describe, expect, it } from 'vitest';
import { routineFor } from '../../data/today';
import { isPlanRoutine, routineOrigin } from '../routines';
import type { RoutineRow } from '../types';

const r = (over: Partial<RoutineRow>): RoutineRow =>
  ({
    id: 'x',
    user_id: 'u',
    updated_at: 1,
    deleted: false,
    name: 'Treino',
    split_key: 'livre',
    position: 0,
    reason: null,
    archived: false,
    ...over,
  }) as RoutineRow;

describe('de onde veio cada treino', () => {
  it('a origem gravada vale', () => {
    expect(
      routineOrigin(r({ origin: 'pessoa', reason: '8 exercícios, 24 séries de trabalho.' })),
    ).toBe('pessoa');
  });

  it('linhas antigas: o mesmo critério da migração', () => {
    expect(routineOrigin(r({ reason: '8 exercícios, 24 séries de trabalho.' }))).toBe('plano');
    expect(routineOrigin(r({ id: 'pronta-abc', reason: 'Ficha pronta do Anilha' }))).toBe('pronta');
    expect(routineOrigin(r({ id: 'recebida-abc', reason: 'Enviada por Lia' }))).toBe('recebida');
    expect(routineOrigin(r({ reason: 'Enviada pelo Anilha' }))).toBe('recebida');
    // "Costa do fildo": made by hand, no reason.
    expect(routineOrigin(r({ name: 'Costa do fildo', split_key: 'puxar' }))).toBe('pessoa');
    expect(isPlanRoutine(r({}))).toBe(false);
  });

  it('o treino da pessoa com o mesmo tipo nunca toma o lugar da ficha do plano', () => {
    const mine = r({ id: 'meu', split_key: 'costas_biceps', origin: 'pessoa', position: 0 });
    const planB = r({ id: 'plano-b', split_key: 'costas_biceps', origin: 'plano', position: 1 });
    expect(routineFor('costas_biceps', [mine, planB])?.id).toBe('plano-b');
    // Without a plan ficha of that type, the person's own is still used.
    expect(routineFor('costas_biceps', [mine])?.id).toBe('meu');
  });
});
