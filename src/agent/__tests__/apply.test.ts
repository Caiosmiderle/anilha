import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type AnilhaDB } from '../../data/db';
import { save, setCurrent } from '../../data/store';
import type { RoutineItemRow } from '../../engine/types';
import { applyProposal, applyWithUndo, UndoConflictError } from '../apply';

let d: AnilhaDB;
let n = 0;

beforeEach(async () => {
  d = openDb(`agent-undo-${++n}`);
  await d.open();
  setCurrent({ db: d, userId: 'u1' });
});

afterEach(async () => {
  setCurrent(null);
  d.close();
  await d.delete();
});

const item = (id: string, sets = 3): RoutineItemRow => ({
  id,
  user_id: 'u1',
  updated_at: 1,
  deleted: false,
  routine_id: 'r1',
  position: 0,
  exercise_id: 'supino-reto-barra',
  sets,
  target_min: 8,
  target_max: 12,
  rest_sec: 90,
  warmup_sets: 2,
  note: 'Minha nota',
  reason: null,
});

describe('assistente: desfazer sem perder mudanças mais recentes', () => {
  it('preserva metadados de exercícios repetidos em suas posições ao editar outra linha', async () => {
    await d.routine_items.bulkPut([
      { ...item('zz'), position: 0, note: 'Primeira posição', warmup_sets: 2 },
      { ...item('aa'), position: 1, note: 'Segunda posição', warmup_sets: 0 },
      { ...item('middle'), position: 2, exercise_id: 'remada-baixa', note: 'Terceira posição' },
    ]);
    const before = {
      id: 'r1',
      name: 'Ficha sintética',
      items: [
        { exercise_id: 'supino-reto-barra', sets: 3, target_min: 8, target_max: 12, rest_sec: 90 },
        { exercise_id: 'supino-reto-barra', sets: 3, target_min: 8, target_max: 12, rest_sec: 90 },
        { exercise_id: 'remada-baixa', sets: 3, target_min: 8, target_max: 12, rest_sec: 90 },
      ],
    };
    const after = {
      ...before,
      items: before.items.map((row, n) => (n === 2 ? { ...row, sets: 2 } : row)),
    };
    await applyProposal({ kind: 'ficha', before, after, volume: [], risks: [] }, '2026-11-12');
    expect(await d.routine_items.get('zz')).toMatchObject({
      position: 0,
      note: 'Primeira posição',
      warmup_sets: 2,
    });
    expect(await d.routine_items.get('aa')).toMatchObject({
      position: 1,
      note: 'Segunda posição',
      warmup_sets: 0,
    });
    expect((await d.routine_items.get('middle'))?.sets).toBe(2);
  });
  it('não grava uma proposta se a conta muda enquanto as linhas são preparadas', async () => {
    await d.routine_items.put(item('old'));
    const other = openDb(`agent-other-${n}`);
    await other.open();
    const ficha = {
      id: 'r1',
      name: 'Treino',
      items: [
        { exercise_id: 'supino-reto-barra', sets: 5, target_min: 8, target_max: 12, rest_sec: 90 },
      ],
    };
    const applying = applyProposal(
      { kind: 'ficha', before: ficha, after: ficha, volume: [], risks: [] },
      '2026-10-22',
    );
    setCurrent({ db: other, userId: 'u2' });
    try {
      await expect(applying).rejects.toBeInstanceOf(UndoConflictError);
      expect(await other.routine_items.count()).toBe(0);
      expect(await other.outbox.count()).toBe(0);
      expect((await d.routine_items.get('old'))?.sets).toBe(3);
    } finally {
      other.close();
      await other.delete();
    }
  });

  it('restaura o que existia e exclui a linha criada pela proposta', async () => {
    await d.routine_items.put(item('old'));
    const undo = await applyWithUndo([
      { table: 'routine_items', row: item('old', 5) },
      { table: 'routine_items', row: item('new') },
    ]);

    await undo();

    expect(await d.routine_items.get('old')).toMatchObject({
      sets: 3,
      note: 'Minha nota',
      warmup_sets: 2,
      deleted: false,
    });
    expect(await d.routine_items.get('new')).toMatchObject({ deleted: true });
    expect(await d.outbox.count()).toBe(2);
  });

  it('recusa desfazer a primeira proposta após salvar outra na mesma ficha, sem restaurar nada', async () => {
    await d.routine_items.put(item('old'));
    const firstUndo = await applyWithUndo([
      { table: 'routine_items', row: item('old', 5) },
      { table: 'routine_items', row: item('new') },
    ]);
    await applyWithUndo([{ table: 'routine_items', row: item('old', 7) }]);
    const before = await d.routine_items.toArray();
    const queued = await d.outbox.toArray();

    await expect(firstUndo()).rejects.toBeInstanceOf(UndoConflictError);

    expect(await d.routine_items.toArray()).toEqual(before);
    expect(await d.outbox.toArray()).toEqual(queued);
  });

  it('preserva uma edição manual feita depois da proposta', async () => {
    await d.routine_items.put(item('old'));
    const undo = await applyWithUndo([{ table: 'routine_items', row: item('old', 5) }]);
    await save('routine_items', { ...item('old', 5), note: 'Nota mais recente' });

    await expect(undo()).rejects.toBeInstanceOf(UndoConflictError);

    expect(await d.routine_items.get('old')).toMatchObject({
      sets: 5,
      note: 'Nota mais recente',
    });
  });

  it('não aplica o desfazer depois que a conta saiu', async () => {
    await d.routine_items.put(item('old'));
    const undo = await applyWithUndo([{ table: 'routine_items', row: item('old', 5) }]);
    setCurrent(null);

    await expect(undo()).rejects.toBeInstanceOf(UndoConflictError);

    expect(await d.routine_items.get('old')).toMatchObject({ sets: 5 });
  });
});
