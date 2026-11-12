import { describe, expect, it } from 'vitest';
import { funnel, segmentOf, type AdminUser } from '../crm';

const TODAY = '2026-10-19';

function user(extra: Partial<AdminUser>): AdminUser {
  return {
    id: 'u',
    email: 'u@test.dev',
    name: null,
    created_at: '2026-09-01T12:00:00Z',
    last_sign_in_at: null,
    plan: true,
    workouts: 0,
    cardio: 0,
    first_day: null,
    last_day: null,
    weeks: 0,
    friends: 0,
    push: false,
    health: null,
    terms: null,
    open_tickets: 0,
    admin: false,
    ...extra,
  };
}

describe('segmentos do painel', () => {
  it('conta de até 7 dias é nova, treinando ou não', () => {
    expect(segmentOf(user({ created_at: '2026-10-13T15:00:00Z' }), TODAY)).toBe('novo');
    expect(
      segmentOf(user({ created_at: '2026-10-18T15:00:00Z', last_day: TODAY, workouts: 1 }), TODAY),
    ).toBe('novo');
    // 8 days: no longer new.
    expect(segmentOf(user({ created_at: '2026-10-11T15:00:00Z' }), TODAY)).toBe('sem_treino');
  });

  it('pelo último treino: ativo até 6 dias, em risco até 21, inativo depois', () => {
    expect(segmentOf(user({ last_day: '2026-10-13', workouts: 3 }), TODAY)).toBe('ativo');
    expect(segmentOf(user({ last_day: '2026-10-12', workouts: 3 }), TODAY)).toBe('risco');
    expect(segmentOf(user({ last_day: '2026-09-28', cardio: 2 }), TODAY)).toBe('risco');
    expect(segmentOf(user({ last_day: '2026-09-27', cardio: 2 }), TODAY)).toBe('inativo');
  });

  it('a conta nasce no dia do Brasil, não no dia UTC', () => {
    // 01:30 UTC of the 12th is 22:30 of the 11th in São Paulo: 8 days before the 19th.
    expect(segmentOf(user({ created_at: '2026-10-12T01:30:00Z' }), TODAY)).toBe('sem_treino');
  });
});

describe('funil', () => {
  it('cada etapa conta quem chegou nela', () => {
    const users = [
      user({ plan: false }),
      user({}),
      user({ workouts: 1, weeks: 1, last_day: '2026-10-01' }),
      user({ workouts: 5, cardio: 2, weeks: 3, last_day: '2026-10-18' }),
    ];
    expect(funnel(users, TODAY).map((s) => s.value)).toEqual([4, 3, 2, 1, 1]);
  });
});
