/// <reference types="vite/client" />
import 'fake-indexeddb/auto';
import { openDb } from '../src/data/db';
import { mergePulled, stableText, syncAnalyses, syncPayload, syncedKey } from '../src/sync/analysisSync';
import { reviewVersion } from '../src/review/local';
import type { ReviewInput } from '../src/review/context';

type Value = Record<string, unknown>;
type Entry = { key: string; value: Value };
type Row = { id: string; payload: Value; updated_at: number };
type Page = { rows: Row[]; cursor: number; more: boolean };
const key = 'analysis:fiction-session';
const review = 'review:fiction-routine';
const undo = { before: [{ id: 'fiction-item', note: 'Nota fictícia' }], after: [] };

/** Every expected payload, merge and run executes the production TS implementation. */
export async function analysisSyncArtifacts() {
  const payloads: Value[] = [
    { status: 'saved', undo, reply: { summary: 'Treino fictício', points: [], adjustment: null } },
    { decisions: [{ status: 'saved', undo }, { status: 'proposed' }], undo },
    { decisions: [null, false, 3, 'text', { status: 'refused', undo }], context: { z: [3, null], a: true } },
    { status: 'proposed', reply: { summary: 'Texto com / e acentuação', points: ['Controle'], adjustment: null } },
  ];
  const merges: { remote: Value; local?: Value }[] = [
    { remote: { status: 'saved' } },
    { remote: { status: 'saved', reply: { summary: 'Remoto' } }, local: { status: 'saved', undo } },
    { remote: { status: 'undone' }, local: { status: 'saved', undo } },
    { remote: { decisions: [{ status: 'saved' }, { status: 'refused' }, { status: 'proposed' }] },
      local: { decisions: [{ status: 'saved', undo }, { status: 'saved', undo }] } },
  ];
  const database = openDb('ios-analysis-sync-fixture');
  const run = async (name: string, before: Entry[], page: Page, duringPush: Entry[] = [], duringPull: Entry[] = []) => {
    await database.meta.bulkPut(before);
    const pushes: Value[] = [];
    const cursors: number[] = [];
    await syncAnalyses(database, async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
      if (fn === 'analysis_push') {
        pushes.push(args);
        await database.meta.bulkPut(duringPush);
        return { kept: [] } as T; // Even a losing write was offered and acknowledged.
      }
      cursors.push(args.since as number);
      await database.meta.bulkPut(duringPull);
      return page as T;
    }, undefined, () => 1000);
    const expected = (await database.meta.toArray()).filter((e) => syncedKey(e.key));
    return { name, before, page, duringPush, duringPull, pushes, cursors, expected };
  };
  try {
    const runs = [
      await run('primeiro-envio-e-undo-local', [
        { key, value: payloads[0]! }, { key: review, value: payloads[1]! },
        { key: 'chat:fiction', value: { undo } }, { key: 'dismissed:fiction', value: { x: true } },
        { key: 'analysis-plan:fiction', value: { load: 20 } },
      ], { rows: [{ id: key, payload: syncPayload(payloads[0]!), updated_at: 900 },
        { id: review, payload: syncPayload(payloads[1]!), updated_at: 900 },
        { id: 'chat:remote', payload: { status: 'saved' }, updated_at: 900 }], cursor: 10, more: false }),
      await run('nada-mudou', [], { rows: [], cursor: 10, more: false }),
      await run('edicao-durante-push', [{ key, value: { status: 'refused' } }],
        { rows: [{ id: key, payload: { status: 'undone' }, updated_at: 1100 }], cursor: 11, more: false },
        [{ key, value: { status: 'proposed', reply: { summary: 'Edição em voo' } } }]),
      await run('reenvia-edicao-e-servidor-vence', [],
        { rows: [{ id: key, payload: { status: 'saved' }, updated_at: 1200 }], cursor: 12, more: false }),
      await run('edicao-durante-pull', [],
        { rows: [{ id: key, payload: { status: 'undone' }, updated_at: 1300 }], cursor: 13, more: false }, [],
        [{ key, value: { status: 'refused' } }]),
      await run('mesmo-conteudo-pode-entrar', [],
        { rows: [{ id: key, payload: { status: 'refused' }, updated_at: 1400 }], cursor: 14, more: false }),
    ];
    // Real reviewVersion, including a replaced exercise: original slots must survive transport.
    const routine = { id: 'fiction-routine', name: 'Ficha fictícia', position: 0, split_key: 'peito', archived: false, deleted: false, updated_at: 10, user_id: 'fiction' };
    const item = { id: 'fiction-item', routine_id: routine.id, exercise_id: 'supino-reto-barra', position: 0,
      sets: 3, target_min: 8, target_max: 12, warmup_sets: 0, rest_sec: 90, note: null, reason: null, superset: null, deleted: false, updated_at: 11, user_id: 'fiction' };
    const version = reviewVersion({ routines: [routine], items: [item] } as ReviewInput, routine.id);
    const nativeReview = { routineID: routine.id, version: { routine, items: [item] }, binding: { items: [item] },
      context: {}, reply: { resumo: 'Ficha fictícia', ajustes: [] }, decisions: [{ status: 'saved', undoBefore: [item], undoAfter: [] }] };
    const wireReview = { ...nativeReview, version, exercises: [item.exercise_id], decisions: [{ status: 'saved' }] };
    return {
      keys: ['analysis:x', 'review:x', 'chat:x', 'dismissed:x', 'analysis-plan:x', 'analysis-sync-cursor'].map((key) => ({ key, expected: syncedKey(key) })),
      payloads: payloads.map((input) => ({ input, expected: syncPayload(input), stable: stableText(syncPayload(input)) })),
      merges: merges.map((v) => ({ ...v, expected: mergePulled(v.remote, v.local) })), runs,
      nativeReview, wireReview,
    };
  } finally { await database.delete(); }
}
