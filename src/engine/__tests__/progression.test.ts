import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISES_BY_ID } from '../exercises';
import { EXAMPLE_TODAY, exampleWeek } from '../fixtures/exampleWeek';
import { buildExerciseLogs } from '../history';
import type { ExerciseLog, LoggedSet } from '../progression';
import {
  lastTimeFill,
  nextLoadUp,
  prefillFromSuggestion,
  repsBeforeJump,
  suggestNext,
} from '../progression';
import { EFFORT_OPTIONS } from '../taxonomy';
import type { ExerciseDef } from '../types';

const NEXT_DAY = '2026-10-25';

function ex(id: string): ExerciseDef {
  const e = EXERCISES_BY_ID.get(id);
  if (!e) throw new Error(id);
  return e;
}

function work(load: number | null, reps: number[], rirs: (number | null)[] = []): LoggedSet[] {
  return reps.map((r, i) => ({
    kind: 'work',
    load_kg: load,
    reps: r,
    seconds: null,
    rir: rirs[i] ?? null,
  }));
}

function log(date: string, min: number, max: number, sets: LoggedSet[]): ExerciseLog {
  return { local_date: date, session_id: `s-${date}`, target_min: min, target_max: max, sets };
}

describe('dupla progressão: cenários de treino', () => {
  it('1. elevação lateral 6 kg, [15,15,15]: 8 kg é 33% a mais, pede 26 repetições antes de subir', () => {
    const s = suggestNext({
      exercise: ex('elevacao-lateral'),
      logs: [log(EXAMPLE_TODAY, 12, 15, work(6, [15, 15, 15]))],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('reps_first');
    expect(s.load_kg).toBe(6);
    expect(s.reason).toBe(
      'Bateu 15 ou mais em todas as séries, mas 8 kg é 33% a mais e as repetições cairiam abaixo de 12.',
    );
    expect(s.goal).toBe('Fique em 6 kg e busque 26 repetições em todas antes de subir.');
    expect(s.target_min).toBe(12);
  });

  it('2. encolhimento 20 kg, [15,15,15], última RIR 0: mantém e pede mais folga', () => {
    const s = suggestNext({
      exercise: ex('encolhimento-halteres'),
      logs: [log(EXAMPLE_TODAY, 12, 15, work(20, [15, 15, 15], [1, 1, 0]))],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('hold_effort');
    expect(s.load_kg).toBe(20);
    expect(s.goal).toMatch(/Fique em 20 kg e repita com mais folga/);
  });

  it('3. desenvolvimento 12 kg, [12,11,10] em 10-12: mantém e soma repetições', () => {
    const s = suggestNext({
      exercise: ex('desenvolvimento-halteres-sentado'),
      logs: [log(EXAMPLE_TODAY, 10, 12, work(12, [12, 11, 10]))],
      target: { sets: 3, min: 10, max: 12 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('hold_reps');
    expect(s.load_kg).toBe(12);
    expect(s.goal).toMatch(/some repetições até 12/);
  });

  it('4. elevação de pernas, peso corporal, [15,15,15] com RIR [3,3,0]: mantém, depois variação ou carga', () => {
    const e = ex('elevacao-pernas-cadeira');
    const s = suggestNext({
      exercise: e,
      logs: [log(EXAMPLE_TODAY, 12, 15, work(null, [15, 15, 15], [3, 3, 0]))],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('hold_effort');
    expect(s.load_kg).toBeNull();
    expect(s.goal).toMatch(/Repita com mais folga/);
    expect(s.goal).toMatch(/pernas mais esticadas, descida mais lenta/);
    expect(s.goal).toMatch(/adicione carga/);
  });

  it('7. superação: 2 ou mais acima do topo em todas sobe sem esperar outra sessão', () => {
    const s = suggestNext({
      exercise: ex('supino-reto-barra'),
      logs: [log(EXAMPLE_TODAY, 8, 12, work(40, [14, 15, 14], [null, null, 2]))],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('increase');
    expect(s.confidence).toBe('normal');
    expect(s.load_kg).toBe(42);
    expect(s.reason).toBe('Passou de 12 com sobra em todas as séries, com folga na última.');
  });

  it('supino com 12 em todas uma vez repete a carga; duas seguidas, sobe', () => {
    const first = log('2026-10-14', 8, 12, work(40, [12, 12, 12], [null, null, 2]));
    const once = suggestNext({
      exercise: ex('supino-reto-barra'),
      logs: [first],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(once.kind).toBe('confirm');
    expect(once.load_kg).toBe(40);
    expect(once.reason).toBe('Bateu 12 ou mais em todas as séries pela primeira vez com 40 kg.');
    expect(once.goal).toBe('Repita 40 kg: se bater o topo de novo, a carga sobe.');
    expect(prefillFromSuggestion(once, 0)).toEqual({ load_kg: 40, value: 12 });

    const twice = suggestNext({
      exercise: ex('supino-reto-barra'),
      logs: [first, log(EXAMPLE_TODAY, 8, 12, work(40, [12, 12, 12], [null, null, 2]))],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(twice.kind).toBe('increase');
    expect(twice.load_kg).toBe(42);
    expect(twice.reason).toBe(
      'Bateu 12 ou mais em todas as séries pela segunda sessão seguida, com folga na última.',
    );
    expect(twice.goal).toBe('Suba para 42 kg e volte para 8 repetições.');
  });

  it('o topo na sessão anterior com outra carga não conta como segunda vez', () => {
    const s = suggestNext({
      exercise: ex('supino-reto-barra'),
      logs: [
        log('2026-10-14', 8, 12, work(38, [12, 12, 12], [null, null, 2])),
        log(EXAMPLE_TODAY, 8, 12, work(40, [12, 12, 12], [null, null, 2])),
      ],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('confirm');
  });

  it('halter: desenvolvimento 12 kg em 12, 14 kg é 17% a mais; com 17 em todas, sobe', () => {
    const e = ex('desenvolvimento-halteres-sentado');
    const target = { sets: 3, min: 10, max: 12 };
    const s = suggestNext({
      exercise: e,
      logs: [log(EXAMPLE_TODAY, 10, 12, work(12, [12, 12, 12], [null, null, 2]))],
      target,
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('reps_first');
    expect(s.goal).toBe('Fique em 12 kg e busque 17 repetições em todas antes de subir.');
    const up = suggestNext({
      exercise: e,
      logs: [log(EXAMPLE_TODAY, 10, 12, work(12, [17, 17, 17], [null, null, 2]))],
      target,
      today: NEXT_DAY,
    });
    expect(up.kind).toBe('increase');
    expect(up.goal).toBe('Suba para 14 kg e volte para 10 repetições.');
  });

  it('salto enorme para a carga: pede no máximo 30 repetições', () => {
    const s = suggestNext({
      exercise: ex('elevacao-lateral'),
      logs: [log(EXAMPLE_TODAY, 12, 15, work(4, [15, 15, 15], [null, null, 3]))],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('reps_first');
    expect(s.goal).toMatch(/busque 30 repetições/);
  });

  it('repetições antes do salto: 2,5% da carga por repetição, a partir do piso', () => {
    expect(repsBeforeJump(40, 42, 8)).toBe(10);
    expect(repsBeforeJump(6, 8, 12)).toBe(26);
    expect(repsBeforeJump(100, 100, 8)).toBe(8);
  });

  it('8. primeira vez: sem histórico não sugere carga, só a meta', () => {
    const s = suggestNext({
      exercise: ex('face-pull'),
      logs: [],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('first_time');
    expect(s.load_kg).toBeNull();
    expect(s.based_on).toBeNull();
    expect(s.goal).toBe('Meta: 3x 12-15. Esta sessão vira a base.');
    expect(prefillFromSuggestion(s, 0)).toEqual({ load_kg: null, value: null });
  });

  it('9. destreino: último registro há mais de 3 semanas não sobe, mesmo no topo', () => {
    const s = suggestNext({
      exercise: ex('elevacao-lateral'),
      logs: [log('2026-09-01', 12, 15, work(6, [15, 15, 15], [3, 3, 3]))],
      target: { sets: 3, min: 12, max: 15 },
      today: '2026-10-01',
    });
    expect(s.kind).toBe('retrain');
    expect(s.load_kg).toBe(6);
    expect(s.goal).toMatch(/Repita 6 kg ou reduza para 4 kg/);
  });

  it('10. aquecimento ignorado: a sugestão sai só das séries de trabalho do exemplo', () => {
    const data = exampleWeek('u1');
    const logs = buildExerciseLogs('elevacao-lateral', data.sessions, data.items, data.sets);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.sets.filter((s) => s.kind === 'warmup')).toHaveLength(2);
    const s = suggestNext({
      exercise: ex('elevacao-lateral'),
      logs,
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(s.based_on?.load_kg).toBe(8);
    expect(s.based_on?.values).toEqual([13, 14, 15]);
    expect(s.kind).toBe('hold_reps');
    expect(s.load_kg).toBe(8);
  });

  it('substituição: séries do encolhimento contam para o encolhimento, não para o face pull', () => {
    const data = exampleWeek('u1');
    expect(buildExerciseLogs('face-pull', data.sessions, data.items, data.sets)).toHaveLength(0);
    const shrug = buildExerciseLogs('encolhimento-halteres', data.sessions, data.items, data.sets);
    expect(shrug[0]?.sets.map((s) => s.reps)).toEqual([12, 13, 14]);
  });
});

describe('dupla progressão: bordas', () => {
  const lateral = ex('elevacao-lateral');

  it('série única no topo com folga: uma vez repete, duas seguidas sobem', () => {
    const once = suggestNext({
      exercise: ex('remada-baixa'),
      logs: [log('2026-10-18', 8, 12, work(42.5, [12], [2]))],
      target: { sets: 1, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(once.kind).toBe('confirm');
    const twice = suggestNext({
      exercise: ex('remada-baixa'),
      logs: [
        log('2026-10-15', 8, 12, work(42.5, [12], [2])),
        log('2026-10-18', 8, 12, work(42.5, [12], [2])),
      ],
      target: { sets: 1, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(twice.kind).toBe('increase');
  });

  it('faixa de 1 repetição (15-15): a carga nova só cabe passando do topo; 14 fica abaixo do piso', () => {
    const target = { sets: 3, min: 15, max: 15 };
    const first = suggestNext({
      exercise: ex('abdominal-polia'),
      logs: [log('2026-10-18', 15, 15, work(50, [15, 15, 15], [null, null, 3]))],
      target,
      today: NEXT_DAY,
    });
    expect(first.kind).toBe('reps_first');
    expect(first.goal).toMatch(/busque 17 repetições/);
    const up = suggestNext({
      exercise: ex('abdominal-polia'),
      logs: [log('2026-10-18', 15, 15, work(50, [17, 17, 17], [null, null, 3]))],
      target,
      today: NEXT_DAY,
    });
    expect(up.kind).toBe('increase');
    const hold = suggestNext({
      exercise: ex('abdominal-polia'),
      logs: [log('2026-10-18', 15, 15, work(50, [15, 15, 14], [null, null, 3]))],
      target,
      today: NEXT_DAY,
    });
    expect(hold.kind).toBe('hold_below');
  });

  it('abaixo do piso: mantém na primeira vez e reduz na segunda seguida', () => {
    const once = suggestNext({
      exercise: lateral,
      logs: [
        log('2026-10-11', 12, 15, work(8, [12, 12, 12])),
        log('2026-10-18', 12, 15, work(8, [12, 10, 9])),
      ],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(once.kind).toBe('hold_below');
    expect(once.load_kg).toBe(8);
    const twice = suggestNext({
      exercise: lateral,
      logs: [
        log('2026-10-11', 12, 15, work(8, [11, 10, 9])),
        log('2026-10-18', 12, 15, work(8, [12, 10, 9])),
      ],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(twice.kind).toBe('decrease');
    expect(twice.load_kg).toBe(6);
  });

  it('esforço faltando só na última série: sobe com confiança menor e avisa', () => {
    const s = suggestNext({
      exercise: ex('remada-baixa'),
      logs: [
        log('2026-10-15', 8, 12, work(42.5, [12, 12, 12], [3, 2, 2])),
        log('2026-10-18', 8, 12, work(42.5, [12, 12, 12], [3, 2, null])),
      ],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('increase');
    expect(s.confidence).toBe('low');
    expect(s.missing_effort).toBe(true);
    expect(s.reason).toMatch(/faltou registrar o esforço/);
  });

  it('exercício de tempo: prancha no topo duas vezes com folga progride a variação, em segundos', () => {
    const plank = ex('prancha');
    const timed = (secs: number[]): LoggedSet[] =>
      secs.map((sec, i) => ({
        kind: 'work',
        load_kg: null,
        reps: null,
        seconds: sec,
        rir: i === 2 ? 2 : null,
      }));
    const once = suggestNext({
      exercise: plank,
      logs: [log('2026-10-18', 30, 45, timed([45, 45, 50]))],
      target: { sets: 3, min: 30, max: 45 },
      today: NEXT_DAY,
    });
    expect(once.kind).toBe('confirm');
    expect(once.goal).toMatch(/^Repita: se bater o topo de novo, progrida a variação/);
    const s = suggestNext({
      exercise: plank,
      logs: [
        log('2026-10-15', 30, 45, timed([45, 45, 45])),
        log('2026-10-18', 30, 45, timed([45, 45, 50])),
      ],
      target: { sets: 3, min: 30, max: 45 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('progress_variation');
    expect(s.measure).toBe('time');
    expect(s.reason).toMatch(/45 s/);
    expect(s.goal).toMatch(/pés mais afastados/);
  });

  it('exercício de tempo dentro da faixa: some segundos', () => {
    const sets: LoggedSet[] = [40, 35, 30].map((sec) => ({
      kind: 'work',
      load_kg: null,
      reps: null,
      seconds: sec,
      rir: null,
    }));
    const s = suggestNext({
      exercise: ex('prancha'),
      logs: [log('2026-10-18', 30, 45, sets)],
      target: { sets: 3, min: 30, max: 45 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('hold_reps');
    expect(s.goal).toMatch(/Some segundos até 45 s/);
  });

  it('peso corporal com carga extra progride pela carga, sem a trava do salto', () => {
    const s = suggestNext({
      exercise: ex('barra-fixa'),
      logs: [
        log('2026-10-15', 6, 10, work(5, [10, 10, 10], [null, null, 2])),
        log('2026-10-18', 6, 10, work(5, [10, 10, 10], [null, null, 2])),
      ],
      target: { sets: 3, min: 6, max: 10 },
      today: NEXT_DAY,
    });
    expect(s.kind).toBe('increase');
    expect(s.load_kg).toBe(7.5);
  });

  it('troca de unidade: em lb usa incremento em libras e o texto sai em lb', () => {
    const hundredLb = 100 / 2.2046226218;
    const s = suggestNext({
      exercise: ex('supino-reto-barra'),
      logs: [
        log('2026-10-15', 8, 12, work(hundredLb, [12, 12, 12], [null, null, 3])),
        log('2026-10-18', 8, 12, work(hundredLb, [12, 12, 12], [null, null, 3])),
      ],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
      unit: 'lb',
    });
    expect(s.kind).toBe('increase');
    expect(s.goal).toMatch(/Suba para 105 lb/);
    expect(Math.round((s.load_kg ?? 0) * 2.2046226218 * 10) / 10).toBe(105);
    expect(nextLoadUp(6, 2, 'kg')).toBe(8);
  });

  it('decimal com vírgula no texto', () => {
    const top = (date: string) => log(date, 8, 12, work(42.5, [12, 12, 12], [null, null, 2]));
    const once = suggestNext({
      exercise: ex('remada-baixa'),
      logs: [top('2026-10-18')],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(once.goal).toBe('Repita 42,5 kg: se bater o topo de novo, a carga sobe.');
    const s = suggestNext({
      exercise: ex('remada-baixa'),
      logs: [top('2026-10-15'), top('2026-10-18')],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(s.goal).toMatch(/Suba para 45 kg/);
    const hold = suggestNext({
      exercise: ex('remada-baixa'),
      logs: [log('2026-10-18', 8, 12, work(42.5, [12, 11, 10]))],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(hold.goal).toMatch(/42,5 kg/);
  });

  it('modo retorno acrescenta a dica de RIR 2 a 3', () => {
    const s = suggestNext({
      exercise: lateral,
      logs: [],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
      returnMode: true,
    });
    expect(s.rir_hint).toMatch(/2 a 3 repetições na reserva/);
  });

  it('rótulos de esforço guardam RIR: fácil 3, ok 2, pesado 1, no limite 0', () => {
    expect(EFFORT_OPTIONS.map((o) => [o.label, o.rir])).toEqual([
      ['Fácil', 3],
      ['Ok', 2],
      ['Pesado', 1],
      ['No limite', 0],
    ]);
  });

  it('pré-preenchimento: depois de subir, carga nova e piso da faixa', () => {
    const s = suggestNext({
      exercise: ex('remada-baixa'),
      logs: [
        log('2026-10-15', 8, 12, work(42.5, [12, 12, 12], [null, null, 3])),
        log('2026-10-18', 8, 12, work(42.5, [12, 12, 12], [null, null, 3])),
      ],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(prefillFromSuggestion(s, 1)).toEqual({ load_kg: 45, value: 8 });
    const hold = suggestNext({
      exercise: lateral,
      logs: [log('2026-10-18', 12, 15, work(6, [15, 14, 13]))],
      target: { sets: 3, min: 12, max: 15 },
      today: NEXT_DAY,
    });
    expect(prefillFromSuggestion(hold, 2)).toEqual({ load_kg: 6, value: 13 });
  });
  it('pirâmide: cada série fica com a sua carga e só a mais pesada sobe', () => {
    const pyramid = (loads: number[], reps: number[]): LoggedSet[] =>
      loads.map((load, i) => ({
        kind: 'work',
        load_kg: load,
        reps: reps[i] ?? null,
        seconds: null,
        rir: 3,
      }));
    const down = suggestNext({
      exercise: ex('supino-reto-barra'),
      logs: [
        log('2026-10-15', 8, 12, pyramid([40, 30, 20], [12, 12, 12])),
        log('2026-10-18', 8, 12, pyramid([40, 30, 20], [12, 12, 12])),
      ],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(down.kind).toBe('increase');
    const up = down.load_kg as number;
    expect(up).toBeGreaterThan(40);
    expect(down.goal).toContain('a série mais pesada');
    expect([0, 1, 2].map((i) => prefillFromSuggestion(down, i))).toEqual([
      { load_kg: up, value: 8 },
      { load_kg: 30, value: 12 },
      { load_kg: 20, value: 12 },
    ]);
    // Turning it down goes back to each set as it was.
    expect(lastTimeFill(down, 0)).toEqual({ load_kg: 40, value: 12 });

    // Crescente, reps caindo: nada sobe, e a primeira não herda a carga da última.
    const rising = suggestNext({
      exercise: ex('supino-reto-barra'),
      logs: [log('2026-10-18', 8, 12, pyramid([20, 25, 30], [12, 10, 8]))],
      target: { sets: 3, min: 8, max: 12 },
      today: NEXT_DAY,
    });
    expect(rising.kind).toBe('hold_reps');
    expect([0, 1, 2, 3].map((i) => prefillFromSuggestion(rising, i))).toEqual([
      { load_kg: 20, value: 12 },
      { load_kg: 25, value: 10 },
      { load_kg: 30, value: 8 },
      { load_kg: 30, value: 8 },
    ]);
  });
});

describe('a regra vale para todos os exercícios do catálogo', () => {
  // A typical load for each kind: bodyweight lifts and timed ones without extra load.
  const loadOf = (e: ExerciseDef) => (e.bodyweight || e.measure === 'time' ? null : 30);
  const session = (e: ExerciseDef, date: string, value: number) => {
    const sets: LoggedSet[] = [0, 1, 2].map((i) => ({
      kind: 'work',
      load_kg: loadOf(e),
      reps: e.measure === 'time' ? null : value,
      seconds: e.measure === 'time' ? value : null,
      rir: i === 2 ? 2 : null,
    }));
    return log(date, 8, 12, sets);
  };
  const target = { sets: 3, min: 8, max: 12 };

  it.each(EXERCISES.map((e) => [e.name, e] as const))(
    '%s: o topo uma vez não sobe; duas seguidas sobem (ou pedem repetições antes)',
    (_name, e) => {
      const once = suggestNext({
        exercise: e,
        logs: [session(e, '2026-10-18', 12)],
        target,
        today: NEXT_DAY,
      });
      expect(['confirm', 'reps_first']).toContain(once.kind);
      const twice = suggestNext({
        exercise: e,
        logs: [session(e, '2026-10-15', 12), session(e, '2026-10-18', 12)],
        target,
        today: NEXT_DAY,
      });
      expect(['increase', 'progress_variation', 'reps_first']).toContain(twice.kind);
      // Never a jump that lands below the floor of the range.
      if (twice.kind === 'increase' && twice.load_kg != null && !e.bodyweight) {
        expect(repsBeforeJump(30, twice.load_kg, target.min)).toBeLessThanOrEqual(12);
      }
    },
  );
});
