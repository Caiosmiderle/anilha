/**
 * Fichas in rotation: the split question of the onboarding (muscle groups, upper and
 * lower, full body) and "today is the ficha after the last one done".
 */
import { describe, expect, it } from 'vitest';
import { addDays, weekday } from '../dates';
import { EXERCISES_BY_ID } from '../exercises';
import { exerciseFocus, orderByGroup } from '../focus';
import { EXAMPLE_PARAMS } from '../fixtures/exampleWeek';
import { fichasFor, generatePlan, projectRotation, suggestedSplit } from '../generator';
import type { SessionSummary } from '../recommend';
import { lastFicha, recommendDay, rotationQueue } from '../recommend';
import { fichaLetter, fichaName, SPLITS, splitHasLegs } from '../taxonomy';
import type { OnboardingParams, PlanRow, SplitKey } from '../types';

const BASE: OnboardingParams = { ...EXAMPLE_PARAMS, returning: false, goal: 'hipertrofia' };

function asPlan(p: OnboardingParams): PlanRow {
  const g = generatePlan(p);
  return {
    id: 'p',
    user_id: 'u',
    updated_at: 0,
    deleted: false,
    active_from: '2026-10-05',
    gym_per_week: g.gym_per_week,
    run_per_week: g.run_per_week,
    days: g.days,
    rules: g.rules,
    params: p,
    reasons: g.reasons,
  };
}

function session(day: string, split: SplitKey): SessionSummary {
  return {
    id: `s-${day}`,
    local_date: day,
    split_key: split,
    title: SPLITS[split].label,
    muscles: SPLITS[split].muscles,
    exercises: [],
  };
}

function gymWeek(plan: PlanRow): string[] {
  return plan.days
    .filter((d) => d.kind === 'gym')
    .map((d) => fichaLetter(plan.rules.rotation, d.split_key) ?? '?');
}

describe('fichas de cada divisão', () => {
  it('por grupo muscular: A peito e tríceps, B costas e bíceps, C perna', () => {
    expect(fichasFor('grupos', 3, 3)).toEqual(['peito_triceps', 'costas_biceps', 'perna']);
    expect(fichasFor('grupos', 4, 4)).toEqual([
      'peito_triceps',
      'costas_biceps',
      'perna',
      'ombro_abdomen',
    ]);
    expect(fichasFor('grupos', 5, 5)).toEqual([
      'peito',
      'costas',
      'perna',
      'ombro_abdomen',
      'bracos',
    ]);
  });

  it('superior e inferior ganha variações A e B a partir de 4 dias', () => {
    expect(fichasFor('superior_inferior', 3, 3)).toEqual(['superior_a', 'inferior_a']);
    expect(fichasFor('superior_inferior', 3, 4)).toHaveLength(4);
  });

  it('sugestão equilibrada: corpo inteiro até 3 dias, superior e inferior com 4 ou mais', () => {
    expect(suggestedSplit(2)).toEqual({ style: 'corpo_inteiro', fichas: 2 });
    expect(suggestedSplit(3)).toEqual({ style: 'corpo_inteiro', fichas: 2 });
    expect(suggestedSplit(4)).toEqual({ style: 'superior_inferior', fichas: 3 });
    expect(suggestedSplit(5)).toEqual({ style: 'superior_inferior', fichas: 3 });
  });

  it('a semana segue a ordem do rodízio e a seguinte continua de onde parou', () => {
    const rot: SplitKey[] = ['peito_triceps', 'costas_biceps', 'perna'];
    expect(projectRotation(rot, 5)).toEqual([
      'peito_triceps',
      'costas_biceps',
      'perna',
      'peito_triceps',
      'costas_biceps',
    ]);
    expect(projectRotation(rot, 5, 5)[0]).toBe('perna');
  });
});

describe('plano gerado com rodízio', () => {
  it('5 dias com 3 fichas: A, B, C, A, B nos dias de academia, em ordem', () => {
    const plan = asPlan({
      ...BASE,
      gym_days: 5,
      run_days: 0,
      force_gym_days: true,
      split_style: 'grupos',
      fichas: 3,
    });
    expect(plan.rules.rotation).toEqual(['peito_triceps', 'costas_biceps', 'perna']);
    expect(gymWeek(plan)).toEqual(['A', 'B', 'C', 'A', 'B']);
    expect(plan.reasons.join(' ')).toContain('elas giram: A, B, C, A, B');
    expect(plan.reasons.join(' ')).toContain('continua de onde parou: C, A, B, C, A');
  });

  it('5 fichas com 3 dias: a semana faz A, B, C e a seguinte começa na D', () => {
    const plan = asPlan({ ...BASE, gym_days: 3, run_days: 0, split_style: 'grupos', fichas: 5 });
    expect(gymWeek(plan)).toEqual(['A', 'B', 'C']);
    const g = generatePlan({ ...BASE, gym_days: 3, run_days: 0, split_style: 'grupos', fichas: 5 });
    expect(g.routines.map((r) => r.name)).toEqual([
      'Ficha A: Peito',
      'Ficha B: Costas',
      'Ficha C: Perna',
      'Ficha D: Ombro e abdômen',
      'Ficha E: Braços',
    ]);
    expect(g.routines.every((r) => r.items.length >= 4)).toBe(true);
  });

  it('rotina de braços tem rosca e tríceps', () => {
    const g = generatePlan({
      ...BASE,
      gym_days: 5,
      force_gym_days: true,
      run_days: 0,
      split_style: 'grupos',
      fichas: 5,
    });
    const arms = g.routines.find((r) => r.split_key === 'bracos');
    const ids = arms?.items.map((i) => i.exercise_id) ?? [];
    expect(ids.some((id) => id.startsWith('rosca'))).toBe(true);
    expect(ids.some((id) => id.startsWith('triceps'))).toBe(true);
  });

  it('volume por grupo respeita o teto com fichas repetindo na semana', () => {
    const g = generatePlan({
      ...BASE,
      gym_days: 6,
      force_gym_days: true,
      run_days: 0,
      split_style: 'grupos',
      fichas: 3,
    });
    for (const n of Object.values(g.volume)) expect(n).toBeLessThanOrEqual(g.volume_cap + 1e-9);
  });

  it('corpo inteiro com corrida: perna não cai na véspera de corrida na primeira semana', () => {
    const plan = asPlan({ ...BASE, gym_days: 3, run_days: 2, split_style: 'corpo_inteiro' });
    for (const d of plan.days) {
      if (d.kind !== 'gym' || !splitHasLegs(d.split_key)) continue;
      expect(plan.days[(d.weekday + 1) % 7]?.kind).not.toBe('run');
    }
  });

  it('sem estilo escolhido o plano antigo segue igual (dias fixos, sem rodízio)', () => {
    const g = generatePlan(EXAMPLE_PARAMS);
    expect(g.rules.rotation).toBeNull();
    expect(g.routines.map((r) => r.name)).toEqual(['Costas e bíceps', 'Peito e tríceps', 'Perna']);
  });

  it('nome da ficha', () => {
    expect(fichaName(['peito_triceps', 'costas_biceps'], 'costas_biceps')).toBe(
      'Ficha B: Costas e bíceps',
    );
    expect(fichaName(null, 'costas_biceps')).toBe('Costas e bíceps');
  });
});

describe('ficha do dia no rodízio', () => {
  // ABC in rotation on Mon, Tue, Wed, Thu, Fri; no runs.
  const plan = asPlan({
    ...BASE,
    gym_days: 5,
    run_days: 0,
    force_gym_days: true,
    split_style: 'grupos',
    fichas: 3,
  });
  const gymDays = plan.days.filter((d) => d.kind === 'gym').map((d) => d.weekday);
  // A Monday of the plan's first full week.
  const monday = '2026-10-19';
  const dayOf = (wd: number) => addDays(monday, wd);

  it('sem histórico começa pela A', () => {
    const today = dayOf(gymDays[0] as number);
    const rec = recommendDay({ today, plan, sessions: [], runs: [] });
    expect(rec.split_key).toBe('peito_triceps');
    expect(rec.headline).toBe('Hoje: ficha A, peito e tríceps');
  });

  it('a próxima vem da última feita, não do dia da semana', () => {
    // Did A on the first gym day, skipped the second: the third gym day is B, not C.
    const first = dayOf(gymDays[0] as number);
    const third = dayOf(gymDays[2] as number);
    const rec = recommendDay({
      today: third,
      plan,
      sessions: [session(first, 'peito_triceps')],
      runs: [],
    });
    expect(rec.split_key).toBe('costas_biceps');
    expect(rec.reason).toContain('Ficha B: Costas e bíceps é a próxima do rodízio');
    expect(rec.reason).toContain('depois da ficha A');
  });

  it('virada da semana continua o rodízio', () => {
    const fri = dayOf(4);
    const nextMon = addDays(monday, 7);
    const sessions = [session(fri, 'costas_biceps')];
    const rec = recommendDay({ today: nextMon, plan, sessions, runs: [] });
    expect(rec.split_key).toBe('perna');
  });

  it('ficha de perna na véspera de corrida: vai a seguinte e perna fica para o próximo treino', () => {
    const base = asPlan({ ...BASE, gym_days: 3, run_days: 1, split_style: 'grupos', fichas: 3 });
    // Mon gym, Tue run, Wed gym, Fri gym.
    const kinds = ['gym', 'run', 'gym', 'rest', 'gym', 'rest', 'rest'] as const;
    const withRun: PlanRow = {
      ...base,
      days: base.days.map((d) => ({
        ...d,
        kind: kinds[d.weekday] ?? 'rest',
        split_key: null,
        run_type: kinds[d.weekday] === 'run' ? 'intervalado' : null,
      })),
    };
    // Last done was B, so C (perna) is next, but tomorrow is a hard run.
    const rec = recommendDay({
      today: monday,
      plan: withRun,
      sessions: [session(addDays(monday, -3), 'costas_biceps')],
      runs: [],
    });
    expect(rec.split_key).toBe('peito_triceps');
    expect(rec.reason).toContain('perna fica para outro dia');
    expect(rec.reason).toContain('a C fica para o próximo treino');
  });

  it('fila e última ficha', () => {
    const rot: SplitKey[] = ['peito_triceps', 'costas_biceps', 'perna'];
    expect(lastFicha(rot, [])).toBeNull();
    expect(rotationQueue(rot, [session('2026-10-20', 'perna')])).toEqual([
      'peito_triceps',
      'costas_biceps',
      'perna',
    ]);
    expect(
      rotationQueue(rot, [
        session('2026-10-20', 'perna'),
        session('2026-10-21', 'peito_triceps'),
      ])[0],
    ).toBe('costas_biceps');
    expect(weekday(monday)).toBe(0);
  });
});

describe('ordem do treino e região trabalhada', () => {
  it('ficha de peito: peito inteiro, depois ombro, depois tríceps', () => {
    const g = generatePlan({ ...BASE, gym_days: 3, run_days: 0, split_style: 'grupos', fichas: 3 });
    const peito = g.routines.find((r) => r.split_key === 'peito_triceps');
    const groups = (peito?.items ?? []).map(
      (i) => EXERCISES_BY_ID.get(i.exercise_id)?.primary_group,
    );
    // Each group shows up in one block, never split around another group.
    const blocks = groups.filter((g2, i) => g2 !== groups[i - 1]);
    expect(new Set(blocks).size).toBe(blocks.length);
    expect(blocks[0]).toBe('peito');
    expect(blocks.indexOf('ombros')).toBeLessThan(blocks.indexOf('bracos'));
  });

  it('cada exercício da biblioteca diz o que trabalha', () => {
    for (const ex of EXERCISES_BY_ID.values()) expect(exerciseFocus(ex).length).toBeGreaterThan(3);
    expect(exerciseFocus(EXERCISES_BY_ID.get('supino-inclinado-halteres')!)).toBe(
      'Peitoral superior',
    );
    expect(exerciseFocus(EXERCISES_BY_ID.get('crucifixo-maquina')!)).toBe(
      'Peitoral médio, isolado',
    );
    // Custom exercise: its muscles.
    expect(exerciseFocus({ id: 'meu', muscles: ['gluteos', 'posterior_coxa'] })).toBe(
      'Glúteos e posterior de coxa',
    );
  });

  it('ordem por grupo: composto antes do isolado dentro do mesmo músculo', () => {
    const ids = ['cadeira-extensora', 'stiff', 'agachamento-livre', 'mesa-flexora', 'leg-press-45'];
    const ordered = orderByGroup(ids, (id) => EXERCISES_BY_ID.get(id));
    expect(ordered).toEqual([
      'agachamento-livre',
      'leg-press-45',
      'cadeira-extensora',
      'stiff',
      'mesa-flexora',
    ]);
  });
});
