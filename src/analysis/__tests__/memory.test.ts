import { describe, expect, it } from 'vitest';
import { memoryCases } from '../../../scripts/ios-memory-source';
import { analysisCases } from '../../../scripts/ios-analysis-source';
import { reviewCases } from '../../../scripts/ios-review-source';
import { buildAnalysisContext } from '../context';
import { buildReviewContext } from '../../review/context';
import { validContext, ANALYSIS_SYSTEM } from '../contract';
import { validReviewContext, REVIEW_SYSTEM } from '../../review/contract';
import { EXERCISES } from '../../engine/exercises';
import { MEMORY_PROMPT, validMemory } from '../memory-contract';

const vectors = memoryCases();
const find = (name: string) => vectors.find((v) => v.name === name)!;
const names = [...EXERCISES.map((e) => e.name), 'Exercício personalizado'];
describe('memória curta e dica local', () => {
  it('limita a três da ficha, ordena e projeta somente a saída da IA', () => {
    expect(find('zero').expected).toEqual([]);
    expect(find('one').expected).toHaveLength(1);
    expect(find('three').expected.map((m) => m.days_ago)).toEqual([9, 10, 11]);
    expect(find('three').expected.map((m) => m.adjustment?.status)).toEqual([
      'recusado',
      'desfeito',
      'aplicado',
    ]);
    expect(find('one').expected[0]?.adjustment?.status).toBe('pendente');
    expect(find('limit').expected.map((m) => m.days_ago)).toEqual([8, 9, 10]);
    expect(find('otherRoutine').expected).toEqual([]);
    expect(find('future').expected).toEqual([]);
    expect(find('pendingMetadata').expected).toEqual(find('one').expected);
    for (const v of vectors) {
      expect(validMemory(v.expected, v.input.items.length)).toBe(true);
      expect(JSON.stringify(v.expected)).not.toMatch(
        /private-|exercise_id|routine_id|summary|note/,
      );
    }
  });
  it('associa por catálogo e oculta dica trocada, vencida, ambígua ou numérica', () => {
    expect(find('one').hint).toBe('Mantenha o controle na descida.');
    expect(find('day21').hint).toBe(find('one').hint);
    for (const name of [
      'changed',
      'custom',
      'ambiguous',
      'expired',
      'recreatedRow',
      'latestOnly',
      'noNumbersInHint',
    ])
      expect(find(name).hint).toBeNull();
    expect(find('changed').expected[0]?.items[0]?.slot).toBeNull();
    expect(find('changed').expected[0]?.adjustment?.slot).toBeNull();
  });
  it('aceita clientes com e sem memory em ambos os validadores e rejeita campo livre ou excesso', () => {
    const a = buildAnalysisContext(analysisCases()[0]!.input);
    const r = reviewCases()[0]!;
    const b = buildReviewContext(r.input, r.routineID, false);
    for (const [ctx, validate] of [
      [a, validContext],
      [b, validReviewContext],
    ] as const) {
      const { memory: _memory, ...old } = ctx;
      expect(validate(old, names)).toBe(true);
      expect(validate({ ...ctx, memory: find('three').expected }, names)).toBe(true);
      expect(
        validate({ ...ctx, memory: [{ ...find('one').expected[0], note: 'private' }] }, names),
      ).toBe(false);
      expect(validate({ ...ctx, memory: Array(4).fill(find('one').expected[0]) }, names)).toBe(
        false,
      );
      expect(validate({ ...ctx, memory: null }, names)).toBe(false);
    }
    expect(
      validMemory(
        [{ ...find('one').expected[0], items: [{ slot: 0, comentario: 'a'.repeat(181) }] }],
        1,
      ),
    ).toBe(false);
    expect(
      validMemory(
        [
          {
            ...find('one').expected[0],
            adjustment: { slot: 0, operation: 'carga', status: 'recusado' },
          },
        ],
        1,
      ),
    ).toBe(false);
    expect(ANALYSIS_SYSTEM).toContain(MEMORY_PROMPT);
    expect(REVIEW_SYSTEM).toContain(MEMORY_PROMPT);
  });
  it('inclui as análises guardadas nos dois construtores de contexto', () => {
    const c = structuredClone(analysisCases()[0]!.input);
    const session = c.tables.sessions!.find((s) => s.id === c.sessionID)!;
    const saved = structuredClone(find('one').input.analyses[0]!);
    const binding = saved.binding as { session: Record<string, unknown> };
    binding.session.routine_id = session.routine_id;
    binding.session.local_date = session.local_date;
    binding.session.started_at = Number(session.started_at) - 1;
    c.analyses = [saved];
    expect(buildAnalysisContext(c).memory?.[0]?.adjustment?.status).toBe('pendente');
    const r = structuredClone(reviewCases()[0]!);
    binding.session.routine_id = r.routineID;
    binding.session.local_date = r.input.today;
    r.input.analyses = [saved];
    expect(buildReviewContext(r.input, r.routineID, false).memory?.[0]?.avaliacao).toBe('abaixo');
  });
});
