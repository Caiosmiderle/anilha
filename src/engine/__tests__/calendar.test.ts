import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calendarArtifacts } from '../../../scripts/ios-calendar-source';
import { calendarDays } from '../calendar';
import { recommendDay } from '../recommend';

const vectors = calendarArtifacts();
const input = vectors[0]!.input;
const today = (index: number) => vectors[index]!.expected.find((d) => d.date === input.today)!;
describe('calendário de força e corridas', () => {
  it('mantém os 15 vetores Swift gerados pelo TS', () => {
    expect(
      JSON.parse(
        readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/calendar.json', 'utf8'),
      ),
    ).toEqual(vectors);
  });
  it('reúne força e corrida, preserva as duas e abre pelos IDs reais', () => {
    expect(today(1).events.map((e) => [e.kind, e.status])).toEqual([
      ['strength', 'done'],
      ['run', 'done'],
    ]);
    expect(today(1).events[0]?.sessionID).toBe('session');
    expect(today(1).events[1]).toMatchObject({ runID: 'run', distanceKm: 5 });
    expect(today(2).events.map((e) => e.sessionID)).toEqual(['second', 'session']);
  });
  it('preserva desconhecido e zero, ignora feita, ativos, lápides e outro cardio', () => {
    expect(today(4).events).toEqual([]);
    expect(today(5).events[0]?.distanceKm).toBeNull();
    const events = vectors[5]!.expected
      .find((d) => d.date === '2026-11-13')!
      .events.filter((e) => e.kind === 'run');
    expect(events.map((e) => [e.externalID, e.status, e.distanceKm, e.important])).toEqual([
      ['external', 'planned', 0, true],
      ['missed', 'missed', null, true],
    ]);
  });
  it('reutiliza o aviso da recomendação na véspera importante, com opt-out', () => {
    const rec = recommendDay({
      today: input.today,
      plan: input.plans[0]!,
      sessions: [],
      runs: [],
      externalPlans: input.externalPlans,
    });
    expect(today(0).warnings).toEqual(
      rec.alerts.filter((a) => a.kind === 'legs_before_run').map((a) => a.text),
    );
    expect(today(0).warnings[0]).toContain('2026-11-13');
    expect(today(6).warnings).toEqual([]);
    expect(today(7).warnings).toEqual([]);
    expect(today(8).events).toEqual([]);
    expect(today(9).warnings).toEqual(['Corrida amanhã cedo, então perna fica para outro dia.']);
  });
  it('projeta rodízio, prefere ficha do plano e respeita o plano da semana', () => {
    expect(today(13).events[0]).toMatchObject({
      title: 'Perna do plano',
      routineID: 'generated',
      status: 'planned',
    });
    expect(vectors[14]!.expected.find((d) => d.date === '2026-11-16')!.events[0]?.split).toBe(
      'peito_triceps',
    );
    expect(vectors[10]!.expected[0]?.date).toBe('2026-12-01');
  });
  it('cobre mês vazio, passado, bissexto e ausência de plano sem inventar previsão', () => {
    expect(
      calendarDays({ ...input, plans: [], externalPlans: [] }).every((d) => d.events.length === 0),
    ).toBe(true);
    expect(vectors[11]!.expected.flatMap((d) => d.events)).toHaveLength(1);
    expect(vectors[12]!.expected.at(-1)?.date).toBe('2028-02-29');
    expect(today(3).events.every((e) => e.status === 'done')).toBe(true);
  });
});
