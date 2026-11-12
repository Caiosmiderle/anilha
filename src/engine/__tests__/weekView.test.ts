import { describe, expect, it } from 'vitest';
import type { PlanDay, PlanRow, SplitKey } from '../types';
import { commonTime, projectDays, type WeekViewInput } from '../weekView';

/** Monday 19/10/2026 to Sunday 25/10/2026. */
const MON = '2026-10-19';
const ROT: SplitKey[] = ['peito_triceps', 'costas_biceps', 'perna'];

function day(weekday: number, kind: PlanDay['kind'], extra: Partial<PlanDay> = {}): PlanDay {
  return {
    weekday,
    kind,
    split_key: null,
    run_type: kind === 'run' ? 'leve' : null,
    time: '16:00',
    ...extra,
  };
}

/** 5 of gym and 2 runs, like the plan in the screenshot: runs on Wednesday and Sunday. */
const PLAN: Pick<PlanRow, 'days' | 'rules'> = {
  days: [
    day(0, 'gym'),
    day(1, 'gym'),
    day(2, 'run'),
    day(3, 'gym'),
    day(4, 'gym'),
    day(5, 'gym'),
    day(6, 'run', { run_type: 'longo' }),
  ],
  rules: { no_legs_before_run: true, rotation: ROT } as PlanRow['rules'],
};

const base = (over: Partial<WeekViewInput> = {}): WeekViewInput => ({
  plan: PLAN,
  sessions: [],
  runs: [],
  today: MON,
  ...over,
});

const what = (list: ReturnType<typeof projectDays>) =>
  list.map((d) => (d.kind === 'gym' ? (d.split_key ?? 'gym') : d.kind));

describe('a semana com a ficha de cada dia', () => {
  it('cada dia de academia ganha a ficha do rodízio, em vez de "ficha da vez"', () => {
    const list = projectDays(base(), MON, 7);
    expect(list.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    // Tuesday is the eve of a run: legs (C) waits, so B goes, and C comes on Thursday.
    expect(what(list)).toEqual([
      'peito_triceps',
      'costas_biceps',
      'run',
      'perna',
      'peito_triceps',
      'costas_biceps',
      'run',
    ]);
    expect(list[0]?.state).toBe('hoje');
    expect(list[1]?.state).toBe('por_vir');
  });

  it('perna nunca na véspera de corrida: a ficha seguinte sem perna vai antes', () => {
    // Last done: B on Sunday, so C (legs) is next; Tuesday comes before Wednesday's run.
    const list = projectDays(
      base({ sessions: [{ local_date: '2026-10-18', split_key: 'costas_biceps' }] }),
      MON,
      3,
    );
    expect(what(list)).toEqual(['perna', 'peito_triceps', 'run']);
    // With the rule off, the rotation goes in order.
    const off = projectDays(
      base({
        plan: { ...PLAN, rules: { ...PLAN.rules, no_legs_before_run: false } },
        sessions: [{ local_date: '2026-10-17', split_key: 'peito_triceps' }],
      }),
      MON,
      2,
    );
    expect(what(off)).toEqual(['costas_biceps', 'perna']);
  });

  it('dias que passaram mostram o que foi feito, ou que passou', () => {
    const wed = '2026-10-21';
    const list = projectDays(
      base({
        today: wed,
        sessions: [{ local_date: MON, split_key: 'peito_triceps' }],
        runs: [],
      }),
      MON,
      4,
    );
    expect(list.map((d) => d.state)).toEqual(['feito', 'passou', 'hoje', 'por_vir']);
    expect(list[0]?.split_key).toBe('peito_triceps');
    // Thursday continues the rotation after A: B.
    expect(list[3]?.split_key).toBe('costas_biceps');
  });

  it('hoje segue a tela Hoje, e o rodízio continua depois dela', () => {
    const list = projectDays(
      base({ todayRec: { kind: 'gym', split_key: 'costas_biceps', run_type: null } }),
      MON,
      2,
    );
    expect(what(list)).toEqual(['costas_biceps', 'peito_triceps']);
    const rest = projectDays(
      base({ todayRec: { kind: 'light', split_key: null, run_type: null } }),
      MON,
      2,
    );
    expect(what(rest)).toEqual(['light', 'peito_triceps']);
  });

  it('mudança de um dia só (descanso) vale na projeção', () => {
    const list = projectDays(
      base({ overrides: [{ local_date: '2026-10-20', action: 'rest' }] }),
      MON,
      2,
    );
    expect(what(list)).toEqual(['peito_triceps', 'rest']);
  });

  it('plano sem rodízio usa a ficha marcada no dia', () => {
    const fixed = {
      days: [
        day(0, 'gym', { split_key: 'perna' }),
        day(1, 'rest'),
        day(2, 'rest'),
        day(3, 'rest'),
        day(4, 'rest'),
        day(5, 'rest'),
        day(6, 'rest'),
      ],
      rules: { no_legs_before_run: true, rotation: null } as unknown as PlanRow['rules'],
    };
    expect(what(projectDays(base({ plan: fixed }), MON, 2))).toEqual(['perna', 'rest']);
  });

  it('horário comum só quando todos os dias têm o mesmo', () => {
    expect(commonTime(PLAN)).toBe('16:00');
    expect(commonTime({ days: [day(0, 'gym'), day(1, 'run', { time: '07:00' })] })).toBeNull();
  });
});
