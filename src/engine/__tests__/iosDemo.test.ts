/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEvolution } from '../../analysis/evolution';
import { buildAnalysisContext, type AnalysisInput } from '../../analysis/context';
import { parseReply, validContext } from '../../analysis/contract';
import { EXERCISES } from '../exercises';
import { SPLITS } from '../taxonomy';
import { exerciseHint } from '../../analysis/memory';

const source = readFileSync(
  new URL('../../../ios/App/Demo/ModoDemo.swift', import.meta.url),
  'utf8',
);
const tables: AnalysisInput['tables'] = JSON.parse(
  source.match(/let json = #"""\s*([\s\S]*?)\s*"""#/)![1]!,
);
const reply = JSON.parse(source.match(/static let resposta = #"""\s*([\s\S]*?)\s*"""#/)![1]!);

describe('fixture pública da apresentação SwiftUI', () => {
  it('prepara a dica real da última análise no foco nativo de demonstração', () => {
    const session = tables.sessions!.find(s => s.id === 'demo-active')!;
    const done = tables.sessions!.find(s => s.id === 'demo-done')!;
    const hint = exerciseHint({ routineID: String(session.routine_id), date: String(session.local_date), before: Number(session.started_at),
      items: tables.session_items!.filter(i => i.session_id === session.id),
      analyses: [{ status: 'proposed', reply, binding: { session: done, items: tables.session_items!.filter(i => i.session_id === done.id), routineItems: tables.routine_items } }] },
      'supino-reto-barra', tables.routine_items!);
    expect(hint).toBe(reply.proximaVez[0].comentario);
    const focus = readFileSync(new URL('../../../ios/App/Telas/ExecucaoTreino.swift', import.meta.url), 'utf8');
    expect(focus).toContain('AnalysisMemory.hint');
    expect(focus).toContain('accessibilityIdentifier("focus-hint")');
  });
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
  it('prepara foco, lista, esforço e cartas na matriz de captura', () => {
    const capture = readFileSync(
      new URL('../../../ios/scripts/capture-screenshots.sh', import.meta.url),
      'utf8',
    );
    const screens = capture.match(/for screen in ([^;]+);/)![1]!.split(' ');
    const cases = [...source.matchAll(/case ([^:\n]+):/g)].flatMap((match) =>
      [...match[1]!.matchAll(/"([^"]+)"/g)].map((value) => value[1]),
    );
    for (const screen of screens) expect(cases).toContain(screen);
    for (const screen of [
      'treino',
      'treino-lista',
      'descanso',
      'esforco',
      'blackjack',
      'poker',
      'proxima',
      'calendario',
      'calendario-dia',
      'historico',
      'historico-progresso',
      'historico-semanas',
      'historico-corpo',
    ]) {
      expect(screens).toContain(screen);
    }
    expect(capture).toContain('for appearance in light dark');
    expect(capture).toContain('read -r -a sizes <<< "${CAPTURA_TAMANHOS:-large}"');
    expect(capture).toContain('for size in "${sizes[@]}"');
  });
  it('mantém a cor das ações preenchidas no estilo compartilhado', () => {
    const app = readFileSync(new URL('../../../ios/App/AnilhaApp.swift', import.meta.url), 'utf8');
    const components = readFileSync(
      new URL('../../../ios/App/Design/Componentes.swift', import.meta.url),
      'utf8',
    );
    expect(app).not.toContain('.foregroundStyle(Tema.tinta)');
    expect(source).not.toContain('.foregroundStyle(Tema.tinta)');
    expect(components).toContain('configuration.label.foregroundStyle(Tema.sobreMarca)');
    expect(components).toContain('.buttonStyle(.glassProminent)');
  });
});
