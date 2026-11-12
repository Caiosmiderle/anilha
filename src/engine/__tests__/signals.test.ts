import { describe, expect, it } from 'vitest';
import {
  adherencePct,
  rankGroup,
  weekRecognitions,
  weekReport,
  weeklySummary,
  weeksInARow,
} from '../adherence';
import { painAdvice, yesterdayOverlap } from '../advice';
import { EXERCISES, EXERCISES_BY_ID } from '../exercises';
import { EXAMPLE_TODAY, exampleWeek } from '../fixtures/exampleWeek';
import { parseQuickEntry } from '../quickEntry';
import { detectRecords, estimate1RM, runMilestones } from '../records';
import { returnModeState } from '../returnMode';
import type { PlanDay } from '../types';

const ex = (id: string) => {
  const e = EXERCISES_BY_ID.get(id);
  if (!e) throw new Error(id);
  return e;
};

describe('biblioteca', () => {
  it('tem pelo menos 80 exercícios, ids únicos e os dos exemplos', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(80);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const id of [
      'elevacao-lateral',
      'desenvolvimento-halteres-sentado',
      'encolhimento-halteres',
      'face-pull',
      'crucifixo-inverso',
      'prancha',
      'elevacao-pernas-cadeira',
      'abdominal-polia',
      'prancha-lateral',
    ]) {
      expect(EXERCISES_BY_ID.has(id)).toBe(true);
    }
  });
});

describe('5. substituição e pulo ficam registrados', () => {
  it('o histórico do domingo guarda face pull virando encolhimento e o crucifixo pulado com motivo', () => {
    const data = exampleWeek('u1');
    const sunday = data.items.filter((i) => i.session_id === `demo-session-${EXAMPLE_TODAY}`);
    const shrug = sunday.find((i) => i.exercise_id === 'encolhimento-halteres');
    expect(shrug?.original_exercise_id).toBe('face-pull');
    const fly = sunday.find((i) => i.exercise_id === 'crucifixo-inverso');
    expect(fly?.status).toBe('skipped');
    expect(fly?.skip_reason).toBe('Já feito no sábado');
    const skipped = sunday.filter((i) => i.status === 'skipped').map((i) => i.exercise_id);
    expect(skipped).toEqual(['crucifixo-inverso', 'prancha', 'abdominal-polia', 'prancha-lateral']);
  });
});

describe('13. entrada rápida', () => {
  const lateral = ex('elevacao-lateral');
  it('"6kg 15 15 15 pesado" vira três séries de trabalho com RIR 1 na última', () => {
    const r = parseQuickEntry('6kg 15 15 15 pesado', { current: lateral });
    expect(r.ok).toBe(true);
    expect(r.sets).toEqual([
      { kind: 'work', load_kg: 6, reps: 15, seconds: null, rir: null },
      { kind: 'work', load_kg: 6, reps: 15, seconds: null, rir: null },
      { kind: 'work', load_kg: 6, reps: 15, seconds: null, rir: 1 },
    ]);
    expect(r.preview).toBe(
      'Elevação lateral com halteres: 3 séries de trabalho, 6 kg × 15. Última: pesado.',
    );
  });

  it('"prancha 40s 3x" encontra a prancha e cria três séries de 40 s', () => {
    const r = parseQuickEntry('prancha 40s 3x', { current: lateral, candidates: EXERCISES });
    expect(r.ok).toBe(true);
    expect(r.exercise_id).toBe('prancha');
    expect(r.sets.map((s) => s.seconds)).toEqual([40, 40, 40]);
  });

  it('aceita vírgula decimal, 3x10, aquecimento e esforço por série', () => {
    const a = parseQuickEntry('12,5 kg 3x10', { current: lateral });
    expect(a.sets).toHaveLength(3);
    expect(a.sets[0]?.load_kg).toBe(12.5);
    const w = parseQuickEntry('4kg 2x15 aquecimento', { current: lateral });
    expect(w.sets.every((s) => s.kind === 'warmup' && s.rir === null)).toBe(true);
    const e = parseQuickEntry('20kg 15 fácil 15 ok 15 no limite', { current: lateral });
    expect(e.sets.map((s) => s.rir)).toEqual([3, 2, 0]);
  });

  it('se não entende, não salva e devolve o que não entendeu', () => {
    const r = parseQuickEntry('6kg quinze quinze', { current: lateral });
    expect(r.ok).toBe(false);
    expect(r.unknown.length).toBeGreaterThan(0);
    expect(r.text).toBe('6kg quinze quinze');
    expect(parseQuickEntry('', { current: lateral }).ok).toBe(false);
    expect(parseQuickEntry('6kg 999', { current: lateral }).ok).toBe(false);
  });
});

describe('14. sinal de dor', () => {
  it('dor no ombro no desenvolvimento faz a próxima sessão de ombro sugerir troca ou corte', () => {
    const reports = [
      {
        local_date: EXAMPLE_TODAY,
        exercise_id: 'desenvolvimento-halteres-sentado',
        joint: 'ombro' as const,
      },
    ];
    const next = '2026-10-22';
    const press = painAdvice({
      exercise: ex('desenvolvimento-halteres-sentado'),
      reports,
      today: next,
      library: EXERCISES,
    });
    expect(press).not.toBeNull();
    expect(['trocar', 'cortar']).toContain(press?.action);
    expect(press?.text).toMatch(
      /^Dor no ombro marcada em 18\/10 no desenvolvimento com halteres sentado\./,
    );
    const lateral = painAdvice({
      exercise: ex('elevacao-lateral'),
      reports,
      today: next,
      library: EXERCISES,
    });
    expect(lateral).not.toBeNull();
    // Shrugs do not load the shoulder joint: no advice.
    expect(
      painAdvice({
        exercise: ex('encolhimento-halteres'),
        reports,
        today: next,
        library: EXERCISES,
      }),
    ).toBeNull();
    // Old pain fades out.
    expect(
      painAdvice({
        exercise: ex('elevacao-lateral'),
        reports,
        today: '2026-11-20',
        library: EXERCISES,
      }),
    ).toBeNull();
  });

  it('dor no joelho no agachamento sugere troca sem joelho no mesmo grupo quando existe', () => {
    const reports = [
      { local_date: '2026-10-16', exercise_id: 'agachamento-livre', joint: 'joelho' as const },
    ];
    const a = painAdvice({
      exercise: ex('leg-press-45'),
      reports,
      today: '2026-10-20',
      library: EXERCISES,
    });
    expect(a?.action).toBe('trocar');
    for (const alt of a?.alternatives ?? []) expect(alt.joints).not.toContain('joelho');
  });

  it('feito ontem: crucifixo inverso no sábado sugere pular no domingo', () => {
    const msg = yesterdayOverlap({
      exercise: ex('crucifixo-inverso'),
      today: EXAMPLE_TODAY,
      recent: [{ local_date: '2026-10-17', exercise: ex('crucifixo-inverso') }],
    });
    expect(msg).toBe('Feito ontem. Pule hoje ou faça leve.');
  });
});

describe('modo retorno', () => {
  it('liga após mais de 3 semanas sem treino e dura 4 semanas', () => {
    const s = returnModeState({
      today: '2026-10-12',
      trainingDates: ['2026-08-01'],
      setting: 'auto',
    });
    expect(s.active).toBe(true);
    expect(s.reason).toBe('pausa');
    const during = returnModeState({
      today: '2026-10-30',
      trainingDates: ['2026-08-01', '2026-10-12', '2026-10-14'],
      setting: 'auto',
    });
    expect(during).toMatchObject({ active: true, started_on: '2026-10-12', ends_on: '2026-11-08' });
    const after = returnModeState({
      today: '2026-11-09',
      trainingDates: ['2026-08-01', '2026-10-12', '2026-10-30'],
      setting: 'auto',
    });
    expect(after.active).toBe(false);
  });

  it('pode ser ligado e desligado à mão', () => {
    expect(returnModeState({ today: '2026-10-18', trainingDates: [], setting: 'on' }).active).toBe(
      true,
    );
    expect(
      returnModeState({ today: '2026-10-18', trainingDates: ['2026-01-01'], setting: 'off' })
        .active,
    ).toBe(false);
  });
});

function planDays(gym: number[], run: number[]): PlanDay[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    kind: gym.includes(weekday) ? 'gym' : run.includes(weekday) ? 'run' : 'rest',
    split_key: null,
    run_type: null,
    time: '06:00',
  }));
}

describe('17. reconhecimento', () => {
  const plan = { gym_per_week: 3, run_per_week: 2, days: planDays([0, 2, 4], [1, 6]) };

  it('plano de 3 academia e 2 corridas cumprido, com descanso, gera reconhecimento', () => {
    const r = weekReport({
      day: '2026-10-12',
      today: '2026-10-19',
      plan,
      gymDates: ['2026-10-12', '2026-10-14', '2026-10-16'],
      runDates: ['2026-10-13', '2026-10-18'],
    });
    expect(r.status).toBe('cumprida');
    expect(r.rest_days).toBe(2);
    expect(r.pct).toBe(1);
    const rec = weekRecognitions(r, 1);
    expect(rec[0]).toMatchObject({
      kind: 'semana',
      title: 'Semana cumprida',
      value: '5 de 5',
      pastel: 'butter',
    });
    expect(rec[0]?.detail).toBe('2 dias de descanso, como planejado.');
  });

  it('5 de academia num plano de 3 não parabeniza e mostra o desvio', () => {
    const r = weekReport({
      day: '2026-10-12',
      today: '2026-10-19',
      plan,
      gymDates: ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-17', '2026-10-18'],
      runDates: [],
    });
    expect(r.status).toBe('desvio');
    expect(weekRecognitions(r, 0)).toEqual([]);
    expect(r.text).toBe(
      '5 de academia num plano de 3. Excesso conta como desvio. Faltou: 2 corridas.',
    );
    expect(r.text).not.toMatch(/parab|incr[ií]vel|arras/i);
    const summary = weeklySummary({
      report: r,
      records: [],
      runMilestones: [],
      nextWeekPlan: plan,
      returnMode: true,
    });
    expect(summary.focus).toMatch(/^Segurar 3 de academia e 2 corridas/);
  });

  it('semanas seguidas no plano, sem sequência de dias', () => {
    const plans = [{ ...plan, active_from: '2026-09-28', updated_at: 0 }];
    const gym = [
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
      '2026-10-14',
      '2026-10-16',
    ];
    const run = ['2026-10-06', '2026-10-11', '2026-10-13', '2026-10-18'];
    expect(weeksInARow('2026-10-20', plans, gym, run)).toBe(2);
  });

  it('recordes pessoais detectados, primeira sessão é a base', () => {
    const mk = (date: string, load: number, reps: number[]) => ({
      local_date: date,
      session_id: date,
      target_min: 8,
      target_max: 12,
      sets: reps.map((r) => ({
        kind: 'work' as const,
        load_kg: load,
        reps: r,
        seconds: null,
        rir: null,
      })),
    });
    const events = detectRecords(
      [
        mk('2026-10-01', 60, [10, 10]),
        mk('2026-10-08', 62.5, [8, 8]),
        mk('2026-10-15', 62.5, [12, 10]),
      ],
      ex('supino-reto-barra'),
    );
    expect(events.map((e) => e.kind)).toEqual(['carga', 'e1rm']);
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 20)).toBeNull();
  });

  it('marcos de corrida: primeira vez em 10 km e 21 km', () => {
    const m = runMilestones([
      { id: 'a', local_date: '2026-10-01', distance_km: 8, duration_sec: 3000 },
      { id: 'b', local_date: '2026-10-08', distance_km: 10.2, duration_sec: 3900 },
      { id: 'c', local_date: '2026-10-15', distance_km: 21.1, duration_sec: 8460 },
    ]);
    expect(m.map((x) => x.label)).toEqual(['Primeira vez nos 10 km', 'Primeira meia maratona']);
  });
});

describe('18. ranking do grupo', () => {
  it('5 de 3 e 3 de 3 empatam em 100%; 2 de 3 fica abaixo', () => {
    const rows = rankGroup([
      { id: 'b', name: 'Bia', planned_gym: 3, planned_run: 0, done_gym: 2, done_run: 0 },
      { id: 'a', name: 'Ana', planned_gym: 3, planned_run: 0, done_gym: 5, done_run: 0 },
      { id: 'c', name: 'Caio', planned_gym: 3, planned_run: 0, done_gym: 3, done_run: 0 },
    ]);
    expect(rows.map((r) => [r.name, r.pct, r.position])).toEqual([
      ['Ana', 1, 1],
      ['Caio', 1, 1],
      ['Bia', 2 / 3, 3],
    ]);
  });

  it('a porcentagem nunca passa de 100% e corrida extra não compensa academia faltando', () => {
    expect(adherencePct({ gym: 3, run: 2 }, { gym: 5, run: 4 })).toBe(1);
    expect(adherencePct({ gym: 3, run: 2 }, { gym: 2, run: 4 })).toBe(0.8);
  });
});
