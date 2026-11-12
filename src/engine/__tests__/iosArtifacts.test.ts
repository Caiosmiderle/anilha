import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iosArtifacts } from '../../../scripts/ios-source';
import { EXERCISES } from '../exercises';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
describe('iOS exports from the real engine', () => {
  const generated = iosArtifacts();
  it('ships stable IDs and every requested catalog field, without omissions', () => {
    const actual = read('ios/App/Recursos/exercises.json');
    expect(actual).toEqual(generated.catalog);
    expect(generated.catalog.map((e) => e.id)).toEqual(EXERCISES.map((e) => e.id));
    expect(new Set(generated.catalog.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES)
      expect(generated.catalog.find((c) => c.id === e.id)).toMatchObject({
        name: e.name,
        primary_group: e.primary_group,
        muscles: e.muscles,
        equipment: e.equipment,
        measure: e.measure,
        increment_kg: e.increment_kg,
      });
  });
  it('keeps Swift parity vectors and split leg classification in step with TypeScript', () => {
    expect(read('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/plans.json')).toEqual(
      generated.planCases,
    );
    expect(read('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/projections.json')).toEqual(
      generated.projectionCases,
    );
    expect(read('ios/AnilhaCore/Sources/AnilhaCore/Resources/splits.json')).toEqual(
      generated.splits,
    );
  });
});
