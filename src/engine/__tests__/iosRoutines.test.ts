import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routineArtifacts } from '../../../scripts/ios-routine-source';

describe('fichas e ignorar no iPhone', () => {
  it('gera a paridade pelo TS real e conserva lápides, notas e pares', async () => {
    const f = await routineArtifacts();
    expect(JSON.parse(readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/routines.json', 'utf8'))).toEqual(f);
    expect(f.applications).toHaveLength(7);
    expect(f.deletions[0]!.changes).toHaveLength(4);
    expect(f.deletions[0]!.changes.every((c) => c.row.deleted)).toBe(true);
    const removed = f.applications.find((v) => v.name === 'remover-par')!;
    expect(removed.changes.find((c) => c.row.id === 'i0')!.row.deleted).toBe(true);
    expect(removed.changes.find((c) => c.row.id === 'i1')!.row).toMatchObject({ superset: null, note: 'Nota fictícia' });
  });
  it('restaura a posição original, preserva feita e aquecimento e repete a última série', async () => {
    const f = await routineArtifacts();
    const v = f.dismissals.find((v) => v.measure === 'weight_reps' && v.sets[2]!.completed_at != null && v.suggestion.based_on)!;
    expect(v.expected.map((s) => s.id)).toEqual(['s1', 's3', 's4', 's5']);
    expect(v.expected.map((s) => s.load_kg)).toEqual([20, 15, 15, 15]);
    expect(v.expected.map((s) => s.reps)).toEqual([12, 8, 8, 8]);
    const time = f.dismissals.find((v) => v.measure === 'time' && v.suggestion.based_on)!;
    expect(time.expected[0]).toMatchObject({ reps: null, seconds: 12 });
  });
});
