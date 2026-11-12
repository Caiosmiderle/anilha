/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEvolution } from '../../analysis/evolution';
import { buildAnalysisContext, type AnalysisInput } from '../../analysis/context';
import { parseReply, validContext } from '../../analysis/contract';
import { EXERCISES } from '../exercises';
import { SPLITS } from '../taxonomy';

const source = readFileSync(
  new URL('../../../ios/App/Demo/ModoDemo.swift', import.meta.url),
  'utf8',
);
const tables: AnalysisInput['tables'] = JSON.parse(
  source.match(/let json = #"""\s*([\s\S]*?)\s*"""#/)![1]!,
);
const reply = JSON.parse(source.match(/static let resposta = #"""\s*([\s\S]*?)\s*"""#/)![1]!);

describe('fixture pública da apresentação SwiftUI', () => {
  it('usa exercícios e divisões reais do catálogo com dados fictícios mínimos', () => {
    for (const item of tables.routine_items!) {
      expect(EXERCISES.some((e) => e.id === item.exercise_id)).toBe(true);
    }
    for (const routine of tables.routines!) {
      expect(SPLITS).toHaveProperty(String(routine.split_key));
    }
    expect(JSON.stringify(tables)).not.toMatch(/email|first_name|last_name|user_id|token|password/);
  });
  it('mostra carga 25 kg, aumento 5, recordes e prévia do motor em três dias', () => {
    const input = { sessionID: 'demo-done', tables };
    const row = buildEvolution(input)[0]!;
    expect(row).toMatchObject({ max_load: 25, max_load_delta: 5, days_ago: 3, load_record: true });
    expect(row.reps_records).not.toHaveLength(0);
    const context = buildAnalysisContext(input);
    expect(
      validContext(
        context,
        EXERCISES.map((e) => e.name),
      ),
    ).toBe(true);
    expect(context.items[0]?.next?.sets.length).toBeGreaterThan(0);
    expect(
      parseReply(
        reply,
        context.items.length,
        EXERCISES.map((e) => e.id),
      ),
    ).toEqual(reply);
    expect(reply.adjustment.sets).toBe(3);
    expect(tables.routine_items![0]!.sets).toBe(2);
  });
  it('isola a entrada Debug antes da raiz que abre a conta', () => {
    expect(source.startsWith('#if DEBUG')).toBe(true);
    expect(source.trimEnd().endsWith('#endif')).toBe(true);
    const app = readFileSync(new URL('../../../ios/App/AnilhaApp.swift', import.meta.url), 'utf8');
    expect(app).toContain('if ModoDemo.solicitado { DemoView');
    expect(app).toContain('#else\n            ContaRaiz()');
    expect(source).toContain('arguments.contains("-demo")');
    expect(source).toContain('.allowsHitTesting(false)');
    expect(source).not.toMatch(/await conta\.|CacheLeitura\(|ChaveiroSessao\(|SupabaseClient\(/);
  });
});
