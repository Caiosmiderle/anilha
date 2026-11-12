import 'fake-indexeddb/auto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { callRpc, createUser, openDatabase } from '../../../server/pg';
import { openDb, type AnilhaDB } from '../../data/db';
import { mergePulled, syncAnalyses, syncPayload } from '../analysisSync';

// Two devices of the same account against the real migrations (PGlite).
let server: PGlite;
let phone: AnilhaDB;
let site: AnilhaDB;
const user = '00000000-0000-4000-8000-0000000000a1';
const call = <T>(fn: string, args: Record<string, unknown>) =>
  callRpc(server, { sub: user, role: 'authenticated' }, fn, args) as Promise<T>;
const key = 'analysis:22222222-2222-4222-8222-222222222222';
const undo = { changes: [{ table: 'routine_items', row: { id: 'x' } }], after: [] };
let clock = 1000;
const now = () => (clock += 10);
const value = async (d: AnilhaDB, k = key) =>
  (await d.meta.get(k))?.value as Record<string, unknown>;

beforeAll(async () => {
  server = await openDatabase();
  await createUser(server, user, 'devices@synthetic.invalid');
  phone = openDb('analysis-sync-phone');
  site = openDb('analysis-sync-site');
}, 60000);
afterAll(async () => {
  await phone?.delete();
  await site?.delete();
  await server?.close();
});

it('o desfazer fica no aparelho; o resto vai e volta', () => {
  const review = {
    status: 'proposed',
    decisions: [{ status: 'saved', undo }, { status: 'proposed' }],
  };
  expect(syncPayload({ status: 'saved', undo, reply: { ok: true } })).toEqual({
    status: 'saved',
    reply: { ok: true },
  });
  expect(syncPayload(review)).toEqual({
    status: 'proposed',
    decisions: [{ status: 'saved' }, { status: 'proposed' }],
  });
  // Pulled with the same status: this device keeps its undo; different status drops it.
  expect(mergePulled(syncPayload(review), review)).toEqual(review);
  expect(mergePulled({ status: 'undone' }, { status: 'saved', undo })).toEqual({
    status: 'undone',
  });
});

it('análise salva no iPhone aparece no site, e a decisão do site volta ao iPhone', async () => {
  await phone.meta.put({ key, value: { status: 'saved', reply: { resumo: 'Bom treino' }, undo } });
  await syncAnalyses(phone, call, undefined, now);
  await syncAnalyses(site, call, undefined, now);
  expect(await value(site)).toEqual({ status: 'saved', reply: { resumo: 'Bom treino' } });

  await site.meta.put({ key, value: { status: 'undone', reply: { resumo: 'Bom treino' } } });
  await syncAnalyses(site, call, undefined, now);
  await syncAnalyses(phone, call, undefined, now);
  // The phone's undo snapshot is gone: the saved change was undone elsewhere.
  expect(await value(phone)).toEqual({ status: 'undone', reply: { resumo: 'Bom treino' } });
});

it('edição local ainda não enviada não é atropelada pelo pull', async () => {
  await phone.meta.put({ key, value: { status: 'refused', reply: { resumo: 'Bom treino' } } });
  // The site changes too, and syncs first.
  await site.meta.put({ key, value: { status: 'proposed', reply: { resumo: 'Bom treino' } } });
  await syncAnalyses(site, call, undefined, now);
  // The phone pushes its own newer edit before pulling: it wins on both devices.
  await syncAnalyses(phone, call, undefined, now);
  expect((await value(phone)).status).toBe('refused');
  await syncAnalyses(site, call, undefined, now);
  expect((await value(site)).status).toBe('refused');
});

it('sem mudança local nada é reenviado', async () => {
  let pushes = 0;
  const counting = <T>(fn: string, args: Record<string, unknown>) => {
    if (fn === 'analysis_push') pushes += 1;
    return call<T>(fn, args);
  };
  await syncAnalyses(phone, counting, undefined, now);
  await syncAnalyses(phone, counting, undefined, now);
  expect(pushes).toBe(0);
});
