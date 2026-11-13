import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { planArtifacts } from '../../../scripts/ios-plan-source';

describe('plano novo nativo', () => {
  it('conserva o bundle offline e os vetores do gerador e das escritas reais do site', async () => {
    const fixture = await planArtifacts();
    expect(JSON.parse(readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/new-plans.json', 'utf8'))).toEqual(fixture);
    const source = readFileSync('ios/AnilhaCore/Sources/AnilhaCore/Resources/plan-engine.js', 'utf8');
    const engine = runInNewContext(source + '\nAnilhaPlanEngine') as { generate(input: string): string; parameters(input: string, picked: boolean): string };
    expect(fixture.cases).toHaveLength(12);
    for (const v of fixture.cases) {
      expect(JSON.parse(engine.parameters(JSON.stringify(v.input), v.picked))).toEqual(v.params);
      expect(JSON.parse(engine.generate(JSON.stringify(v.params)))).toEqual(v.expected);
    }
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|Supabase|indexedDB|fiction-plan|Rafa|import\.meta/);
    expect(() => engine.generate('{')).toThrow();
  });
  it('troca só fichas do plano, anula o dia da rotação e preserva retorno e nome', async () => {
    const fixture = await planArtifacts();
    for (const v of fixture.writes) {
      const archived = v.changes.filter((c) => 'archived' in c.row && c.row.archived);
      expect(archived.map((c) => c.row.id)).toEqual(['legacy-plan', 'old-plan']);
      expect(v.changes.every((c) => ['routines', 'routine_items', 'plans', 'profiles'].includes(c.table))).toBe(true);
      const plan = v.changes.find((c) => c.table === 'plans')!.row;
      if ('days' in plan && v.generated.rules.rotation) expect(plan.days.filter((d) => d.kind === 'gym').every((d) => d.split_key === null)).toBe(true);
      const profile = v.changes.find((c) => c.table === 'profiles')!.row;
      if ('display_name' in profile && 'return_mode' in profile && 'return_started_on' in profile) {
        expect(profile.display_name).toBe(v.params.first_name ? 'Rafa Exemplo Fictício' : 'Nome anterior');
        expect(profile.return_mode).toBe(v.params.returning ? 'on' : v.profile.return_mode === 'on' ? 'auto' : v.profile.return_mode);
        expect(profile.return_started_on).toBe(v.params.returning ? v.profile.return_started_on ?? fixture.today : v.profile.return_started_on);
      }
    }
  });
});
