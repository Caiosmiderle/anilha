import { describe, expect, it } from 'vitest';
import { addDays, weekday } from '../dates';
import { EXERCISES_BY_ID } from '../exercises';
import { EXAMPLE_TODAY, exampleWeek } from '../fixtures/exampleWeek';
import { summarizeSessions } from '../history';
import type { RunSummary, SessionSummary } from '../recommend';
import { fatigueAlerts, planForDay, recommendDay, weekCounts } from '../recommend';
import { splitHasLegs, SPLITS } from '../taxonomy';
import type { PlanDay, PlanRow, SplitKey } from '../types';

const data = exampleWeek('u1');
const summaries = summarizeSessions(data.sessions, data.items, EXERCISES_BY_ID);

function plan(days: Partial<PlanDay>[], extra: Partial<PlanRow> = {}): PlanRow {
  const full: PlanDay[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    kind: 'rest',
    split_key: null,
    run_type: null,
    time: '06:00',
    ...(days[weekday] ?? {}),
  }));
  return {
    id: 'p',
    user_id: 'u',
    updated_at: 0,
    deleted: false,
    active_from: '2026-01-05',
    gym_per_week: full.filter((d) => d.kind === 'gym').length,
    run_per_week: full.filter((d) => d.kind === 'run').length,
    days: full,
    rules: { no_legs_before_run: true },
    params: null,
    reasons: [],
    ...extra,
  };
}

function session(day: string, split: SplitKey): SessionSummary {
  return {
    id: `s-${day}`,
    local_date: day,
    split_key: split,
    title: SPLITS[split].label,
    muscles: SPLITS[split].muscles,
    exercises: [],
  };
}

// Mon gym costas, Tue run, Wed gym peito, Thu rest, Fri gym perna, Sat rest, Sun run
const EXAMPLE_PLAN = plan([
  { kind: 'gym', split_key: 'costas_biceps' },
  { kind: 'run', run_type: 'leve' },
  { kind: 'gym', split_key: 'peito_triceps' },
  {},
  { kind: 'gym', split_key: 'perna' },
  {},
  { kind: 'run', run_type: 'longo' },
]);

describe('recomendação do dia', () => {
  it('6. semana de exemplo gera aviso de volume e de repetição de grupo', () => {
    const alerts = fatigueAlerts({
      today: EXAMPLE_TODAY,
      plan: data.plan,
      sessions: summaries,
      runs: [],
    });
    const texts = alerts.map((a) => a.text);
    expect(texts).toContain('5 treinos em 7 dias, o plano é 3 de academia.');
    expect(texts).toContain('Costas e bíceps duas vezes em 6 dias.');
  });

  it('18/10 com a semana de exemplo: descanso ou leve, citando os dois avisos', () => {
    const rec = recommendDay({
      today: EXAMPLE_TODAY,
      plan: data.plan,
      sessions: summaries,
      runs: [],
    });
    expect(['rest', 'light']).toContain(rec.kind);
    expect(rec.reason).toMatch(/5 treinos em 7 dias/);
    expect(rec.reason).toMatch(/Costas e bíceps duas vezes em 6 dias/);
    expect(rec.excess).toBe(true);
  });

  it('18/10 antes do treino de domingo: descanso ou algo leve', () => {
    const before = summaries.filter((s) => s.local_date < EXAMPLE_TODAY);
    const rec = recommendDay({ today: EXAMPLE_TODAY, plan: data.plan, sessions: before, runs: [] });
    expect(rec.kind).toBe('light');
    expect(rec.headline).toBe('Hoje: descanso ou algo leve');
    expect(rec.reason).toMatch(/Costas e bíceps duas vezes em 6 dias/);
  });

  it('11. véspera de corrida: a sugestão de hoje nunca é perna', () => {
    // Thursday, run planned on Friday; legs is the only split left this week.
    const p = plan([
      { kind: 'gym', split_key: 'costas_biceps' },
      {},
      { kind: 'gym', split_key: 'peito_triceps' },
      { kind: 'gym', split_key: 'perna' },
      { kind: 'run', run_type: 'longo' },
      {},
      {},
    ]);
    const sessions = [
      session('2026-10-12', 'costas_biceps'),
      session('2026-10-14', 'peito_triceps'),
    ];
    const rec = recommendDay({ today: '2026-10-15', plan: p, sessions, runs: [] });
    expect(rec.split_key === null || !splitHasLegs(rec.split_key)).toBe(true);
    expect(rec.kind).not.toBe('gym');
    expect(rec.reason).toMatch(/Corrida forte amanhã/);

    // An easy run tomorrow does not move legs.
    const easy = {
      ...p,
      days: p.days.map((d) => (d.kind === 'run' ? { ...d, run_type: 'leve' as const } : d)),
    };
    expect(recommendDay({ today: '2026-10-15', plan: easy, sessions, runs: [] }).split_key).toBe(
      'perna',
    );
    // CRUNNING decides when it plans that day: an easy run there frees legs, an important one does not.
    const crunning = (important: boolean) => ({
      user_id: 'u',
      updated_at: 1,
      deleted: false,
      id: `c-${important}`,
      source: 'crunning' as const,
      kind: 'corrida' as const,
      origin_id: 'x',
      local_date: '2026-10-16',
      run_type: 'leve' as const,
      source_type: null,
      name: 'Fictícia',
      distance_m: null,
      duration_sec: null,
      important,
      status: 'planejada' as const,
    });
    expect(
      recommendDay({
        today: '2026-10-15',
        plan: p,
        sessions,
        runs: [],
        externalPlans: [crunning(false)],
      }).split_key,
    ).toBe('perna');
    expect(
      recommendDay({
        today: '2026-10-15',
        plan: easy,
        sessions,
        runs: [],
        externalPlans: [crunning(true)],
      }).split_key,
    ).not.toBe('perna');

    // Same thing when today is a catch-up day: still no legs.
    for (const today of ['2026-10-13', '2026-10-15', '2026-10-17']) {
      const r = recommendDay({ today, plan: EXAMPLE_PLAN, sessions: [], runs: [] });
      const tomorrowRun = EXAMPLE_PLAN.days[weekday(addDays(today, 1))]?.kind === 'run';
      if (tomorrowRun) expect(splitHasLegs(r.split_key)).toBe(false);
    }
  });

  it('11b. override de corrida amanhã também bloqueia perna', () => {
    const rec = recommendDay({
      today: '2026-10-16',
      plan: EXAMPLE_PLAN,
      sessions: [session('2026-10-12', 'costas_biceps'), session('2026-10-14', 'peito_triceps')],
      runs: [],
      overrides: [{ local_date: '2026-10-17', action: 'run', value: null }],
    });
    expect(splitHasLegs(rec.split_key)).toBe(false);
  });

  it('12. plano cumprido: 3 de academia feitos num plano de 3, hoje não é academia', () => {
    const sessions = [
      session('2026-10-12', 'costas_biceps'),
      session('2026-10-14', 'peito_triceps'),
      session('2026-10-16', 'perna'),
    ];
    for (const today of ['2026-10-17', '2026-10-18']) {
      const rec = recommendDay({ today, plan: EXAMPLE_PLAN, sessions, runs: [] });
      expect(rec.kind).not.toBe('gym');
    }
    const runs: RunSummary[] = [
      { id: 'r1', local_date: '2026-10-13', distance_km: 5, rpe: 5, run_type: 'leve' },
    ];
    const rec = recommendDay({ today: '2026-10-18', plan: EXAMPLE_PLAN, sessions, runs });
    expect(rec.kind).toBe('run');
    expect(rec.run_type).toBe('longo');
  });

  it('segue o plano num dia normal e explica o porquê', () => {
    const rec = recommendDay({ today: '2026-10-12', plan: EXAMPLE_PLAN, sessions: [], runs: [] });
    expect(rec.kind).toBe('gym');
    expect(rec.split_key).toBe('costas_biceps');
    expect(rec.reason).toBe(
      'Dia de costas e bíceps no seu plano. Faltam 3 de academia nesta semana.',
    );
  });

  it('descanso planejado conta como cumprido', () => {
    const rec = recommendDay({
      today: '2026-10-15',
      plan: EXAMPLE_PLAN,
      sessions: [session('2026-10-12', 'costas_biceps'), session('2026-10-14', 'peito_triceps')],
      runs: [{ id: 'r', local_date: '2026-10-13', distance_km: 5, rpe: 4, run_type: 'leve' }],
    });
    expect(rec.kind).toBe('rest');
    expect(rec.reason).toMatch(/Descanso planejado/);
  });

  it('treino pulado: a semana se adapta e puxa o que ficou para trás', () => {
    // Monday skipped. Tuesday is a run day, Wednesday comes with costas still owed.
    const rec = recommendDay({
      today: '2026-10-14',
      plan: EXAMPLE_PLAN,
      sessions: [],
      runs: [{ id: 'r', local_date: '2026-10-13', distance_km: 5, rpe: 4, run_type: 'leve' }],
    });
    expect(rec.kind).toBe('gym');
    expect(rec.split_key).toBe('peito_triceps');
    // Thursday (planned rest): 2 gym sessions owed, only Friday left.
    const thu = recommendDay({
      today: '2026-10-15',
      plan: EXAMPLE_PLAN,
      sessions: [session('2026-10-14', 'peito_triceps')],
      runs: [{ id: 'r', local_date: '2026-10-13', distance_km: 5, rpe: 4, run_type: 'leve' }],
    });
    expect(thu.kind).toBe('gym');
    expect(thu.split_key).toBe('costas_biceps');
  });

  it('corrida conta na fadiga das pernas: longão ontem tira perna de hoje', () => {
    const rec = recommendDay({
      today: '2026-10-16',
      plan: EXAMPLE_PLAN,
      sessions: [session('2026-10-12', 'costas_biceps'), session('2026-10-14', 'peito_triceps')],
      runs: [{ id: 'r', local_date: '2026-10-15', distance_km: 16, rpe: 7, run_type: 'longo' }],
    });
    expect(splitHasLegs(rec.split_key)).toBe(false);
    expect(rec.alerts.some((a) => a.kind === 'run_legs')).toBe(true);
  });

  it('mesmo grupo articular: ombro posterior ontem aparece como alerta', () => {
    const sat: SessionSummary = {
      ...session('2026-10-17', 'costas_biceps'),
      exercises: [{ name: 'Crucifixo inverso com halteres', muscles: ['ombro_posterior'] }],
    };
    const p = plan([
      {},
      {},
      {},
      {},
      {},
      { kind: 'gym', split_key: 'costas_biceps' },
      { kind: 'gym', split_key: 'ombro_abdomen' },
    ]);
    const rec = recommendDay({ today: '2026-10-18', plan: p, sessions: [sat], runs: [] });
    expect(rec.split_key).toBe('ombro_abdomen');
    expect(rec.alerts.find((a) => a.kind === 'overlap')?.text).toBe(
      'Ombro posterior já trabalhou ontem (crucifixo inverso com halteres). Alivie ou pule hoje.',
    );
  });

  it('plano vigente da semana e contagem', () => {
    const p2 = { ...EXAMPLE_PLAN, id: 'p2', active_from: '2026-10-15', gym_per_week: 4 };
    expect(planForDay([EXAMPLE_PLAN, p2], '2026-10-13')?.id).toBe('p2');
    expect(planForDay([EXAMPLE_PLAN, p2], '2026-10-06')?.id).toBe('p');
    const w = weekCounts('2026-10-18', EXAMPLE_PLAN, summaries, []);
    expect(w).toMatchObject({ done_gym: 5, planned_gym: 3, week_start: '2026-10-12' });
  });
});
