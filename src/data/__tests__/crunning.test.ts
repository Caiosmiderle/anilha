import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { openDb, type AnilhaDB } from '../db';
import { setCurrent } from '../store';
import { saveRun } from '../ops';
import { exportJson } from '../exportImport';
import type { ExternalPlanItemRow, RunRow } from '../../engine/types';

let database: AnilhaDB | undefined;
afterEach(async () => {
  setCurrent(null);
  await database?.delete();
});
it('Dexie 2 para 3 preserva histórico, cria planejados e reinicia cursor', async () => {
  const name = `anilha-upgrade-crunning-${Date.now()}`;
  const old = new Dexie(name);
  old.version(2).stores({ runs: 'id, local_date', meta: 'key' });
  await old.table('meta').put({ key: 'cursor', value: 999 });
  await old.table('runs').put({ id: 'antiga', local_date: '2026-11-09' });
  old.close();
  database = openDb(name.slice(7));
  await database.open();
  expect((await database.runs.get('antiga'))?.id).toBe('antiga');
  expect(await database.meta.get('cursor')).toBeUndefined();
  expect(await database.external_plan_items.count()).toBe(0);
});
it('edição mantém origem e metadados CRUNNING; exportação inclui planejados sem fila de escrita', async () => {
  database = openDb(`crunning-data-${Date.now()}`);
  await database.open();
  setCurrent({ db: database, userId: 'u' });
  const run: RunRow = {
    id: 'crunning-1',
    user_id: 'u',
    updated_at: 1,
    deleted: false,
    local_date: '2026-11-09',
    distance_km: 5,
    duration_sec: 1800,
    run_type: 'leve',
    rpe: null,
    note: null,
    source: 'crunning',
    external_id: 'crunning:1',
    strava_id: '123',
    started_at: 1000,
  };
  await database.runs.put(run);
  await saveRun({ ...run, note: 'Nota fictícia' });
  expect(await database.runs.get(run.id)).toMatchObject({
    source: 'crunning',
    strava_id: '123',
    started_at: 1000,
    note: 'Nota fictícia',
  });
  await database.external_plan_items.put({
    id: 'planejado',
    user_id: 'u',
    updated_at: 1,
    deleted: false,
  } as ExternalPlanItemRow);
  const backup = JSON.parse(await (await exportJson('exemplo@test.dev')).text());
  expect(backup.tables.external_plan_items[0].id).toBe('planejado');
  expect(await database.outbox.get('external_plan_items:planejado')).toBeUndefined();
});
