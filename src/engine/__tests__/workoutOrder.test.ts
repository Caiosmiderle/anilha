import { describe, expect, it } from 'vitest';
import { moveInWorkout } from '../workoutOrder';

const item = (id: string, pending: boolean, superset: string | null = null) => ({
  id,
  pending,
  superset,
});

describe('ordem do treino em andamento', () => {
  // Supino done; puxada in progress; then remada, rosca and tríceps.
  const items = [
    item('supino', false),
    item('puxada', true),
    item('remada', true),
    item('rosca', true),
    item('triceps', true),
  ];

  it('deixar para o fim: o aparelho está ocupado, volta depois dos outros', () => {
    expect(moveInWorkout(items, 'puxada', 'fim')).toEqual([
      'supino',
      'remada',
      'rosca',
      'triceps',
      'puxada',
    ]);
  });

  it('fazer agora: passa para a frente do que está em andamento, depois do que já foi', () => {
    expect(moveInWorkout(items, 'triceps', 'agora')).toEqual([
      'supino',
      'triceps',
      'puxada',
      'remada',
      'rosca',
    ]);
  });

  it('bi-set anda junto, na sua ordem', () => {
    const paired = [
      item('supino', true),
      item('rosca', true, 'a'),
      item('triceps', true, 'a'),
      item('remada', true),
    ];
    expect(moveInWorkout(paired, 'triceps', 'fim')).toEqual([
      'supino',
      'remada',
      'rosca',
      'triceps',
    ]);
    expect(moveInWorkout(paired, 'rosca', 'agora')).toEqual([
      'rosca',
      'triceps',
      'supino',
      'remada',
    ]);
  });

  it('exercício que não existe: nada muda', () => {
    expect(moveInWorkout(items, 'agachamento', 'fim')).toEqual(items.map((i) => i.id));
  });
});
