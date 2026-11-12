import { describe, expect, it } from 'vitest';
import { SHARE_MAX_EXERCISES, shareCardData } from '../shareCard';

const START = Date.UTC(2026, 9, 19, 9, 0, 0);
const session = {
  title: 'Peito e tríceps',
  local_date: '2026-10-19',
  started_at: START,
  ended_at: START + 52 * 60 * 1000,
};
const exercises = new Map([
  ['supino', { name: 'Supino reto com barra', measure: 'weight_reps' as const, bodyweight: false }],
  ['flexao', { name: 'Flexão de braços', measure: 'reps' as const, bodyweight: true }],
  ['prancha', { name: 'Prancha', measure: 'time' as const, bodyweight: true }],
  ['crucifixo', { name: 'Crucifixo', measure: 'weight_reps' as const, bodyweight: false }],
]);
const item = (id: string, exercise_id: string, position: number, status = 'done' as const) => ({
  id,
  exercise_id,
  position,
  status: status as 'done' | 'skipped',
});
const set = (
  item_id: string,
  load_kg: number | null,
  reps: number | null,
  seconds: number | null = null,
  kind: 'work' | 'warmup' = 'work',
) => ({ item_id, kind, load_kg, reps, seconds, completed_at: START + 1000 });

const items = [
  item('i2', 'flexao', 1),
  item('i1', 'supino', 0),
  item('i3', 'prancha', 2),
  { ...item('i4', 'crucifixo', 3), status: 'skipped' as const },
];
const sets = [
  set('i1', 20, 10, null, 'warmup'),
  set('i1', 60, 10),
  set('i1', 62.5, 8),
  set('i1', 60, 9),
  set('i2', null, 15),
  set('i2', null, 20),
  set('i3', null, null, 45),
  set('i3', null, null, 60),
  // Not completed: does not count.
  { ...set('i1', 100, 1), completed_at: null },
];

describe('cartão do treino', () => {
  it('título, data, duração, séries, volume, melhor série e recordes', () => {
    const card = shareCardData({
      session,
      items,
      sets,
      exercises,
      records: [
        { exercise_name: 'Supino reto com barra', kind: 'carga', value: 62.5, unit: 'kg' },
        { exercise_name: 'Supino reto com barra', kind: 'e1rm', value: 78.3, unit: 'kg' },
        { exercise_name: 'Flexão de braços', kind: 'repeticoes', value: 20, unit: 'reps' },
      ],
      unit: 'kg',
    });
    expect(card).toEqual({
      title: 'Peito e tríceps',
      date: 'Segunda, 19/10',
      duration: '52 min',
      workSets: 7,
      // Only weighted work sets: 600 + 500 + 540.
      volume: '1.640 kg',
      exercises: [
        { name: 'Supino reto com barra', best: '62,5 kg × 8' },
        { name: 'Flexão de braços', best: '20 reps' },
        { name: 'Prancha', best: '60 s' },
      ],
      more: 0,
      records: [
        'Supino reto com barra: 62,5 kg',
        // Same rounding as the screen: to the half kilo.
        'Supino reto com barra: 78,5 kg de 1RM estimado',
        'Flexão de braços: 20 reps',
      ],
    });
  });

  it('em libras, sem fim marcado e sem carga: o que não existe fica de fora', () => {
    const lb = shareCardData({ session, items, sets, exercises, records: [], unit: 'lb' });
    expect(lb.volume).toBe('3.616 lb');
    const bare = shareCardData({
      session: { ...session, ended_at: null },
      items: [item('i2', 'flexao', 0)],
      sets: [set('i2', null, 12)],
      exercises,
      records: [],
      unit: 'kg',
    });
    expect(bare.duration).toBeNull();
    expect(bare.volume).toBeNull();
    expect(bare.records).toEqual([]);
  });

  it(`mostra até ${SHARE_MAX_EXERCISES} exercícios e conta o resto`, () => {
    const many = Array.from({ length: 8 }, (_, i) => item(`x${i}`, 'supino', i));
    const card = shareCardData({
      session,
      items: many,
      sets: many.map((it) => set(it.id, 40, 10)),
      exercises,
      records: [],
      unit: 'kg',
    });
    expect(card.exercises).toHaveLength(SHARE_MAX_EXERCISES);
    expect(card.more).toBe(2);
  });
});
