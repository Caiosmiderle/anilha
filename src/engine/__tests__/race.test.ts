import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { generatePlan } from '../generator';
import {
  nextLongRun,
  raceCountdown,
  raceCycleWeeks,
  raceSchedule,
  recentLongestRun,
  safeLongRun,
  type Race,
} from '../race';

// Monday 19/10/2026; a half marathon on Sunday 17/01/2027, set today: 12 weeks before it.
const MONDAY = '2026-10-19';
const HALF: Race = { distance_km: 21, date: '2027-01-17', from: MONDAY };
const long = (race: Race, today = MONDAY, start: number | null = null) =>
  raceSchedule(race, today, start).map((w) => w.long_km);
const kinds = (race: Race, today = MONDAY, start: number | null = null) =>
  raceSchedule(race, today, start).map((w) => w.kind);

describe('prova alvo: o longão de cada semana', () => {
  it('meia em 12 semanas: sobe até 10 % por semana, semana leve a cada 4, reta final e prova', () => {
    expect(long(HALF)).toEqual([8, 8.5, 9, 7, 9.5, 10, 11, 8.5, 12, 13, 8.5, 6, 21]);
    expect(kinds(HALF)).toEqual([
      'build',
      'build',
      'build',
      'cutback',
      'build',
      'build',
      'build',
      'cutback',
      'build',
      'build',
      'taper',
      'taper',
      'race',
    ]);
    const weeks = raceSchedule(HALF, MONDAY);
    expect(weeks[0]?.week).toBe(MONDAY);
    expect(weeks.at(-1)?.week).toBe('2027-01-11');
  });

  it('nenhum longão passa 10 % do maior das 4 semanas anteriores (Frandsen e colegas, 2025)', () => {
    for (const race of [
      { distance_km: 5, date: addDays(MONDAY, 7 * 20 + 6), from: MONDAY },
      { distance_km: 10, date: addDays(MONDAY, 7 * 20 + 6), from: MONDAY },
      HALF,
      { distance_km: 42, date: addDays(MONDAY, 7 * 24 + 6), from: MONDAY },
    ] as Race[]) {
      const weeks = raceSchedule(race, MONDAY).slice(0, -1);
      weeks.forEach((w, i) => {
        const before = weeks.slice(Math.max(0, i - 4), i).map((x) => x.long_km);
        if (before.length) expect(w.long_km).toBeLessThanOrEqual(nextLongRun(Math.max(...before)));
      });
    }
  });

  it('quem já corre mais longe começa de onde está e chega ao pico', () => {
    expect(long(HALF, MONDAY, 12)).toEqual([
      12, 12, 12, 12, 13, 14, 10.5, 15, 16.5, 18, 11.5, 8, 21,
    ]);
  });

  it('maratona com tempo: pico de 32 km e três semanas de reta final com 41 a 60 % menos', () => {
    const race: Race = { distance_km: 42, date: addDays(MONDAY, 7 * 23 + 6), from: MONDAY };
    const weeks = raceSchedule(race, MONDAY);
    expect(Math.max(...weeks.slice(0, -1).map((w) => w.long_km))).toBe(32);
    expect(weeks.slice(-4).map((w) => [w.kind, w.long_km])).toEqual([
      ['taper', 22.5],
      ['taper', 17.5],
      ['taper', 13],
      ['race', 42],
    ]);
    expect(raceCycleWeeks(42)).toBe(20);
    expect(raceCycleWeeks(21, 12)).toBe(9);
  });

  it('a semana de cada longão é fixa pelo dia em que a prova foi marcada', () => {
    expect(raceSchedule(HALF, addDays(MONDAY, 7 * 5 + 3))).toEqual(
      raceSchedule(HALF, MONDAY).slice(5),
    );
    // Without that day, the whole cycle sits before the race.
    expect(kinds({ distance_km: 21, date: HALF.date }).slice(-4)).toEqual([
      'peak',
      'taper',
      'taper',
      'race',
    ]);
  });

  it('prova nesta semana: só ela; passada: nada', () => {
    expect(
      raceSchedule({ distance_km: 10, date: addDays(MONDAY, 6), from: MONDAY }, MONDAY),
    ).toEqual([{ week: MONDAY, kind: 'race', long_km: 10 }]);
    expect(raceSchedule(HALF, addDays(HALF.date, 1))).toEqual([]);
  });

  it('trava de segurança: 10 % sobre o maior dos últimos 30 dias, nunca abaixo de 3 km', () => {
    expect(nextLongRun(10)).toBe(11);
    expect(nextLongRun(12)).toBe(13);
    expect(nextLongRun(3)).toBe(3.3);
    expect(safeLongRun(10)).toBe(11);
    expect(safeLongRun(2)).toBe(3);
    expect(safeLongRun(null)).toBeNull();
  });

  it('contagem para o cartão de Plano', () => {
    expect(raceCountdown(HALF, MONDAY)).toBe('Faltam 12 semanas: no domingo (17/01).');
    expect(raceCountdown(HALF, '2027-01-11')).toBe('É nesta semana, no domingo (17/01).');
    expect(raceCountdown(HALF, HALF.date)).toBe('É hoje.');
    expect(raceCountdown(HALF, '2027-01-20')).toBe('Foi em 17/01.');
  });

  it('maior corrida dos últimos 30 dias: só corrida, sem hoje', () => {
    const runs = [
      { local_date: '2026-09-25', distance_km: 9, activity: null },
      { local_date: '2026-10-12', distance_km: 30, activity: 'bike' as const },
      { local_date: '2026-09-01', distance_km: 15, activity: null },
      { local_date: MONDAY, distance_km: 12, activity: 'corrida' as const },
    ];
    expect(recentLongestRun(runs, MONDAY)).toBe(9);
    expect(recentLongestRun([], MONDAY)).toBeNull();
  });
});

describe('prova alvo no plano gerado', () => {
  it('com prova, a semana ganha corrida longa e o porquê fala da prova', () => {
    const plan = generatePlan({
      first_name: 'Lu',
      goal: 'hipertrofia',
      gym_days: 3,
      run_days: 1,
      force_gym_days: false,
      minutes: 60,
      equipment: ['halteres', 'barra', 'polia', 'maquina', 'peso_corporal'],
      level: 'intermediario',
      spare_joints: [],
      returning: false,
      time: '06:00',
      split_style: 'grupos',
      fichas: 3,
      race: HALF,
    });
    expect(plan.days.find((d) => d.kind === 'run')?.run_type).toBe('longo');
    expect(plan.reasons).toContain(
      'Prova de 21 km (meia maratona) em 17/01: o longão sobe até 10 % por semana, rumo a 18 km, com uma semana mais leve a cada 4 e a reta final com menos volume, para chegar descansado.',
    );
  });
});
