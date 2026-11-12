import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { Race } from '../race';
import {
  fmtPace,
  fmtRaceTime,
  markError,
  paceZones,
  parseRaceTime,
  predictSeconds,
  runFitness,
  runSession,
  vdotOf,
  type Fitness,
  type SessionInput,
} from '../running';

const FIFTY: Fitness = { vdot: 50, source: 'marca', km: 5, seconds: 1197, date: '2026-10-10' };
const base = (over: Partial<SessionInput>): SessionInput => ({
  type: 'leve',
  today: '2026-10-21',
  level: 'intermediario',
  returning: false,
  race: null,
  fitness: null,
  runs: [],
  ...over,
});
const run = (local_date: string, distance_km: number, more: Record<string, unknown> = {}) => ({
  local_date,
  distance_km,
  duration_sec: distance_km * 360,
  rpe: 5,
  run_type: 'leve' as const,
  activity: null,
  ...more,
});

describe('nível de corrida (VDOT, equações de Daniels e Gilbert)', () => {
  it('bate com a tabela: 5 km em 19:57, 10 km em 41:21, meia em 1:31:35 e maratona em 3:10:49 dão 50', () => {
    expect(vdotOf(5, 19 * 60 + 57)).toBeCloseTo(50, 0);
    expect(vdotOf(10, 41 * 60 + 21)).toBeCloseTo(50, 0);
    expect(vdotOf(21.0975, 91 * 60 + 35)).toBeCloseTo(50, 0);
    expect(vdotOf(42.195, 190 * 60 + 49)).toBeCloseTo(50, 0);
    expect(fmtRaceTime(predictSeconds(50, 10))).toBe('41:20');
  });

  it('ritmos de cada tipo de corrida para VDOT 50', () => {
    const z = paceZones(50);
    expect([fmtPace(z.easy[0]), fmtPace(z.easy[1])]).toEqual(['5:07/km', '5:38/km']);
    expect(fmtPace(z.threshold)).toBe('4:15/km');
    expect(fmtPace(z.interval)).toBe('3:55/km');
  });

  it('tempo digitado e conferido', () => {
    expect(parseRaceTime('25:30')).toBe(1530);
    expect(parseRaceTime('1:52:30')).toBe(6750);
    expect(parseRaceTime('25:75')).toBeNull();
    expect(parseRaceTime('abc')).toBeNull();
    expect(markError(5, 1530)).toBeNull();
    expect(markError(5, 600)).toMatch(/^Rápido demais/);
    expect(markError(5, 5400)).toMatch(/^Devagar demais/);
    expect(markError(5, null)).toMatch(/^Escreva o tempo/);
  });

  it('o nível vem do melhor entre o tempo informado e as corridas fortes contínuas', () => {
    const today = '2026-10-21';
    const mark = { distance_km: 5, seconds: 1500, date: '2026-10-01' };
    // 10 km in 45 min at effort 9: better than the mark.
    const hard = run('2026-10-15', 10, { duration_sec: 2700, rpe: 9 });
    expect(runFitness(mark, [hard], today)?.source).toBe('treino');
    // Intervals, easy runs, bike and old marks do not count.
    const ignored = [
      run('2026-10-15', 10, { duration_sec: 2400, rpe: 9, run_type: 'intervalado' }),
      run('2026-10-16', 10, { duration_sec: 2400, rpe: 5 }),
      run('2026-10-17', 30, { duration_sec: 3600, rpe: 9, activity: 'bike' }),
    ];
    expect(runFitness(mark, ignored, today)?.source).toBe('marca');
    expect(runFitness({ ...mark, date: addDays(today, -130) }, [], today)).toBeNull();
  });
});

describe('a corrida do dia', () => {
  it('leve: pelo esforço sem ritmo; com ritmo, a faixa', () => {
    const s = runSession(base({}));
    expect(s.headline).toBe('Hoje: corrida leve de 40 min');
    expect(s.steps[0]?.detail).toContain('dá para conversar em frases inteiras');
    expect(runSession(base({ fitness: FIFTY })).steps[0]?.detail).toBe(
      'leve, 5:07/km a 5:38/km (esforço 3 a 4 de 10, dá para conversar em frases inteiras)',
    );
  });

  it('qualidade: alterna intervalado e limiar e sobe um degrau a cada sessão feita', () => {
    const even = '2026-10-26';
    const s = runSession(base({ type: 'intervalado', today: even, fitness: FIFTY }));
    expect(s.headline).toBe('Hoje: intervalado, 6 x 2 min');
    expect(s.steps.map((x) => x.label)).toEqual(['Aquecimento', '6 x 2 min', 'Desaquecimento']);
    expect(s.steps[1]?.detail).toMatch(/^3:55\/km/);
    const done = [
      run('2026-10-12', 8, { run_type: 'intervalado' }),
      run('2026-10-19', 8, { run_type: 'intervalado' }),
    ];
    expect(runSession(base({ type: 'intervalado', today: even, runs: done })).headline).toBe(
      'Hoje: intervalado, 6 x 3 min',
    );
    const limiar = runSession(base({ type: 'intervalado', fitness: FIFTY }));
    expect(limiar.headline).toBe('Hoje: limiar, 3 x 8 min');
    expect(limiar.steps[1]?.detail).toMatch(/^4:15\/km/);
    // Beginners: short strong bits and plenty of jogging.
    expect(runSession(base({ type: 'intervalado', level: 'iniciante' })).headline).toBe(
      'Hoje: fartlek, 6 x 1 min',
    );
  });

  const HALF: Race = { distance_km: 21, date: '2027-01-17', from: '2026-10-19' };

  it('com prova de meia, a qualidade é no limiar', () => {
    expect(runSession(base({ type: 'intervalado', today: '2026-10-26', race: HALF })).kind).toBe(
      'limiar',
    );
  });

  it('longão: distância do ciclo, travada em 10 % sobre o maior dos últimos 30 dias', () => {
    const sunday = '2026-11-08';
    const free = runSession(base({ type: 'longo', today: sunday, race: HALF }));
    expect(free.headline).toBe('Hoje: longão de 9 km');
    expect(free.why).toContain('Sem corridas registradas nos últimos 30 dias');
    expect(free.why).toContain('Faltam 10 semanas para a prova de 21 km (meia maratona).');
    const capped = runSession(
      base({ type: 'longo', today: sunday, race: HALF, runs: [run('2026-11-01', 6)] }),
    );
    expect(capped.headline).toBe('Hoje: longão de 6,5 km');
    expect(capped.why).toMatch(/^O ciclo pede 9 km, mas seu maior longão dos últimos 30 dias/);
  });

  it('longão sem prova: por tempo sem histórico; com histórico, até 10 % a mais', () => {
    expect(runSession(base({ type: 'longo', today: '2026-10-25' })).headline).toBe(
      'Hoje: longão de 60 min',
    );
    expect(
      runSession(base({ type: 'longo', today: '2026-10-25', runs: [run('2026-10-18', 10)] }))
        .headline,
    ).toBe('Hoje: longão de 11 km');
  });

  it('maratona: nas últimas semanas da subida, o fim do longão no ritmo da prova', () => {
    const race: Race = { distance_km: 42, date: '2027-04-04', from: '2026-10-19' };
    const s = runSession(base({ type: 'longo', today: '2027-02-07', race, fitness: FIFTY }));
    expect(s.headline).toBe('Hoje: longão de 25 km');
    expect(s.steps.map((x) => x.label)).toEqual(['19 km', '6 km finais']);
    expect(s.steps[1]?.detail).toMatch(/^no ritmo da prova, 4:31\/km/);
  });

  it('reta final: menos repetições, o mesmo ritmo', () => {
    const many = [1, 2, 3, 4, 5].map((i) =>
      run(addDays('2027-01-04', -i * 7), 8, { run_type: 'intervalado' }),
    );
    const s = runSession(
      base({ type: 'intervalado', today: '2027-01-06', race: HALF, runs: many }),
    );
    expect(s.headline).toBe('Hoje: limiar, 2 x 15 min');
    expect(s.why).toMatch(/^Reta final/);
  });

  it('semana da prova e o dia da prova', () => {
    expect(
      runSession(base({ type: 'intervalado', today: '2027-01-13', race: HALF })).headline,
    ).toBe('Hoje: leve com 4 tiros curtos');
    expect(runSession(base({ type: 'leve', today: '2027-01-13', race: HALF })).headline).toBe(
      'Hoje: corrida leve de 25 min',
    );
    const day = runSession(base({ type: 'longo', today: HALF.date, race: HALF, fitness: FIFTY }));
    expect(day.headline).toBe('Hoje: prova de 21 km');
    expect(day.steps[0]).toEqual({
      label: 'Primeiros 2 km',
      detail: 'uns 5 s/km mais devagar que 4:20/km',
    });
  });
});
