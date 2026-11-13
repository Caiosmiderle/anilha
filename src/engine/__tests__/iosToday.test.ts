/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { todayArtifacts } from '../../../scripts/ios-today-source';
import { evaluateToday, type TodayInput } from '../../../scripts/ios-today-engine';
import { applyAdjustment, plannedFromRoutine, routineFor } from '../../data/today';
import { EXERCISES } from '../exercises';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const fixture = () =>
  JSON.parse(read('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/today.json')) as Awaited<
    ReturnType<typeof todayArtifacts>
  >;

describe('Hoje nativo com motor real', () => {
  it('mantém funções do site compartilhadas e fixture reproduzível pelas operações reais', async () => {
    const generated = await todayArtifacts();
    expect(JSON.parse(JSON.stringify(generated))).toEqual(fixture());
    const f = fixture();
    expect(f.cases.length).toBeGreaterThan(25);
    for (const v of f.cases) {
      const input: TodayInput = { ...v.input, catalog: f.catalog };
      expect(evaluateToday(input), v.name).toEqual(v.expected);
      expect(evaluateToday({ ...input, catalog: [...f.catalog].reverse() }), v.name).toEqual(
        v.expected,
      );
    }
    const original = f.cases[0]!;
    const routine = routineFor('peito_triceps', original.input.tables.routines!);
    expect(routine?.id).toBe('plan-ficha');
    expect(
      applyAdjustment(
        plannedFromRoutine(routine, original.input.tables.routine_items!),
        null,
        f.catalog,
        null,
      ).items,
    ).toEqual(original.expected.items);
  });
  it('executa o bundle offline sem navegador, Node ou banco e mantém todos os vetores', () => {
    const f = fixture();
    const sandbox = runInNewContext(
      `${read('ios/AnilhaCore/Sources/AnilhaCore/Resources/plan-engine.js')}; AnilhaPlanEngine`,
    ) as { today: (input: string) => string; dayOptions: () => string };
    expect(JSON.parse(sandbox.dayOptions())).toEqual(f.options);
    for (const v of f.cases)
      expect(
        JSON.parse(sandbox.today(JSON.stringify({ ...v.input, catalog: f.catalog }))),
        v.name,
      ).toEqual(v.expected);
    const base = f.cases[0]!;
    expect(base.expected.routine?.id).toBe('plan-ficha');
    expect(f.cases.find((c) => c.name === 'time-30')!.expected.items.length).toBeLessThan(
      base.expected.items.length,
    );
    expect(f.cases.find((c) => c.name === 'no_equipment-barra')!.expected.items).not.toEqual(
      base.expected.items,
    );
    expect(f.cases.find((c) => c.name === 'rest-')!.expected.rec.kind).toBe('rest');
    expect(f.cases.find((c) => c.name === 'run-')!.expected.rec.kind).toBe('run');
    expect(f.cases.find((c) => c.name === 'borda-0')!.expected.override).toBeNull();
  });
  it('demonstra ajuste aplicado sem treino em andamento e inclui a captura no CI', () => {
    const source = read('ios/App/Demo/ModoDemo.swift');
    const tables = JSON.parse(
      source.match(/let json = #"""\s*([\s\S]*?)\s*"""#/)![1]!,
    ) as TodayInput['tables'];
    tables.sessions = tables.sessions!.filter((s) => s.id === 'demo-prior');
    tables.runs = [];
    tables.day_overrides = [
      {
        id: 'day-2026-11-13',
        user_id: 'fiction',
        updated_at: 1,
        deleted: false,
        local_date: '2026-11-13',
        action: 'no_equipment',
        value: 'barra',
      },
    ];
    const catalog = EXERCISES.map((e) => ({
      ...e,
      user_id: 'fiction',
      updated_at: 1,
      deleted: false,
      builtin: true,
      archived: false,
      note: null,
    }));
    const result = evaluateToday({ today: '2026-11-13', health: true, catalog, tables });
    expect(result.rec.kind).toBe('gym');
    expect(result.summary).toContain('Sem barra');
    expect(result.descriptions.length).toBeGreaterThan(0);
    expect(result.items.length).toBeGreaterThan(0);
    expect(tables.sessions!.some((s) => s.status === 'active')).toBe(false);
    expect(source).toContain('case "hoje-ajuste"');
    expect(read('ios/scripts/capture-screenshots.sh')).toContain('hoje hoje-ajuste plano');
    const store = read('ios/App/Servicos/ContaStore.swift');
    expect(store).toContain('if ajusteHoje {');
    expect(store).toContain('action: "no_equipment", value: "barra"');
  });
});
