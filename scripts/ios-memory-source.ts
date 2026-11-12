import { buildMemory, exerciseHint, type MemoryInput } from '../src/analysis/memory';
import type { LocalRow } from '../src/analysis/context';

export function memoryCases() {
  const exercise = 'supino-reto-barra';
  const item = { id: 'routine-item', routine_id: 'routine', exercise_id: exercise };
  const saved = (id: number, status = 'proposed'): LocalRow => ({
    status,
    binding: {
      session: {
        id: `session-${id}`,
        status: 'done',
        routine_id: 'routine',
        local_date: `2026-11-0${id}`,
        started_at: id,
      },
      items: [{ exercise_id: exercise, note: 'private-note-canary' }],
      routineItems: [item],
    },
    reply: {
      avaliacao: 'abaixo',
      summary: 'Treino concluído.',
      points: [],
      proximaVez: [{ slot: 0, comentario: 'Mantenha o controle na descida.' }],
      adjustment: {
        operation: 'series',
        slot: 0,
        sets: 2,
        min: null,
        max: null,
        replacement: null,
      },
    },
  });
  const base: MemoryInput = {
    routineID: 'routine',
    date: '2026-11-12',
    before: 10,
    items: [item],
    analyses: [],
  };
  const cases: { name: string; input: MemoryInput; routineItems?: LocalRow[] }[] = [
    { name: 'zero', input: base },
    { name: 'one', input: { ...base, analyses: [saved(1)] } },
    {
      name: 'three',
      input: { ...base, analyses: [saved(1, 'saved'), saved(3, 'refused'), saved(2, 'undone')] },
    },
    { name: 'limit', input: { ...base, analyses: [saved(1), saved(4), saved(3), saved(2)] } },
    {
      name: 'changed',
      input: {
        ...base,
        items: [{ ...item, exercise_id: 'agachamento-livre' }],
        analyses: [saved(1)],
      },
      routineItems: [{ ...item, exercise_id: 'agachamento-livre' }],
    },
    {
      name: 'custom',
      input: { ...base, items: [{ ...item, exercise_id: 'private-custom' }], analyses: [saved(1)] },
    },
    { name: 'ambiguous', input: { ...base, items: [item, item], analyses: [saved(1)] } },
    { name: 'day21', input: { ...base, date: '2026-11-22', analyses: [saved(1)] } },
    { name: 'expired', input: { ...base, date: '2026-11-23', analyses: [saved(1)] } },
    { name: 'future', input: { ...base, before: 1, analyses: [saved(1)] } },
    { name: 'otherRoutine', input: { ...base, routineID: 'another', analyses: [saved(1)] } },
    {
      name: 'recreatedRow',
      input: { ...base, analyses: [saved(1)] },
      routineItems: [{ ...item, id: 'new-item' }],
    },
    { name: 'pendingMetadata', input: { ...base, analyses: [{ status: 'pending' }, saved(1)] } },
  ];
  const newest = saved(3);
  (newest.reply as LocalRow).proximaVez = [];
  cases.push({ name: 'latestOnly', input: { ...base, analyses: [saved(1), newest] } });
  const digits = saved(1);
  (digits.reply as LocalRow).proximaVez = [{ slot: 0, comentario: 'Faça 20 repetições.' }];
  cases.push({ name: 'noNumbersInHint', input: { ...base, analyses: [digits] } });
  return cases.map((v) => ({
    ...v,
    routineItems: v.routineItems ?? [item],
    exercise,
    expected: buildMemory(v.input),
    hint: exerciseHint(v.input, exercise, v.routineItems ?? [item]),
  }));
}
