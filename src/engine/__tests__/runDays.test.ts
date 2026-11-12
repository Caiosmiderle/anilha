import { describe, expect, it } from 'vitest';
import { generatePlan, layoutWeek } from '../generator';
import { legsBeforeRunDays, swapPlanDays } from '../planEdit';
import type { OnboardingParams, PlanDay } from '../types';

const BASE: OnboardingParams = {
  first_name: 'Ana',
  goal: 'hipertrofia',
  gym_days: 3,
  run_days: 2,
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

const runsOf = (p: OnboardingParams) =>
  generatePlan(p)
    .days.filter((d) => d.kind === 'run')
    .map((d) => d.weekday);

describe('dias de corrida', () => {
  it('os dias escolhidos viram corrida e a academia se encaixa em volta', () => {
    // Terça e sábado.
    const plan = generatePlan({ ...BASE, run_weekdays: [1, 5] });
    expect(plan.days.filter((d) => d.kind === 'run').map((d) => d.weekday)).toEqual([1, 5]);
    expect(plan.days.filter((d) => d.kind === 'gym')).toHaveLength(3);
    expect(plan.reasons.some((r) => r.includes('nos dias que você escolheu'))).toBe(true);
  });

  it('escolher só um de dois: o outro o app distribui', () => {
    const runs = runsOf({ ...BASE, run_weekdays: [3] });
    expect(runs).toHaveLength(2);
    expect(runs).toContain(3);
  });

  it('dias a mais que corridas ficam só os primeiros; dia inválido é ignorado', () => {
    expect(runsOf({ ...BASE, run_days: 1, run_weekdays: [2, 4, 9] })).toEqual([2]);
  });

  it('sem escolha, igual a antes', () => {
    expect(runsOf({ ...BASE, run_weekdays: [] })).toEqual(runsOf(BASE));
  });

  it('layout respeita os dias fixos mesmo apertado', () => {
    const l = layoutWeek(['peito_triceps', 'costas_biceps', 'perna'], 4, false, true, [0, 1, 2, 3]);
    expect(l?.run).toEqual([true, true, true, true, false, false, false]);
  });
});

describe('trocar dias no plano', () => {
  it('a corrida vai para o outro dia e o que estava lá vem para cá', () => {
    const days = generatePlan({ ...BASE, run_weekdays: [1, 5] }).days;
    const thursday = days[3];
    const swapped = swapPlanDays(days, 1, 3);
    expect(swapped[3]).toMatchObject({ weekday: 3, kind: 'run', run_type: days[1]?.run_type });
    expect(swapped[1]).toMatchObject({ ...thursday, weekday: 1 });
    expect(swapped.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(swapPlanDays(days, 2, 2)).toBe(days);
  });

  it('aponta perna na véspera de corrida depois da troca', () => {
    const day = (weekday: number, kind: PlanDay['kind'], split: PlanDay['split_key'] = null) => ({
      weekday,
      kind,
      split_key: split,
      run_type: kind === 'run' ? ('leve' as const) : null,
      time: '06:00',
    });
    const days: PlanDay[] = [
      day(0, 'gym', 'perna'),
      day(1, 'rest'),
      day(2, 'run'),
      day(3, 'gym', 'peito_triceps'),
      day(4, 'rest'),
      day(5, 'gym', 'costas_biceps'),
      day(6, 'rest'),
    ];
    expect(legsBeforeRunDays(days)).toHaveLength(0);
    // Wednesday's run to Tuesday: right after the leg day.
    expect(legsBeforeRunDays(swapPlanDays(days, 2, 1)).map((d) => d.weekday)).toEqual([0]);
  });
});
