import { describe, expect, it } from 'vitest';
import { brokenPairs, keepPairsTogether, nextSetInOrder, restAfter } from '../superset';

type S = {
  id: string;
  item_id: string;
  kind: 'warmup' | 'work';
  completed_at: number | null;
  position: number;
};

function sets(item: string, warm: number, work: number): S[] {
  return [
    ...Array.from({ length: warm }, (_, i) => ({
      id: `${item}w${i + 1}`,
      item_id: item,
      kind: 'warmup' as const,
      completed_at: null,
      position: i,
    })),
    ...Array.from({ length: work }, (_, i) => ({
      id: `${item}${i + 1}`,
      item_id: item,
      kind: 'work' as const,
      completed_at: null,
      position: warm + i,
    })),
  ];
}

const items = [
  { id: 'A', position: 0, status: 'pending', superset: 'p1' },
  { id: 'B', position: 1, status: 'pending', superset: 'p1' },
  { id: 'C', position: 2, status: 'pending', superset: null },
];

/** Does the whole workout and returns the order and where the rests were. */
function run(map: Map<string, S[]>): string[] {
  const out: string[] = [];
  for (let guard = 0; guard < 30; guard += 1) {
    const next = nextSetInOrder(items, map);
    if (!next) break;
    next.completed_at = guard + 1;
    out.push(next.id);
    if (restAfter(next, items, map)) out.push('|');
  }
  return out;
}

describe('bi-set', () => {
  it('aquecimento primeiro, depois alterna e descansa ao fim de cada rodada', () => {
    const map = new Map<string, S[]>([
      ['A', sets('A', 2, 3)],
      ['B', sets('B', 0, 3)],
      ['C', sets('C', 0, 2)],
    ]);
    expect(run(map).join(' ')).toBe('Aw1 | Aw2 | A1 B1 | A2 B2 | A3 B3 | C1 | C2 |');
  });

  it('quando um tem mais séries, as que sobram vão sozinhas com descanso', () => {
    const map = new Map<string, S[]>([
      ['A', sets('A', 0, 2)],
      ['B', sets('B', 0, 4)],
      ['C', sets('C', 0, 0)],
    ]);
    expect(run(map).join(' ')).toBe('A1 B1 | A2 B2 | B3 | B4 |');
  });

  it('exercício pulado sai do par', () => {
    const map = new Map<string, S[]>([
      ['A', sets('A', 0, 2)],
      ['B', sets('B', 0, 2)],
      ['C', sets('C', 0, 0)],
    ]);
    const skipped = items.map((i) => (i.id === 'B' ? { ...i, status: 'skipped' } : i));
    const first = nextSetInOrder(skipped, map) as S;
    first.completed_at = 1;
    expect(first.id).toBe('A1');
    expect(restAfter(first, skipped, map)).toBe(true);
  });

  it('reordenar mantém o par junto; par separado ou sozinho se desfaz', () => {
    const rows = [
      { id: 'supino', superset: 'p' },
      { id: 'agacha', superset: null },
      { id: 'remada', superset: 'p' },
    ];
    expect(keepPairsTogether(rows).map((r) => r.id)).toEqual(['supino', 'remada', 'agacha']);
    expect([...brokenPairs(rows)]).toEqual(['p']);
    expect(brokenPairs(keepPairsTogether(rows)).size).toBe(0);
    expect([...brokenPairs([{ superset: 'x' }, { superset: null }])]).toEqual(['x']);
  });
});
