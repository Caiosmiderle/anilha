import { describe, expect, it } from 'vitest';
import { EXERCISES_BY_ID } from '../exercises';
import { fichasFor, generatePlan, suggestedSplit, volumeGroupOf, withSplit } from '../generator';
import type { OnboardingParams } from '../types';

/**
 * Legs focus: the lower body split in front of the thigh, back of the thigh and glutes,
 * each a ficha of its own, plus the upper body. The first workout is legs.
 */
const BASE: OnboardingParams = {
  first_name: 'Bia',
  goal: 'hipertrofia',
  gym_days: 4,
  run_days: 0,
  force_gym_days: false,
  minutes: 60,
  equipment: ['halteres', 'barra', 'polia', 'maquina', 'peso_corporal', 'kettlebell', 'barra_fixa'],
  level: 'intermediario',
  spare_joints: [],
  returning: false,
  time: '18:00',
  split_style: 'grupos',
  fichas: 4,
  focus: 'pernas',
};

const ids = (plan: ReturnType<typeof generatePlan>, split: string) =>
  plan.routines.find((r) => r.split_key === split)?.items.map((i) => i.exercise_id) ?? [];

describe('foco em pernas e glúteos', () => {
  it('anterior, parte de cima, posterior e glúteos; com 3 e 5 fichas também', () => {
    expect(fichasFor('grupos', 4, 4, 'pernas')).toEqual([
      'anterior',
      'superiores',
      'posterior',
      'gluteos',
    ]);
    expect(fichasFor('grupos', 3, 3, 'pernas')).toEqual([
      'anterior',
      'superiores',
      'posterior_gluteos',
    ]);
    expect(fichasFor('grupos', 5, 5, 'pernas')).toEqual([
      'anterior',
      'superiores',
      'posterior',
      'superiores_b',
      'gluteos',
    ]);
    // Upper and lower with the legs focus: two days of legs and two of upper body.
    expect(fichasFor('superior_inferior', 0, 4, 'pernas')).toEqual([
      'anterior',
      'superiores',
      'posterior_gluteos',
      'superiores_b',
    ]);
    // Without the focus, nothing changes.
    expect(fichasFor('grupos', 3, 3)).toEqual(['peito_triceps', 'costas_biceps', 'perna']);
  });

  it('sugere 4 fichas com 3 dias ou mais, e corpo inteiro com até 2', () => {
    expect(suggestedSplit(3, 'pernas')).toEqual({ style: 'grupos', fichas: 4 });
    expect(suggestedSplit(2, 'pernas')).toEqual({ style: 'corpo_inteiro', fichas: 2 });
    // Without the focus, 3 days is the whole body (balance.test.ts).
    expect(suggestedSplit(3)).toEqual({ style: 'corpo_inteiro', fichas: 2 });
  });

  it('o primeiro treino da semana é de perna e cada ficha tem o seu foco', () => {
    const plan = generatePlan(BASE);
    const firstGym = plan.days.find((d) => d.kind === 'gym');
    expect(firstGym?.split_key).toBe('anterior');
    expect(plan.routines.map((r) => r.name)).toEqual([
      'Ficha A: Anterior de coxa',
      'Ficha B: Parte de cima',
      'Ficha C: Posterior de coxa',
      'Ficha D: Glúteos',
    ]);
    expect(ids(plan, 'anterior')).toContain('cadeira-extensora');
    expect(ids(plan, 'posterior')).toEqual(expect.arrayContaining(['stiff', 'mesa-flexora']));
    expect(ids(plan, 'gluteos')).toEqual(
      expect.arrayContaining(['elevacao-pelvica', 'cadeira-abdutora']),
    );
    // Each day opens with its own muscle.
    expect(ids(plan, 'posterior')[0]).toBe('stiff');
    expect(ids(plan, 'gluteos')[0]).toBe('elevacao-pelvica');
    // The upper-body ficha has no leg exercise.
    expect(
      ids(plan, 'superiores').every((id) => EXERCISES_BY_ID.get(id)?.primary_group !== 'pernas'),
    ).toBe(true);
    expect(plan.reasons[0]).toContain('Foco em pernas e glúteos');
  });

  it('pernas ganham espaço no volume sem passar do teto mais alto', () => {
    const plan = generatePlan(BASE);
    const balanced = generatePlan({ ...BASE, focus: 'equilibrado', fichas: 4 });
    const lower = (p: ReturnType<typeof generatePlan>) =>
      (p.volume.quadriceps ?? 0) + (p.volume.posteriores ?? 0);
    expect(lower(plan)).toBeGreaterThan(lower(balanced));
    expect(plan.volume.posteriores ?? 0).toBeLessThanOrEqual(plan.volume_cap + 4);
    expect(plan.volume.quadriceps ?? 0).toBeLessThanOrEqual(plan.volume_cap + 4);
  });

  it('corpo inteiro com foco abre com perna e tem glúteo nos dois treinos', () => {
    const plan = generatePlan({ ...BASE, gym_days: 2, split_style: 'corpo_inteiro', fichas: 2 });
    for (const r of plan.routines) {
      const groups = r.items.map((i) => EXERCISES_BY_ID.get(i.exercise_id));
      const lowerCount = groups.filter((e) => e?.primary_group === 'pernas').length;
      expect(lowerCount).toBeGreaterThanOrEqual(3);
      expect(groups.some((e) => e && volumeGroupOf(e) === 'posteriores')).toBe(true);
    }
  });
});

describe('foco em pernas com 60 anos ou mais: a parte de cima segue 2 vezes por semana', () => {
  it('sugere superior e inferior com mais perna a partir de 4 dias, e corpo inteiro até 3', () => {
    expect(suggestedSplit(4, 'pernas', true)).toEqual({ style: 'superior_inferior', fichas: 4 });
    expect(suggestedSplit(3, 'pernas', true)).toEqual({ style: 'corpo_inteiro', fichas: 2 });
    // Younger: legs in parts, three days of legs with 4 days.
    expect(suggestedSplit(4, 'pernas')).toEqual({ style: 'grupos', fichas: 4 });
  });

  it('no plano, cada grupo de cima tem pelo menos 6 séries por semana', () => {
    const plan = generatePlan(
      withSplit({ ...BASE, split_style: undefined, focus: ['pernas'], age_range: '60+' }, false),
    );
    for (const g of ['peito', 'costas', 'ombros'] as const) {
      expect(plan.volume[g] ?? 0).toBeGreaterThanOrEqual(6);
    }
    expect(plan.reasons.join(' ')).toMatch(/A parte de cima treina 2 vezes por semana/);
  });

  it('60 ou mais que escolheu pernas por partes: o plano explica que o ideal são 2 dias', () => {
    const plan = generatePlan({ ...BASE, focus: ['pernas'], age_range: '60+' });
    expect(plan.reasons.join(' ')).toMatch(/Com 60 anos ou mais, o ideal são 2/);
  });
});
