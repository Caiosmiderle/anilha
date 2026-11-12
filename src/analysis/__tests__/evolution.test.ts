import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { evolutionCases } from '../../../scripts/ios-evolution-source';
import { buildEvolution, exerciseHistory, exerciseNext } from '../evolution';
import { buildAnalysisContext } from '../context';
import { estimatedCost, parseReply, parseUsage, validContext } from '../contract';
import { EXERCISES } from '../../engine/exercises';
import { openDb, type AnilhaDB } from '../../data/db';
import { setCurrent } from '../../data/store';
import { startSession } from '../../data/ops';
import type { PlannedItem } from '../../engine/adjust';

let db: AnilhaDB | undefined;
afterEach(async () => {
  setCurrent(null);
  if (db) {
    db.close();
    await db.delete();
    db = undefined;
  }
});
const get = (name: string) => evolutionCases().find((v) => v.name === name)!;
describe('evolução local e máximos simples', () => {
  it('compara qualquer ficha, usa cinco ocorrências e exclui sessões futuras', () => {
    const v = get('records'),
      row = buildEvolution(v.input)[0]!;
    expect(row.days_ago).toBe(1);
    expect(row.max_load_delta).toBe(2.5);
    expect(row.volume).toBe(930);
    expect(row.volume_delta).toBe(90);
    expect(row.same_load).toEqual([{ load_kg: 30, delta: 2 }]);
    expect(row.load_record).toBe(true);
    expect(row.reps_records).toEqual([{ load_kg: 30, reps: 14 }]);
    expect(get('oldRecord').expected[0]!.load_record).toBe(false);
    expect(get('oldRecord').expected[0]!.reps_records).toEqual([]);
    expect(get('increase').next?.rule).toBe('increase');
    expect(get('decrease').next?.rule).toBe('decrease');
    expect(exerciseHistory(v.input, 'supino-reto-barra').map((h) => h.days_ago)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    const context = buildAnalysisContext(v.input);
    expect(context.items[0]!.history).toHaveLength(5);
    expect(context.items[0]!.next).toEqual(v.next);
    expect(
      validContext(
        context,
        EXERCISES.map((e) => e.name),
      ),
    ).toBe(true);
    expect(
      validContext(
        {
          ...context,
          items: [
            {
              ...context.items[0],
              history: [{ ...context.items[0]!.history[0], note: 'private-canary' }],
            },
          ],
        },
        EXERCISES.map((e) => e.name),
      ),
    ).toBe(false);
    expect(
      validContext(
        {
          ...context,
          items: [
            { ...context.items[0], next: { ...context.items[0]!.next, note: 'private-canary' } },
          ],
        },
        EXERCISES.map((e) => e.name),
      ),
    ).toBe(false);
  });
  it('preserva os exercícios executados antes e depois da troca', () => {
    const rows = get('swapped').expected;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.exercise).toBe('Remada baixa na polia');
    expect(rows[0]!.days_ago).toBeNull();
    expect(rows[0]!.load_record).toBe(false);
    expect(rows[1]!.today).toHaveLength(3);
    expect(rows[1]!.load_record).toBe(true);
    expect(get('swapped').next).toBeNull();
  });
  it('tempo compara segundos e deixa volume indisponível, primeira vez cria uma base', () => {
    const time = get('timed').expected[0]!;
    expect(time.volume).toBeNull();
    expect(time.volume_delta).toBeNull();
    expect(time.same_load).toEqual([{ load_kg: null, delta: 5 }]);
    expect(time.reps_records).toEqual([]);
    expect(get('customTimed').expected[0]!.same_load).toEqual(time.same_load);
    expect(get('customTimed').expected[0]!.volume).toBeNull();
    expect(JSON.stringify(buildAnalysisContext(get('customTimed').input))).not.toContain(
      'private-',
    );
    const first = get('first').expected[0]!;
    expect(first.previous).toEqual([]);
    expect(first.max_load_delta).toBeNull();
    expect(first.reps_records).toEqual([]);
    expect(first.load_record).toBe(false);
    expect(get('missing').expected[0]!.volume).toBeNull();
    expect(get('lower').expected[0]!.max_load_delta).toBe(-10);
    expect(get('equal').expected[0]!.volume_delta).toBe(0);
    expect(get('unavailable').next).toBeNull();
  });
  it.each([
    'records',
    'timed',
    'first',
    'deload',
    'pounds',
    'lower',
    'equal',
    'increase',
    'decrease',
    'customTimed',
  ])('next coincide com as séries gravadas por startSession, %s', async (name) => {
    const { input, next } = get(name);
    db = openDb(`evolution-${crypto.randomUUID()}`);
    await db.open();
    setCurrent({ db, userId: 'synthetic-owner' });
    const current = input.tables.sessions!.find((s) => s.id === input.sessionID)!;
    for (const [table, rows] of Object.entries(input.tables)) {
      await db
        .table(table)
        .bulkPut(
          rows.filter(
            (r) => table !== 'sessions' || Number(r.started_at) <= Number(current.started_at),
          ),
        );
    }
    const item = input.tables.routine_items![0]!;
    const id = await startSession({
      title: 'Ficha sintética',
      split_key: 'peito_triceps',
      routine_id: 'routine',
      source: 'routine',
      today: String(current.local_date),
      items: [item as unknown as PlannedItem],
    });
    const written = (await db.sets.where('session_id').equals(id).toArray())
      .filter((s) => s.kind === 'work')
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ load_kg: s.load_kg, reps: s.reps, seconds: s.seconds }));
    expect(next?.sets).toEqual(written);
    expect(
      exerciseNext(
        input,
        input.tables.session_items!.find((i) => i.session_id === input.sessionID)!,
      ),
    ).toEqual(next);
  });
  it('valida avaliação e comentários, preserva formato antigo e calcula custo dos tokens informados', () => {
    const old = { summary: 'Treino concluído.', points: [], adjustment: null };
    expect(parseReply(old, 1, [])).toEqual(old);
    expect(parseReply(old, 1, [], false)).toBeNull();
    const modern = {
      ...old,
      avaliacao: 'boa',
      proximaVez: [{ slot: 0, comentario: 'Repita com controle.' }],
    };
    expect(parseReply(modern, 1, [], false)).toEqual(modern);
    expect(parseReply({ ...modern, avaliacao: 'inventada' }, 1, [])).toBeNull();
    expect(
      parseReply(
        { ...modern, proximaVez: [{ slot: 0, comentario: 'Controle.', reps: 99 }] },
        1,
        [],
      ),
    ).toBeNull();
    const usage = { model: 'claude-haiku-5-5', input_tokens: 1000, output_tokens: 150 };
    expect(parseUsage(usage)).toEqual(usage);
    expect(estimatedCost(usage)).toBeCloseTo(0.000175, 9);
    expect(estimatedCost({ ...usage, model: 'unknown' })).toBeNull();
    expect(parseUsage({ ...usage, input_tokens: -1 })).toBeNull();
  });
});
