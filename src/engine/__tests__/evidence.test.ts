import { describe, expect, it } from 'vitest';
import { EXERCISES_BY_ID } from '../exercises';
import { generatePlan, restFor, targetFor, volumeRange } from '../generator';
import type { ExerciseDef, OnboardingParams } from '../types';

/** Gym rules checked against the literature (docs/CIENCIA.md). */
const BASE: OnboardingParams = {
  first_name: 'Ana',
  goal: 'hipertrofia',
  gym_days: 3,
  run_days: 0,
  force_gym_days: false,
  minutes: 60,
  equipment: ['halteres', 'barra', 'polia', 'maquina', 'peso_corporal', 'kettlebell', 'barra_fixa'],
  level: 'intermediario',
  spare_joints: [],
  returning: false,
  time: '06:00',
  split_style: 'grupos',
  fichas: 3,
};
const ex = (id: string) => EXERCISES_BY_ID.get(id) as ExerciseDef;
const ids = (p: OnboardingParams, split: string) =>
  generatePlan(p)
    .routines.find((r) => r.split_key === split)
    ?.items.map((i) => i.exercise_id) ?? [];

describe('academia com base na literatura', () => {
  it('descanso de 2 min nos compostos e 90 s nos isolados (Singer e colegas, 2024)', () => {
    expect(restFor(ex('supino-reto-barra'))).toBe(120);
    expect(restFor(ex('elevacao-lateral'))).toBe(90);
    const items = generatePlan(BASE).routines.flatMap((r) => r.items);
    expect(items.every((i) => i.rest_sec >= 90)).toBe(true);
  });

  it('cadeira flexora antes da mesa (Maeo e colegas, 2021) e tríceps acima da cabeça (2023)', () => {
    const legs = ids(BASE, 'perna');
    expect(legs).toContain('cadeira-flexora');
    expect(legs).not.toContain('mesa-flexora');
    const chest = ids({ ...BASE, minutes: 45 }, 'peito_triceps');
    expect(chest).toContain('triceps-frances');
  });

  it('força com cargas altas: compostos em 5 a 8 repetições', () => {
    expect(targetFor(ex('agachamento-livre'), { ...BASE, goal: 'forca' })).toEqual({
      min: 5,
      max: 8,
    });
    expect(targetFor(ex('agachamento-livre'), BASE)).toEqual({ min: 8, max: 12 });
  });

  it('treino diferente para quem corre só para quem escolhe correr provas como objetivo', () => {
    // The exception: goal "correr provas longas".
    expect(volumeRange('intermediario', false, 'corrida')).toEqual([6, 10]);
    expect(targetFor(ex('agachamento-livre'), { ...BASE, goal: 'corrida' })).toEqual({
      min: 5,
      max: 8,
    });
    // Everyone else who also runs keeps the full gym plan.
    const runsToo = { ...BASE, run_days: 2 };
    expect(volumeRange('intermediario', false, 'hipertrofia')).toEqual([10, 16]);
    expect(generatePlan(runsToo).volume_cap).toBe(generatePlan(BASE).volume_cap);
    expect(targetFor(ex('agachamento-livre'), runsToo)).toEqual({ min: 8, max: 12 });
  });
});
