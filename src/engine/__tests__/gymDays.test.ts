import { describe, expect, it } from 'vitest';
import { generatePlan } from '../generator';
import type { OnboardingParams } from '../types';

/** Gym days picked when setting up the plan: always gym, the rest placed around them. */
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

const gymOf = (p: OnboardingParams) =>
  generatePlan(p)
    .days.filter((d) => d.kind === 'gym')
    .map((d) => d.weekday);

describe('dias de academia', () => {
  it('os dias escolhidos viram academia, na ordem das fichas', () => {
    const plan = generatePlan({ ...BASE, gym_weekdays: [3, 1, 5] });
    const gym = plan.days.filter((d) => d.kind === 'gym');
    expect(gym.map((d) => d.weekday)).toEqual([1, 3, 5]);
    // The first gym day of the week gets ficha A.
    expect(gym.map((d) => d.split_key)).toEqual(['peito_triceps', 'costas_biceps', 'perna']);
    expect(plan.reasons).toContain(
      'Academia na terça, na quinta e no sábado, nos dias que você escolheu.',
    );
  });

  it('corrida fica nos outros dias, e o dia escolhido para correr não vira academia', () => {
    const plan = generatePlan({
      ...BASE,
      run_days: 2,
      gym_weekdays: [0, 2, 4],
      run_weekdays: [5],
    });
    expect(plan.days.filter((d) => d.kind === 'gym').map((d) => d.weekday)).toEqual([0, 2, 4]);
    const runs = plan.days.filter((d) => d.kind === 'run').map((d) => d.weekday);
    expect(runs).toHaveLength(2);
    expect(runs).toContain(5);
    // The same day in both: running wins, the gym goes elsewhere.
    const both = generatePlan({ ...BASE, run_days: 1, gym_weekdays: [1, 3], run_weekdays: [1] });
    expect(both.days[1]?.kind).toBe('run');
    expect(both.days[3]?.kind).toBe('gym');
  });

  it('escolher só uma parte: o resto o app encaixa e explica', () => {
    const plan = generatePlan({ ...BASE, gym_weekdays: [5] });
    const gym = plan.days.filter((d) => d.kind === 'gym').map((d) => d.weekday);
    expect(gym).toHaveLength(3);
    expect(gym).toContain(5);
    expect(plan.reasons.some((r) => r.includes('O sábado você escolheu;'))).toBe(true);
    expect(plan.reasons.some((r) => r.includes('eu encaixei.'))).toBe(true);
  });

  it('5 escolhidos com a sugestão de 4: um dos escolhidos vira descanso e o porquê diz qual', () => {
    const plan = generatePlan({ ...BASE, gym_days: 5, fichas: 4, gym_weekdays: [0, 1, 2, 3, 4] });
    const gym = plan.days.filter((d) => d.kind === 'gym').map((d) => d.weekday);
    expect(gym).toHaveLength(4);
    expect(gym.every((d) => d <= 4)).toBe(true);
    const dropped = [0, 1, 2, 3, 4].find((d) => !gym.includes(d));
    expect(dropped).toBeDefined();
    expect(plan.reasons.some((r) => r.includes('ficou de descanso.'))).toBe(true);
    // Forcing 5: all five stay.
    expect(
      gymOf({
        ...BASE,
        gym_days: 5,
        fichas: 4,
        force_gym_days: true,
        gym_weekdays: [0, 1, 2, 3, 4],
      }),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it('com foco em pernas, o primeiro dia escolhido é de perna', () => {
    const plan = generatePlan({
      ...BASE,
      focus: 'pernas',
      fichas: 4,
      gym_days: 4,
      gym_weekdays: [1, 2, 4, 6],
    });
    expect(plan.days.filter((d) => d.kind === 'gym').map((d) => d.split_key)).toEqual([
      'anterior',
      'superiores',
      'posterior',
      'gluteos',
    ]);
    expect(plan.days[1]?.split_key).toBe('anterior');
  });

  it('dia inválido e repetido são ignorados; sem escolha, igual a antes', () => {
    expect(gymOf({ ...BASE, gym_weekdays: [9, 2, 2, -1] })).toContain(2);
    expect(gymOf({ ...BASE, gym_weekdays: [] })).toEqual(gymOf(BASE));
    expect(generatePlan({ ...BASE, gym_weekdays: [] }).reasons).toEqual(generatePlan(BASE).reasons);
  });
});
