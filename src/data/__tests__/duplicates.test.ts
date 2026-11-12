import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { openDb, type AnilhaDB } from '../db';
import { setCurrent } from '../store';
import {
  dismissDuplicate,
  listDismissed,
  listMerges,
  mergeDuplicate,
  pendingDuplicates,
  undoMerge,
} from '../duplicates';
import type { RunRow } from '../../engine/types';

let database: AnilhaDB | undefined;
afterEach(async () => {
  setCurrent(null);
  await database?.delete();
});

const base = {
  user_id: 'u',
  updated_at: 1,
  deleted: false,
  local_date: '2026-11-09',
  duration_sec: 1800,
  run_type: 'leve' as const,
  external_id: null,
};
const crunning: RunRow = {
  ...base,
  id: 'c1',
  distance_km: 5,
  rpe: null,
  note: null,
  source: 'crunning',
  started_at: 1_000_000,
  strava_id: '777',
};
const imported: RunRow = {
  ...base,
  id: 'i1',
  distance_km: 5.1,
  rpe: 6,
  note: 'Nota fictícia da importação',
  source: 'import',
  started_at: 1_060_000,
  strava_id: '777',
};

async function open() {
  database = openDb(`dup-${Date.now()}-${Math.random()}`);
  await database.open();
  setCurrent({ db: database, userId: 'u' });
  await database.runs.bulkPut([crunning, imported]);
  return database;
}

it('lista o par uma vez e esconde o que foi dispensado', async () => {
  const d = await open();
  const runs = await d.runs.toArray();
  const pairs = pendingDuplicates(runs, []);
  expect(pairs).toHaveLength(1);
  expect(pairs[0]).toMatchObject({ key: 'c1|i1', reason: 'strava' });
  await dismissDuplicate('c1|i1');
  expect(pendingDuplicates(runs, await listDismissed())).toEqual([]);
  // Dispensar não altera nenhuma corrida.
  expect((await d.runs.get('i1'))?.deleted).toBe(false);
});

it('juntar guarda cópia, vira lápide na importada e leva nota e esforço que faltavam', async () => {
  const d = await open();
  const [pair] = pendingDuplicates(await d.runs.toArray(), []);
  const record = await mergeDuplicate(pair!);
  expect(record?.copied).toEqual(['note', 'rpe']);
  expect((await d.runs.get('i1'))?.deleted).toBe(true);
  expect(await d.runs.get('c1')).toMatchObject({ note: 'Nota fictícia da importação', rpe: 6, deleted: false });
  // A cópia fica antes da mudança, com as duas linhas inteiras.
  const [saved] = await listMerges();
  expect(saved?.imported).toMatchObject({ id: 'i1', deleted: false, note: 'Nota fictícia da importação' });
  expect(saved?.canonical).toMatchObject({ id: 'c1', note: null, rpe: null });
  // A lápide e a canônica entram na fila de envio.
  expect((await d.outbox.toArray()).map((o) => o.key).sort()).toEqual(['runs:c1', 'runs:i1']);
  expect(pendingDuplicates(await d.runs.toArray(), [])).toEqual([]);
});

it('desfazer restaura a importada e só os campos copiados', async () => {
  const d = await open();
  const [pair] = pendingDuplicates(await d.runs.toArray(), []);
  await mergeDuplicate(pair!);
  // Depois de juntar, a pessoa mudou outra coisa na canônica: isso fica.
  await d.runs.update('c1', { run_type: 'longo' });
  expect(await undoMerge('c1|i1')).toBe(true);
  expect(await d.runs.get('i1')).toMatchObject({ deleted: false, note: 'Nota fictícia da importação' });
  expect(await d.runs.get('c1')).toMatchObject({ note: null, rpe: null, run_type: 'longo' });
  expect(await listMerges()).toEqual([]);
  expect(await undoMerge('c1|i1')).toBe(false);
});

it('canônica com nota própria não é sobrescrita, e par velho não junta', async () => {
  const d = await open();
  await d.runs.update('c1', { note: 'Minha nota fictícia', rpe: 4 });
  const [pair] = pendingDuplicates(await d.runs.toArray(), []);
  const record = await mergeDuplicate(pair!);
  expect(record?.copied).toEqual([]);
  expect(await d.runs.get('c1')).toMatchObject({ note: 'Minha nota fictícia', rpe: 4 });
  // A mesma sugestão de novo, já com a importada apagada: nada acontece.
  expect(await mergeDuplicate(pair!)).toBeNull();
});
