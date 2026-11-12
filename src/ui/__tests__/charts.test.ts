import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDayScale, LineChart } from '../charts';

describe('escala de datas do gráfico', () => {
  it('mantém a proporção entre os dias 1, 2 e 15, mesmo fora de ordem', () => {
    const days = ['2026-10-15', '2026-10-01', '2026-10-02'];
    const x = createDayScale(days, 8, 140);
    expect(x('2026-10-01')).toBe(8);
    expect(x('2026-10-02')).toBe(18);
    expect(x('2026-10-15')).toBe(148);
    expect(x('2026-10-15') - x('2026-10-02')).toBe(13 * (x('2026-10-02') - x('2026-10-01')));
    expect(days).toEqual(['2026-10-15', '2026-10-01', '2026-10-02']);
  });

  it.each([{ days: ['2026-10-02'] }, { days: ['2026-10-02', '2026-10-02'] }, { days: [] }])(
    'centraliza quando há no máximo uma data distinta: $days',
    ({ days }) => {
      expect(createDayScale(days, 8, 140)('2026-10-02')).toBe(78);
    },
  );

  it.each([
    ['2024-02-28', '2024-02-29', '2024-03-01'],
    ['2026-12-31', '2027-01-01', '2027-01-02'],
    ['2018-11-03', '2018-11-04', '2018-11-05'],
  ])('conta dias locais entre %s e %s e %s', (first, middle, last) => {
    const x = createDayScale([first, middle, last], 0, 100);
    expect(x(middle)).toBe(50);
    expect(x(last)).toBe(100);
  });
});

describe('LineChart', () => {
  const main = [
    { day: '2026-10-15', value: 25 },
    { day: '2026-10-02', value: 20 },
  ];
  const compare = [
    { day: '2026-10-15', value: 30 },
    { day: '2026-10-01', value: 24 },
  ];

  it('usa a mesma escala temporal para as duas séries', () => {
    const markup = renderToStaticMarkup(
      createElement(LineChart, { main, compare, mainLabel: 'Carga máxima', unit: 'kg' }),
    );
    // Largura inicial de 320 px, com 8 px à esquerda e 76 px à direita.
    const positions = [...markup.matchAll(/class="c-dot" cx="([\d.]+)"/g)].map((match) =>
      Number(match[1]),
    );
    expect(positions[0]).toBe(244);
    expect(positions[1]).toBeCloseTo(24.86, 2);
    expect(markup).toContain('class="c-compare" d="M8.0,');
  });

  it('inclui rótulos, datas, valores e unidades das duas séries no nome acessível', () => {
    const markup = renderToStaticMarkup(
      createElement(LineChart, {
        main,
        compare,
        mainLabel: 'Carga máxima',
        compareLabel: '1RM est.',
        unit: 'kg',
      }),
    );
    expect(markup).toContain(
      'aria-label="Carga máxima: 02/10, 20 kg; 15/10, 25 kg. 1RM est.: 01/10, 24 kg; 15/10, 30 kg"',
    );
  });

  it('identifica a comparação quando não recebe rótulo', () => {
    const markup = renderToStaticMarkup(
      createElement(LineChart, { main, compare, mainLabel: 'Carga máxima', unit: 'kg' }),
    );
    expect(markup).toContain('Comparação: 01/10, 24 kg; 15/10, 30 kg');
  });

  it('omite a comparação quando a série está vazia ou ausente', () => {
    for (const compare of [[], undefined]) {
      const markup = renderToStaticMarkup(
        createElement(LineChart, { main, compare, mainLabel: 'Carga máxima', unit: 'kg' }),
      );
      expect(markup).toContain('aria-label="Carga máxima: 02/10, 20 kg; 15/10, 25 kg"');
    }
  });
});
