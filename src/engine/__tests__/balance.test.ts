import { describe, expect, it } from 'vitest';
import {
  FOCUS_GROUPS,
  focusesOf,
  generatePlan,
  restFor,
  splitFocus,
  suggestedSplit,
  targetFor,
  volumeRange,
  type FocusGroup,
} from '../generator';
import type { ExerciseDef, OnboardingParams, TrainingFocus } from '../types';

/**
 * The default plan with no focus is balanced across the week, and a focus weighs for real:
 * more weekly sets for its groups, and no group of the balanced week left out. Gender and
 * age only fine-tune.
 */
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
  time: '18:00',
  focus: ['equilibrado'],
};

/** As the onboarding does: the suggested split unless one is given. */
function plan(over: Partial<OnboardingParams> = {}) {
  const p = { ...BASE, ...over };
  const s = suggestedSplit(p.gym_days, splitFocus(p));
  return generatePlan({
    ...p,
    split_style: over.split_style ?? s.style,
    fichas: over.fichas ?? s.fichas,
  });
}

const UPPER = ['peito', 'costas', 'ombros', 'biceps', 'triceps'] as const;
const LOWER = ['quadriceps', 'posteriores'] as const;
const sum = (v: Partial<Record<string, number>>, gs: readonly string[]) =>
  gs.reduce((a, g) => a + (v[g] ?? 0), 0);

describe('sem foco, a semana é equilibrada', () => {
  it('a divisão sugerida deixa a ficha A, B, C (dois dias de cima para um de perna)', () => {
    expect(suggestedSplit(3)).toEqual({ style: 'corpo_inteiro', fichas: 2 });
    expect(suggestedSplit(4)).toEqual({ style: 'superior_inferior', fichas: 3 });
    // The old default, for the record: legs had well under half of the upper body.
    const old = plan({ split_style: 'grupos', fichas: 3 });
    expect(sum(old.volume, LOWER) / sum(old.volume, UPPER)).toBeLessThan(0.45);
  });

  it.each([2, 3, 4, 5])('%i dias: pernas com metade ou mais do volume de cima, e core', (days) => {
    const v = plan({ gym_days: days }).volume;
    expect(sum(v, LOWER) / sum(v, UPPER)).toBeGreaterThanOrEqual(0.5);
    for (const g of ['quadriceps', 'posteriores', 'peito', 'costas', 'ombros', 'core'] as const)
      expect(v[g] ?? 0, g).toBeGreaterThan(0);
  });
});

describe('o foco pesa no algoritmo', () => {
  const FOCI: TrainingFocus[][] = [
    ['pernas'],
    ['costas_ombros'],
    ['peito_bracos'],
    ['abdomen'],
    ['costas_ombros', 'abdomen'],
  ];
  const cases = [2, 3, 4, 5].flatMap((days) => FOCI.map((f) => [days, f] as const));

  it.each(cases)(
    '%i dias, foco %j: mais séries nos grupos do foco, nenhum grupo zerado',
    (days, f) => {
      const even = plan({ gym_days: days }).volume;
      const focused = plan({ gym_days: days, focus: [...f] }).volume;
      for (const g of f.flatMap((x) => FOCUS_GROUPS[x as FocusGroup]))
        expect(focused[g] ?? 0, g).toBeGreaterThan(even[g] ?? 0);
      for (const [g, sets] of Object.entries(even))
        if (sets) expect(focused[g as keyof typeof focused] ?? 0, g).toBeGreaterThan(0);
    },
  );

  it('o motivo explica o foco', () => {
    expect(plan({ focus: ['costas_ombros', 'abdomen'] }).reasons.join(' ')).toContain(
      'Foco em costas e ombros e abdômen',
    );
  });

  it('planos antigos, com um foco só, continuam valendo', () => {
    expect(focusesOf({ focus: 'pernas' })).toEqual(['pernas']);
    expect(focusesOf({ focus: ['equilibrado'] })).toEqual([]);
    expect(focusesOf({})).toEqual([]);
    expect(focusesOf({ focus: ['equilibrado', 'abdomen', 'abdomen'] })).toEqual(['abdomen']);
  });
});

describe('gênero e idade só ajustam', () => {
  it('gênero nunca muda o foco nem os exercícios escolhidos', () => {
    const picks = (g: OnboardingParams['gender']) =>
      plan({ gender: g, focus: ['peito_bracos'] }).routines.map((r) =>
        r.items.map((i) => i.exercise_id),
      );
    expect(picks('feminino')).toEqual(picks('masculino'));
    expect(picks('nao_informar')).toEqual(picks(null));
    expect(picks('outro')).toEqual(picks(null));
  });

  it('60 anos ou mais começa com menos séries, e o motivo diz por quê', () => {
    expect(volumeRange('intermediario', false, 'hipertrofia', '60+')).toEqual([6, 10]);
    expect(volumeRange('avancado', false, 'hipertrofia', '60+')).not.toEqual([6, 10]);
    const p = plan({ age_range: '60+' });
    expect(p.volume_cap).toBe(10);
    expect(p.reasons.join(' ')).toContain('60 anos ou mais');
    expect(plan({ age_range: '30-39' }).volume_cap).toBe(plan().volume_cap);
  });
});

describe('objetivos novos', () => {
  const compound = {
    compound: true,
    measure: 'weight_reps',
    primary_group: 'peito',
    pattern: 'empurrar_horizontal',
  } as ExerciseDef;
  const iso = {
    compound: false,
    measure: 'weight_reps',
    primary_group: 'bracos',
    pattern: 'rosca',
  } as ExerciseDef;

  it('condicionamento: mais repetições e descanso mais curto', () => {
    const p = { ...BASE, goal: 'condicionamento' as const };
    expect(targetFor(compound, p)).toEqual({ min: 10, max: 15 });
    expect(targetFor(iso, p)).toEqual({ min: 12, max: 20 });
    expect(restFor(compound, 'condicionamento')).toBe(90);
    expect(restFor(iso, 'condicionamento')).toBe(60);
    expect(restFor(compound, 'hipertrofia')).toBe(120);
    const items = plan({ goal: 'condicionamento' }).routines.flatMap((r) => r.items);
    expect(Math.max(...items.map((i) => i.rest_sec))).toBeLessThanOrEqual(90);
  });

  it('emagrecimento: séries como na hipertrofia, e o motivo diz por quê', () => {
    expect(targetFor(compound, { ...BASE, goal: 'emagrecimento' })).toEqual(
      targetFor(compound, BASE),
    );
    expect(plan({ goal: 'emagrecimento' }).reasons.join(' ')).toContain('Para emagrecer');
  });
});
