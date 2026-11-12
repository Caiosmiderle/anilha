/**
 * Mandatory warm-up before the first lift. Intermediate and advanced: progressive,
 * 2 sets of 6 at 40% and 80% of the working load (Ribeiro et al. 2020). Beginners and
 * return mode: 1 set of 10 at 40%. Loads rounded to the machine's step.
 */
import { describe, expect, it } from 'vitest';
import { EXERCISES_BY_ID } from '../exercises';
import { EXAMPLE_PARAMS } from '../fixtures/exampleWeek';
import { generatePlan } from '../generator';
import type { Measure, OnboardingParams } from '../types';
import {
  WARMUP,
  warmupLoads,
  warmupPercents,
  warmupRule,
  warmupStyleFor,
  withMandatoryWarmup,
} from '../warmup';

describe('aquecimento por nível', () => {
  it('intermediário e avançado: progressivo; iniciante e retorno: simples', () => {
    expect(warmupStyleFor('avancado')).toBe('progressive');
    expect(warmupStyleFor('intermediario')).toBe('progressive');
    expect(warmupStyleFor('iniciante')).toBe('simple');
    expect(warmupStyleFor('avancado', true)).toBe('simple');
    expect(warmupStyleFor(undefined)).toBe('progressive');
    expect(WARMUP.progressive).toEqual({ sets: 2, reps: 6 });
    expect(WARMUP.simple).toEqual({ sets: 1, reps: 10 });
  });

  it('porcentagens: progressivo 40% e 80%, simples fica em 40%', () => {
    expect(warmupPercents(2, 'progressive')).toEqual([0.4, 0.8]);
    expect(warmupPercents(1, 'progressive')).toEqual([0.8]);
    expect(warmupPercents(3, 'progressive').map((p) => Math.round(p * 100))).toEqual([40, 60, 80]);
    expect(warmupPercents(1, 'simple')).toEqual([0.4]);
    expect(warmupPercents(2, 'simple')).toEqual([0.4, 0.4]);
    expect(warmupPercents(0, 'simple')).toEqual([]);
  });

  it('cargas arredondadas ao passo do aparelho', () => {
    // Pulley in 2.5 kg steps: 40 kg of work gives 15 and 32,5.
    expect(warmupLoads(40, 2, 2.5, 'progressive')).toEqual([15, 32.5]);
    // Dumbbells in 2 kg steps: 24 kg gives 10 and 20.
    expect(warmupLoads(24, 2, 2, 'progressive')).toEqual([10, 20]);
    expect(warmupLoads(100, 1, 2, 'simple')).toEqual([40]);
  });

  it('sem carga de trabalho conhecida, sem carga inventada', () => {
    expect(warmupLoads(null, 2, 2.5, 'progressive')).toEqual([null, null]);
    expect(warmupLoads(0, 1, 2.5, 'simple')).toEqual([null]);
  });

  it('obrigatório: o primeiro exercício com carga ganha o mínimo do nível', () => {
    const measure: Record<string, Measure> = {
      prancha: 'time',
      supino: 'weight_reps',
      rosca: 'weight_reps',
    };
    const items = [
      { exercise_id: 'prancha', warmup_sets: 0 },
      { exercise_id: 'supino', warmup_sets: 0 },
      { exercise_id: 'rosca', warmup_sets: 0 },
    ];
    const of = (id: string) => measure[id];
    expect(withMandatoryWarmup(items, of, 'progressive').map((i) => i.warmup_sets)).toEqual([
      0, 2, 0,
    ]);
    expect(withMandatoryWarmup(items, of, 'simple').map((i) => i.warmup_sets)).toEqual([0, 1, 0]);
    // Already more than the minimum: kept.
    const more = withMandatoryWarmup(
      [{ exercise_id: 'supino', warmup_sets: 3 }],
      () => 'weight_reps',
      'progressive',
    );
    expect(more[0]?.warmup_sets).toBe(3);
    // Nothing with load (a bodyweight circuit): nothing forced.
    expect(withMandatoryWarmup(items.slice(0, 1), of, 'progressive')).toEqual(items.slice(0, 1));
  });

  it('regra em texto', () => {
    expect(warmupRule(2, 'progressive')).toBe('2 séries de 6, com 40% e 80% da carga de trabalho');
    expect(warmupRule(1, 'simple')).toBe('1 série de 10, com 40% da carga de trabalho');
  });

  it('plano gerado: cada ficha abre com o aquecimento do nível', () => {
    const cases: [Partial<OnboardingParams>, number][] = [
      [{ level: 'avancado', returning: false }, 2],
      [{ level: 'intermediario', returning: false }, 2],
      [{ level: 'iniciante', returning: false }, 1],
      [{ level: 'intermediario', returning: true }, 1],
    ];
    for (const [params, sets] of cases) {
      const g = generatePlan({ ...EXAMPLE_PARAMS, ...params, split_style: 'grupos', fichas: 5 });
      for (const r of g.routines) {
        const first = r.items[0];
        if (!first) continue;
        const weighted = EXERCISES_BY_ID.get(first.exercise_id)?.measure === 'weight_reps';
        expect(first.warmup_sets).toBe(weighted ? sets : 0);
        expect(r.items.slice(1).every((i) => i.warmup_sets === 0)).toBe(true);
      }
    }
  });
});
