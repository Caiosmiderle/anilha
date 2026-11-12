import { describe, expect, it } from 'vitest';
import { bodyTrend, weeklyAverages } from '../body';

const log = (local_date: string, weight_kg: number | null, waist_cm: number | null = null) => ({
  local_date,
  weight_kg,
  waist_cm,
  deleted: false,
});

describe('peso e medidas', () => {
  it('média por semana, segunda a domingo', () => {
    const w = weeklyAverages([log('2026-10-05', 80), log('2026-10-07', 81), log('2026-10-12', 82)]);
    expect(w.map((x) => [x.week, x.weight_kg])).toEqual([
      ['2026-10-05', 80.5],
      ['2026-10-12', 82],
    ]);
  });

  it('sem duas semanas não há ritmo, só o pedido de constância', () => {
    const t = bodyTrend([log('2026-10-19', 80)], 'hipertrofia', '2026-10-19');
    expect(t.rate_pct_week).toBeNull();
    expect(t.advice).toContain('duas semanas');
  });

  it('ganhando massa no ritmo certo: entre 0,25% e 0,5% por semana', () => {
    // 80 kg to 80.9 kg in 3 weeks: 0.375% per week.
    const logs = [
      log('2026-09-29', 80),
      log('2026-10-06', 80.3),
      log('2026-10-13', 80.6),
      log('2026-10-19', 80.9),
    ];
    const t = bodyTrend(logs, 'hipertrofia', '2026-10-19');
    expect(t.rate_pct_week).toBeCloseTo(0.38, 1);
    expect(t.advice).toBe('No ritmo de quem está ganhando massa.');
  });

  it('peso parado e subindo rápido têm aviso; cintura subindo também', () => {
    const still = bodyTrend(
      [log('2026-09-29', 80), log('2026-10-19', 80)],
      'hipertrofia',
      '2026-10-19',
    );
    expect(still.advice).toContain('Peso quase parado');
    const fast = bodyTrend(
      [log('2026-09-29', 80, 82), log('2026-10-19', 83, 85)],
      'hipertrofia',
      '2026-10-19',
    );
    expect(fast.advice).toContain('Subindo rápido');
    expect(fast.advice).toContain('cintura subiu');
    expect(fast.waist_change_cm).toBe(3);
  });

  it('emagrecendo: 0,5% a 1% por semana segura o músculo; rápido demais avisa', () => {
    // 80 kg to 78.8 kg in 3 weeks: -0.5% per week.
    const ok = bodyTrend(
      [
        log('2026-09-29', 80),
        log('2026-10-06', 79.6),
        log('2026-10-13', 79.2),
        log('2026-10-19', 78.8),
      ],
      'emagrecimento',
      '2026-10-19',
    );
    expect(ok.advice).toBe('No ritmo de quem emagrece mantendo o músculo.');
    const fast = bodyTrend(
      [log('2026-09-29', 80), log('2026-10-19', 76)],
      'emagrecimento',
      '2026-10-19',
    );
    expect(fast.advice).toContain('Caindo rápido');
    const stuck = bodyTrend(
      [log('2026-09-29', 80, 90), log('2026-10-19', 80, 88)],
      'emagrecimento',
      '2026-10-19',
    );
    expect(stuck.advice).toContain('Peso quase parado');
    expect(stuck.advice).toContain('A cintura caiu');
  });

  it('outros objetivos: tendência sem receita', () => {
    const t = bodyTrend([log('2026-09-29', 80), log('2026-10-19', 79)], 'saude', '2026-10-19');
    expect(t.rate_pct_week).toBeLessThan(0);
    expect(t.advice).toBeNull();
  });

  it('registro apagado ou do futuro não conta', () => {
    const t = bodyTrend(
      [log('2026-10-19', 80), { ...log('2026-10-18', 99), deleted: true }, log('2026-10-25', 70)],
      'saude',
      '2026-10-19',
    );
    expect(t.latest?.weight_kg).toBe(80);
  });
});
