import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  historyArtifacts,
  historyExpected,
  type HistoryTables,
} from '../../../scripts/ios-history-source';

describe('Histórico nativo com o motor do PWA', () => {
  it('mantém vetores e taxonomia gerados do TS', () => {
    const generated = historyArtifacts();
    expect(
      JSON.parse(
        readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/history.json', 'utf8'),
      ),
    ).toEqual(generated);
    expect(
      JSON.parse(
        readFileSync('ios/AnilhaCore/Sources/AnilhaCore/Resources/history-taxonomy.json', 'utf8'),
      ),
    ).toEqual(generated.taxonomy);
    expect(generated.cases.length).toBeGreaterThanOrEqual(8);
    expect(generated.bodyCases.length).toBeGreaterThanOrEqual(11);
  });
  it('exercita as quatro partes da demonstração usando números reais do motor', () => {
    const source = readFileSync('ios/App/Demo/ModoDemo.swift', 'utf8');
    const tables = JSON.parse(
      source.match(/let json = #"""\s*([\s\S]*?)\s*"""#/)![1]!,
    ) as HistoryTables;
    const result = historyExpected(tables, '2026-11-12');
    expect(result.weeks[0]).toMatchObject({ done_gym: 2, done_run: 1, planned_gym: 3, pct: 0.75 });
    expect(result.progress[0]?.result).toMatchObject({ count: 2, max_load: 25, last_volume: 450 });
    expect(result.volume).toEqual([{ group: 'peito', value: 5 }]);
    const body = historyArtifacts().bodyCases.find((c) => c.name === 'gain normal')!;
    expect(body.expected.rate_pct_week).toBe(0.37);
    for (const name of ['historico', 'historico-progresso', 'historico-semanas', 'historico-corpo'])
      expect(source).toContain(`case "${name}"`);
    const app = readFileSync('ios/App/Telas/CorpoHistorico.swift', 'utf8');
    expect(app).toContain('if !conta.saudePermitida');
    expect(app).toContain('conta.salvarCorpo');
  });
});
