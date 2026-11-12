import { describe, expect, it } from 'vitest';
import { generatePlan, withSplit } from '../../engine/generator';
import type { OnboardingParams } from '../../engine/types';
import type { AgentContext } from '../context';
import { executeTool, runAgentTool } from '../execute';

const mariana: OnboardingParams = {
  first_name: 'Mariana',
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
  gender: 'feminino',
};

function context(params: OnboardingParams): AgentContext {
  const plan = generatePlan(params);
  return {
    params,
    fichas: plan.routines.map((r) => ({ id: r.split_key, name: r.name, items: r.items })),
    volume: plan.volume,
    health: true,
    returnMode: false,
  };
}

const legs = (text: string) => /Quadríceps \d+ para (\d+)/.exec(text)?.[1];

describe('agente: propor_plano refaz o plano como as telas', () => {
  const ask = {
    foco: ['pernas'],
    dias_academia: null,
    divisao: null,
    fichas: null,
    objetivo: null,
    nivel: null,
    minutos: null,
    motivo: 'Mais perna e glúteo.',
  };

  it('foco em pernas com a divisão escolhida pelo app: perna ganha fichas e séries', () => {
    const out = runAgentTool('propor_plano', ask, context(withSplit(mariana, false)));
    expect(out).toMatch(/Fichas: Ficha A: Anterior de coxa/);
    expect(Number(legs(out))).toBeGreaterThan(12);
  });

  it('plano antigo, sem divisão: o foco em pernas também vale', () => {
    const out = runAgentTool('propor_plano', ask, context(mariana));
    expect(Number(legs(out))).toBeGreaterThan(12);
  });

  it('ABCD: 4 fichas por grupo, mesmo vindo de superior e inferior', () => {
    const out = runAgentTool(
      'propor_plano',
      { ...ask, foco: null, fichas: 4, motivo: 'Quer ABCD.' },
      context(withSplit(mariana, false)),
    );
    expect(out).toMatch(
      /Fichas: Ficha A: Peito e tríceps, Ficha B: Costas e bíceps, Ficha C: Perna, Ficha D/,
    );
  });
});

describe('gerador: foco em pernas nunca some', () => {
  it('sem divisão definida, o foco em pernas usa a divisão sugerida para ele', () => {
    const even = generatePlan(mariana);
    const focus = generatePlan({ ...mariana, focus: ['pernas'] });
    expect(focus.routines.map((r) => r.split_key)).toContain('gluteos');
    expect(focus.volume.quadriceps ?? 0).toBeGreaterThan(even.volume.quadriceps ?? 0);
  });
});

describe('agente: volume semanal de uma ficha nova', () => {
  const exercise = {
    exercise_id: 'supino-reto-barra',
    sets: 3,
    target_min: 8,
    target_max: 12,
    rest_sec: 120,
  };
  const ctx = (per_week: number): AgentContext => ({
    ...context(mariana),
    fichas: [{ id: 'r1', name: 'Peito', items: [exercise], per_week }],
    volume: { peito: exercise.sets * per_week },
  });
  const input = {
    nome: 'Peito novo',
    exercicios: [
      { exercicio_id: exercise.exercise_id, series: 5, repeticoes_min: 8, repeticoes_max: 12 },
    ],
    substitui_ficha_id: 'r1',
    motivo: 'Trocar a ficha',
  };

  it('mantém a frequência fracionária da ficha substituída', () => {
    const out = executeTool('nova_ficha', input, ctx(1.5));
    expect(out.proposal).toMatchObject({
      kind: 'nova',
      ficha: { per_week: 1.5 },
      volume: [{ group: 'peito', before: 4.5, after: 7.5 }],
    });
  });

  it('uma ficha pessoal nova não altera o volume do plano', () => {
    const out = executeTool('nova_ficha', { ...input, substitui_ficha_id: null }, ctx(2));
    expect(out.proposal).toMatchObject({
      kind: 'nova',
      ficha: { per_week: 0 },
      volume: [],
      risks: [],
    });
  });

  it('substituir uma ficha pessoal também fica fora do volume do plano', () => {
    const out = executeTool('nova_ficha', input, ctx(0));
    expect(out.proposal).toMatchObject({
      kind: 'nova',
      ficha: { per_week: 0 },
      volume: [],
      risks: [],
    });
  });
});

describe('agente: só oferece mudanças que podem ser salvas no banco', () => {
  const item = {
    exercise_id: 'supino-reto-barra',
    sets: 3,
    target_min: 8,
    target_max: 12,
    rest_sec: 120,
  };
  const ctx: AgentContext = {
    ...context(mariana),
    fichas: [{ id: 'r1', name: 'Peito', items: [item], per_week: 1 }],
    volume: { peito: 3 },
  };

  it.each([
    { tipo: 'series', series: 0 },
    { tipo: 'series', series: 13 },
    { tipo: 'series', series: 3.5 },
    { tipo: 'descanso', descanso_segundos: -1 },
    { tipo: 'descanso', descanso_segundos: 601 },
    { tipo: 'repeticoes', repeticoes_min: 0 },
    { tipo: 'repeticoes', repeticoes_max: 3601 },
    { tipo: 'repeticoes', repeticoes_min: 15, repeticoes_max: 10 },
    { tipo: 'repeticoes', repeticoes_min: '10' },
    { tipo: 'trocar', novo_exercicio_id: 'exercicio-inventado' },
  ])('rejeita edição inválida: %j', (mudanca) => {
    const before = structuredClone(ctx);
    const out = executeTool(
      'editar_ficha',
      { ficha_id: 'r1', mudancas: [{ exercicio_id: item.exercise_id, ...mudanca }] },
      ctx,
    );
    expect(out.proposal).toBeNull();
    expect(out.result).toMatch(/^Não foi:/);
    expect(ctx).toEqual(before);
  });

  it('aceita séries, repetições e descanso nos limites do banco', () => {
    const out = executeTool(
      'editar_ficha',
      {
        ficha_id: 'r1',
        mudancas: [
          { tipo: 'series', exercicio_id: item.exercise_id, series: 12 },
          {
            tipo: 'repeticoes',
            exercicio_id: item.exercise_id,
            repeticoes_min: 1,
            repeticoes_max: 3600,
          },
          { tipo: 'descanso', exercicio_id: item.exercise_id, descanso_segundos: 600 },
        ],
      },
      ctx,
    );
    expect(out.proposal).toMatchObject({
      kind: 'ficha',
      after: { items: [{ sets: 12, target_min: 1, target_max: 3600, rest_sec: 600 }] },
    });
  });

  it('preserva exercícios pessoais existentes ao mudar outra parte da ficha', () => {
    const out = executeTool(
      'editar_ficha',
      { ficha_id: 'r1', mudancas: [{ tipo: 'series', exercicio_id: item.exercise_id, series: 4 }] },
      {
        ...ctx,
        fichas: [{ ...ctx.fichas[0]!, items: [item, { ...item, exercise_id: 'meu-exercicio' }] }],
      },
    );
    expect(out.proposal).toMatchObject({
      kind: 'ficha',
      after: { items: [{ sets: 4 }, { exercise_id: 'meu-exercicio', sets: 3 }] },
    });
  });

  it.each([
    { series: 0 },
    { series: 13 },
    { series: '3' },
    { repeticoes_min: 20, repeticoes_max: 10 },
    { exercicio_id: 'exercicio-inventado' },
  ])('rejeita ficha nova inválida: %j', (invalid) => {
    const out = executeTool(
      'nova_ficha',
      {
        nome: 'Peito',
        exercicios: [
          {
            exercicio_id: item.exercise_id,
            series: 3,
            repeticoes_min: 8,
            repeticoes_max: 12,
            ...invalid,
          },
        ],
        substitui_ficha_id: null,
      },
      ctx,
    );
    expect(out.proposal).toBeNull();
  });

  it.each([{ nome: ' ' }, { nome: 'x'.repeat(81) }, { exercicios: [] }, { exercicios: [null] }])(
    'rejeita nome ou lista de exercícios inválidos: %j',
    (invalid) => {
      const out = executeTool(
        'nova_ficha',
        {
          nome: 'Peito',
          exercicios: [
            { exercicio_id: item.exercise_id, series: 3, repeticoes_min: 8, repeticoes_max: 12 },
          ],
          substitui_ficha_id: null,
          ...invalid,
        },
        ctx,
      );
      expect(out.proposal).toBeNull();
    },
  );

  it.each([
    { dias_academia: 0 },
    { dias_academia: 7 },
    { dias_academia: 2.5 },
    { fichas: 2 },
    { fichas: 6 },
    { minutos: 0 },
    { minutos: -10 },
    { minutos: 30.5 },
  ])('rejeita parâmetros inválidos de plano: %j', (invalid) => {
    expect(executeTool('propor_plano', invalid, ctx).proposal).toBeNull();
  });
});
