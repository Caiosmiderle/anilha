import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { deloadAdvice, deloadSets, trainingStreak, type DeloadInput } from '../deload';

const TODAY = '2026-10-21'; // a Wednesday
// One workout every Monday, for n weeks back (this week included).
const weeksOf = (n: number) => Array.from({ length: n }, (_, i) => addDays('2026-10-19', -7 * i));

function input(over: Partial<DeloadInput>): DeloadInput {
  return {
    today: TODAY,
    gymDates: [],
    deloadWeeks: [],
    recordDates: [],
    workSets: [],
    acceptedWeek: null,
    dismissedOn: null,
    returnMode: false,
    ...over,
  };
}

describe('semana leve', () => {
  it('sequência: semanas seguidas com treino; semana vazia ou leve interrompe', () => {
    expect(trainingStreak(TODAY, weeksOf(6), [])).toBe(6);
    // This week empty so far: counts from last week.
    expect(trainingStreak(TODAY, weeksOf(6).slice(1), [])).toBe(5);
    // A week off three weeks ago.
    const gap = weeksOf(6).filter((d) => d !== '2026-09-28');
    expect(trainingStreak(TODAY, gap, [])).toBe(3);
    expect(trainingStreak(TODAY, weeksOf(6), ['2026-10-05'])).toBe(2);
  });

  it('8 semanas seguidas: sugere', () => {
    const r = deloadAdvice(input({ gymDates: weeksOf(8), recordDates: ['2026-10-19'] }));
    expect(r).toMatchObject({ state: 'suggest', weeks: 8 });
  });

  it('5 semanas sem recorde em 4: sugere; com recorde recente: não', () => {
    expect(deloadAdvice(input({ gymDates: weeksOf(5) })).state).toBe('suggest');
    expect(deloadAdvice(input({ gymDates: weeksOf(5), recordDates: ['2026-10-12'] })).state).toBe(
      'none',
    );
  });

  it('5 semanas e muita série até o limite: sugere', () => {
    const workSets = Array.from({ length: 12 }, (_, i) => ({
      local_date: '2026-10-19',
      rir: i < 6 ? 0 : 2,
    }));
    const r = deloadAdvice(input({ gymDates: weeksOf(5), recordDates: ['2026-10-19'], workSets }));
    expect(r.state).toBe('suggest');
    if (r.state === 'suggest') expect(r.reasons[0]).toContain('50% das séries');
  });

  it('modo retorno, recusa recente e semana aceita', () => {
    expect(deloadAdvice(input({ gymDates: weeksOf(9), returnMode: true })).state).toBe('none');
    expect(deloadAdvice(input({ gymDates: weeksOf(9), dismissedOn: '2026-10-15' })).state).toBe(
      'none',
    );
    expect(deloadAdvice(input({ gymDates: weeksOf(9), dismissedOn: '2026-10-01' })).state).toBe(
      'suggest',
    );
    expect(deloadAdvice(input({ acceptedWeek: '2026-10-19' })).state).toBe('active');
  });

  it('séries da semana leve: metade, no mínimo uma', () => {
    expect([1, 2, 3, 4, 5].map(deloadSets)).toEqual([1, 1, 2, 2, 3]);
  });
});
