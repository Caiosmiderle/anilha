import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Proposal } from '../execute';
import { ProposalDetails } from '../ProposalDetails';

const params = {
  first_name: '',
  goal: 'hipertrofia',
  gym_days: 2,
  run_days: 1,
  force_gym_days: false,
  minutes: 40,
  equipment: [],
  level: 'iniciante',
  spare_joints: [],
  returning: false,
  time: '18:00',
} as const;

const plan: Extract<Proposal, { kind: 'plano' }> = {
  kind: 'plano',
  before: { ...params, equipment: [], spare_joints: [] },
  after: { ...params, equipment: [], spare_joints: [] },
  plan: {
    gym_per_week: 2,
    run_per_week: 1,
    volume: {},
    volume_cap: 20,
    suggested_gym_days: null,
    rules: { no_legs_before_run: true, rotation: ['superior_a', 'inferior_a'] },
    days: [
      { weekday: 0, kind: 'gym', split_key: 'superior_a', run_type: null, time: '18:00' },
      { weekday: 2, kind: 'run', split_key: null, run_type: 'leve', time: '07:30' },
      { weekday: 3, kind: 'rest', split_key: null, run_type: null, time: '18:00' },
    ],
    reasons: ['Plano ajustado aos dias disponíveis.'],
    routines: [
      {
        name: 'Ficha A',
        split_key: 'superior_a',
        reason: 'Trabalho de membros superiores.',
        items: [
          {
            exercise_id: 'supino-reto-barra',
            sets: 3,
            target_min: 8,
            target_max: 12,
            rest_sec: 90,
            warmup_sets: 2,
            reason: 'Aquecimento antes das séries de trabalho.',
          },
        ],
      },
      {
        name: 'Ficha B',
        split_key: 'inferior_a',
        reason: 'Trabalho de membros inferiores.',
        items: [
          {
            exercise_id: 'prancha',
            sets: 2,
            target_min: 30,
            target_max: 45,
            rest_sec: 0,
            warmup_sets: 0,
            reason: null,
          },
        ],
      },
    ],
  },
  volume: [],
  risks: [],
};

const render = (proposal: Proposal) =>
  renderToStaticMarkup(createElement(ProposalDetails, { proposal }));

describe('prévia da proposta antes de salvar', () => {
  it('permite expandir cada ficha com doses, descanso, aquecimento e origem', () => {
    const before = JSON.stringify(plan);
    const html = render(plan);
    expect(html).toContain('<summary>Ver detalhes de Ficha A</summary>');
    expect(html).toContain('<summary>Ver detalhes de Ficha B</summary>');
    expect(html).not.toContain(' open=');
    expect(html).toContain('Supino reto com barra');
    expect(html).toContain('3 séries de 8-12 repetições');
    expect(html).toContain('Descanso: 90 s');
    expect(html).toContain('Aquecimento: 2 séries');
    expect(html).toContain('2 séries de 30-45 s');
    expect(html).toContain('Descanso: 0 s');
    expect(html).toContain('Origem da proposta: gerador de planos do Anilha.');
    expect(html).toContain('Trabalho de membros superiores.');
    expect(html).toContain('Aquecimento antes das séries de trabalho.');
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('mostra semana, horários, rodízio e arquivamento sem fixar ficha no dia do rodízio', () => {
    const html = render(plan);
    expect(html).toContain('Academia, próxima ficha do rodízio, 18:00');
    expect(html).toContain('Corrida (leve), 07:30');
    expect(html).toContain('Descanso</li>');
    expect(html).toContain('Ordem das fichas: Ficha A, Ficha B.');
    expect(html).toContain('As fichas do plano anterior serão arquivadas.');
    expect(html).toContain('Plano ajustado aos dias disponíveis.');
  });

  it('mostra a ficha do dia quando não há rodízio', () => {
    const html = render({ ...plan, plan: { ...plan.plan, rules: { no_legs_before_run: true } } });
    expect(html).toContain('Ficha A, 18:00');
    expect(html).not.toContain('próxima ficha do rodízio');
  });

  it.each([false, true])(
    'ficha nova com substituição %s inclui descanso e efeito na programação',
    (replaces) => {
      const proposal: Proposal = {
        kind: 'nova',
        ficha: {
          id: 'nova',
          name: 'Treino curto',
          items: [
            {
              exercise_id: 'exercicio-personalizado',
              sets: 4,
              target_min: 10,
              target_max: 15,
              rest_sec: 75,
            },
          ],
        },
        replaces: replaces ? { id: 'antiga', name: 'Ficha anterior', items: [] } : null,
        volume: [],
        risks: [],
      };
      const before = JSON.stringify(proposal);
      const html = render(proposal);
      expect(html).toContain('Ver detalhes de Treino curto');
      expect(html).toContain('exercicio-personalizado');
      expect(html).toContain('4 séries de 10-15 repetições');
      expect(html).toContain('Descanso: 75 s');
      expect(html).toContain('Aquecimento: 0 séries');
      expect(html).toContain('Origem da proposta: montada com o assistente do Anilha.');
      expect(html).toContain(
        replaces ? 'A ficha Ficha anterior será arquivada.' : 'fora da programação semanal',
      );
      expect(JSON.stringify(proposal)).toBe(before);
    },
  );
});
