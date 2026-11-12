import type { Table } from 'dexie';
import type { AnilhaDB, RowByTable, SyncedTable } from './db';

export interface CurrentStore {
  db: AnilhaDB;
  userId: string;
}

let current: CurrentStore | null = null;
const writeListeners = new Set<() => void>();
const accountListeners = new Set<() => void>();

export function setCurrent(next: CurrentStore | null): void {
  current = next;
  accountListeners.forEach((fn) => fn());
}

export function currentStore(): CurrentStore | null {
  return current;
}

export function onAccountChange(fn: () => void): () => void {
  accountListeners.add(fn);
  return () => accountListeners.delete(fn);
}

export function db(): AnilhaDB {
  if (!current) throw new Error('Banco local não aberto');
  return current.db;
}

export function uid(): string {
  if (!current) throw new Error('Sem usuário');
  return current.userId;
}

export function hasCurrent(): boolean {
  return current !== null;
}

export function onLocalWrite(fn: () => void): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

let lastStamp = 0;
/** Monotonic clock for last-write-wins, even with two writes in the same millisecond. */
export function stamp(): number {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

export function newId(): string {
  return crypto.randomUUID();
}

export type Writable<T> = Omit<T, 'user_id' | 'updated_at'> & { updated_at?: number };
export type Change = {
  [K in SyncedTable]: { table: K; row: Writable<RowByTable[K]> };
}[SyncedTable];

function table<K extends SyncedTable>(name: K): Table<RowByTable[K], string> {
  return db().table(name) as Table<RowByTable[K], string>;
}

/**
 * Writes rows locally and queues them for sync in one transaction.
 * The interface reads from IndexedDB, so the change shows up immediately.
 */
export async function saveMany(changes: Change[]): Promise<void> {
  if (changes.length === 0) return;
  const d = db();
  const userId = uid();
  const tables = [...new Set(changes.map((c) => c.table))].map((t) => d.table(t));
  await d.transaction('rw', [...tables, d.outbox], async () => {
    for (const c of changes) {
      const ts = stamp();
      const row = { ...c.row, user_id: userId, updated_at: ts } as RowByTable[typeof c.table];
      await d.table(c.table).put(row);
      await d.outbox.put({ key: `${c.table}:${c.row.id}`, table: c.table, id: c.row.id, ts });
    }
  });
  writeListeners.forEach((fn) => fn());
}

export async function save<K extends SyncedTable>(
  name: K,
  row: Writable<RowByTable[K]>,
): Promise<void> {
  await saveMany([{ table: name, row } as unknown as Change]);
}

export async function patch<K extends SyncedTable>(
  name: K,
  id: string,
  changes: Partial<RowByTable[K]>,
): Promise<RowByTable[K] | undefined> {
  const owner = current;
  const existing = await table(name).get(id);
  // The read may finish after sign out or another account opens on this phone.
  if (current !== owner) throw new Error('A conta mudou. Tente novamente.');
  if (!existing) return undefined;
  const next = { ...existing, ...changes } as RowByTable[K];
  await save(name, next);
  return next;
}

/** Soft delete: the tombstone syncs so other devices drop the row too. */
export async function remove(name: SyncedTable, id: string): Promise<void> {
  await patch(name, id, { deleted: true } as Partial<RowByTable[typeof name]>);
}
