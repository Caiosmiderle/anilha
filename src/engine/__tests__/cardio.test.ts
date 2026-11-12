import { describe, expect, it } from 'vitest';
import {
  activityOf,
  cardioLegLoad,
  cardioName,
  cardioTitle,
  countedCardio,
  distanceText,
  paceText,
} from '../cardio';
import { sportToActivity } from '../trackImport';

describe('cardio', () => {
  it('linha antiga sem atividade é corrida', () => {
    expect(activityOf({})).toBe('corrida');
    expect(activityOf({ activity: null })).toBe('corrida');
    expect(cardioName({ run_type: 'longo' })).toBe('Corrida longa');
    expect(cardioName({ activity: 'bike', run_type: 'leve' })).toBe('Bike');
  });

  it('distância e ritmo na unidade de cada esporte', () => {
    const run = { activity: null, distance_km: 5, duration_sec: 1650 };
    expect(distanceText(run)).toBe('5 km');
    expect(paceText(run)).toBe('5:30 /km');
    const bike = { activity: 'bike' as const, distance_km: 30, duration_sec: 3600 };
    expect(paceText(bike)).toBe('30 km/h');
    const swim = { activity: 'natacao' as const, distance_km: 1.5, duration_sec: 1800 };
    expect(distanceText(swim)).toBe('1.500 m');
    expect(paceText(swim)).toBe('2:00 /100 m');
    const row = { activity: 'remo' as const, distance_km: 2, duration_sec: 480 };
    expect(paceText(row)).toBe('2:00 /500 m');
    const ellip = { activity: 'eliptico' as const, distance_km: null, duration_sec: 1800 };
    expect(distanceText(ellip)).toBeNull();
    expect(paceText(ellip)).toBeNull();
  });

  it('título: distância quando tem, minutos quando não', () => {
    expect(
      cardioTitle({ activity: null, run_type: 'leve', distance_km: 5, duration_sec: 1650 }),
    ).toBe('Corrida leve de 5 km');
    expect(
      cardioTitle({
        activity: 'eliptico',
        run_type: 'leve',
        distance_km: null,
        duration_sec: 1800,
      }),
    ).toBe('Elíptico de 30 min');
  });

  it('carga na perna: corrida pelos km, o resto pelos minutos e o quanto usa a perna', () => {
    expect(cardioLegLoad({ activity: null, distance_km: 10, rpe: 8 })).toBe(8);
    // 60 min of bike at effort 8: 10 "km" x 0.6 x 0.8.
    expect(
      cardioLegLoad({ activity: 'bike', distance_km: 30, duration_sec: 3600, rpe: 8 }),
    ).toBeCloseTo(4.8);
    expect(cardioLegLoad({ activity: 'natacao', distance_km: 2, duration_sec: 3600, rpe: 9 })).toBe(
      0,
    );
  });

  it('esporte do arquivo do relógio', () => {
    expect(sportToActivity('Running')).toBe('corrida');
    expect(sportToActivity('Biking')).toBe('bike');
    expect(sportToActivity('cycling')).toBe('bike');
    expect(sportToActivity('hiking')).toBe('caminhada');
    expect(sportToActivity('swimming')).toBe('natacao');
    expect(sportToActivity('Other')).toBeNull();
    expect(sportToActivity(null)).toBeNull();
  });

  it('outro cardio só conta enquanto preenche dia de cardio do plano', () => {
    const r = (local_date: string, activity: 'bike' | 'eliptico' | null = null) => ({
      local_date,
      activity,
    });
    // Week of 19/10, plan with 2 cardio days: one run and two bikes.
    const runs = [r('2026-10-19'), r('2026-10-20', 'bike'), r('2026-10-22', 'bike')];
    expect(countedCardio(runs, () => 2).map((x) => x.local_date)).toEqual([
      '2026-10-19',
      '2026-10-20',
    ]);
    // Gym only: the elliptical is a bonus; a run past the plan still counts.
    expect(countedCardio([r('2026-10-19', 'eliptico')], () => 0)).toHaveLength(0);
    expect(countedCardio([r('2026-10-19'), r('2026-10-21')], () => 1)).toHaveLength(2);
  });
});
