import { crunningDuplicates } from '../engine/runDuplicates';
import type { RunRow } from '../engine/types';
import { getMeta } from './db';
import { recomputeRunRecords } from './ops';
import { db, saveMany } from './store';

/**
 * Juntar corridas repetidas: a do CRUNNING fica (é a canônica), a importada vira lápide.
 * Antes de qualquer gravação, uma cópia das duas linhas fica nos metadados do aparelho, no
 * mesmo commit do IndexedDB; "Desfazer" restaura exatamente essa cópia. Nada é apagado sem
 * cópia, e a lápide segue o sync normal (os outros aparelhos recebem pelo `sync_pull`).
 */
export const MERGES_KEY = 'run-merges';
export const DISMISSED_KEY = 'run-merge-dismissed';
const MAX_MERGES = 50;

export interface MergeRecord {
  id: string;
  at: number;
  canonical: RunRow;
  imported: RunRow;
  /** Campos da importada copiados para a canônica porque ela não tinha. */
  copied: ('note' | 'rpe')[];
  reason: 'strava' | 'time_distance' | 'manual_day';
}

export interface PendingDuplicate {
  key: string;
  canonical: RunRow;
  imported: RunRow;
  reason: 'strava' | 'time_distance' | 'manual_day';
}

export const pairKey = (canonicalId: string, importedId: string) => `${canonicalId}|${importedId}`;

/** Pares a mostrar: sem os dispensados e com cada importada uma vez só. */
export function pendingDuplicates(
  runs: RunRow[],
  dismissed: readonly string[],
): PendingDuplicate[] {
  const seen = new Set<string>();
  const out: PendingDuplicate[] = [];
  for (const d of crunningDuplicates(runs)) {
    const key = pairKey(d.canonical.id, d.imported.id);
    if (dismissed.includes(key) || seen.has(d.imported.id)) continue;
    seen.add(d.imported.id);
    out.push({ key, ...d });
  }
  return out;
}

export async function listMerges(): Promise<MergeRecord[]> {
  return (await getMeta<MergeRecord[]>(db(), MERGES_KEY)) ?? [];
}

export async function listDismissed(): Promise<string[]> {
  return (await getMeta<string[]>(db(), DISMISSED_KEY)) ?? [];
}

export async function mergeDuplicate(pair: PendingDuplicate): Promise<MergeRecord | null> {
  const d = db();
  // Lê o estado atual: a sugestão pode estar velha.
  const canonical = await d.runs.get(pair.canonical.id);
  const imported = await d.runs.get(pair.imported.id);
  if (!canonical || !imported || canonical.deleted || imported.deleted) return null;
  const copied: MergeRecord['copied'] = [];
  const kept = { ...canonical };
  if (!canonical.note && imported.note) {
    kept.note = imported.note;
    copied.push('note');
  }
  if (canonical.rpe == null && imported.rpe != null) {
    kept.rpe = imported.rpe;
    copied.push('rpe');
  }
  const record: MergeRecord = {
    id: pair.key,
    at: Date.now(),
    canonical,
    imported,
    copied,
    reason: pair.reason,
  };
  const merges = (await listMerges()).filter((m) => m.id !== record.id);
  await saveMany(
    [
      { table: 'runs', row: { ...imported, deleted: true } },
      ...(copied.length ? [{ table: 'runs' as const, row: kept }] : []),
    ],
    [{ key: MERGES_KEY, value: [record, ...merges].slice(0, MAX_MERGES) }],
  );
  await recomputeRunRecords();
  return record;
}

/** Restaura a importada e devolve à canônica só os campos que a junção copiou. */
export async function undoMerge(id: string): Promise<boolean> {
  const d = db();
  const merges = await listMerges();
  const record = merges.find((m) => m.id === id);
  if (!record) return false;
  const current = await d.runs.get(record.canonical.id);
  const restoredCanonical =
    current && record.copied.length
      ? {
          ...current,
          ...(record.copied.includes('note') ? { note: record.canonical.note } : {}),
          ...(record.copied.includes('rpe') ? { rpe: record.canonical.rpe } : {}),
        }
      : null;
  await saveMany(
    [
      { table: 'runs', row: { ...record.imported, deleted: false } },
      ...(restoredCanonical ? [{ table: 'runs' as const, row: restoredCanonical }] : []),
    ],
    [{ key: MERGES_KEY, value: merges.filter((m) => m.id !== id) }],
  );
  await recomputeRunRecords();
  return true;
}

/** "Não é repetida": some da lista neste aparelho, nada é alterado. */
export async function dismissDuplicate(key: string): Promise<void> {
  const dismissed = await listDismissed();
  if (dismissed.includes(key)) return;
  await db().meta.put({ key: DISMISSED_KEY, value: [...dismissed, key] });
}
