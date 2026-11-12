import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { API, login, onboard, synced, uniqueEmail } from './helpers';

interface Change {
  table: string;
  row: Record<string, unknown> & { id: string };
}
const fixture = JSON.parse(
  readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/session.json', 'utf8'),
) as { payload: { changes: Change[] } };
// On macOS/CI the Swift parity test emits the native assembly. Windows checks the
// PWA-generated contract fixture; it cannot claim to have executed the Swift client.
const payload = process.env.ANILHA_NATIVE_PAYLOAD
  ? (JSON.parse(readFileSync(process.env.ANILHA_NATIVE_PAYLOAD, 'utf8')) as { changes: Change[] })
  : fixture.payload;

test('sessão iOS pela RPC chega igual ao PWA, reenvio e conflitos por linha', async ({ page }) => {
  await login(page, uniqueEmail('ios-treino'));
  await onboard(page, 'Pessoa');
  await synced(page);
  const auth = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('anilha-auth') ?? '{}') as {
        access_token: string;
        user: { id: string };
      },
  );
  const headers = { Authorization: `Bearer ${auth.access_token}`, apikey: 'local-anon-key' };
  const changes: Change[] = payload.changes.map((change) => ({
    ...change,
    row: { ...change.row, user_id: auth.user.id },
  }));
  const push = async (rows: Change[]) => {
    const response = await page.request.post(`${API}/rest/v1/rpc/sync_push`, {
      headers,
      data: { changes: rows },
    });
    expect(response.status()).toBe(200);
    const result = (await response.json()) as {
      applied: number;
      stale: number;
      rejected: unknown[];
    };
    expect(result.rejected).toEqual([]);
    return result;
  };
  expect((await push(changes)).applied).toBe(changes.length);
  expect((await push(changes)).applied).toBe(changes.length); // Equal timestamps reapply, without duplicate IDs.
  const pullResponse = await page.request.post(`${API}/rest/v1/rpc/sync_pull`, {
    headers,
    data: { since: 0, max_rows: 2000 },
  });
  expect(pullResponse.ok()).toBe(true);
  const pulled = (await pullResponse.json()) as { rows: Change[] };
  for (const change of changes) {
    expect(
      pulled.rows.find((r) => r.table === change.table && r.row.id === change.row.id)?.row,
    ).toMatchObject(change.row);
  }
  const session = changes.find((c) => c.table === 'sessions')!;
  await page.reload();
  await synced(page);
  await page.goto('/historico');
  await expect(page.getByText('Ficha sintética iOS', { exact: true })).toBeVisible();
  const readCache = () =>
    page.evaluate(async () => {
      const name = (await indexedDB.databases()).find((d) => d.name?.startsWith('anilha-'))?.name;
      if (!name) throw new Error('Cache do PWA ausente');
      return new Promise<Record<string, Record<string, unknown>[]>>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(new Error('Cache indisponível'));
        request.onsuccess = () => {
          const db = request.result;
          const tables = ['sessions', 'session_items', 'sets'];
          const tx = db.transaction(tables);
          const result: Record<string, Record<string, unknown>[]> = {};
          for (const table of tables) {
            const all = tx.objectStore(table).getAll();
            all.onsuccess = () => {
              result[table] = all.result as Record<string, unknown>[];
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve(result);
          };
          tx.onerror = () => {
            db.close();
            reject(new Error('Leitura falhou'));
          };
        };
      });
    });
  const cached = await readCache();
  for (const change of changes.filter((c) => c.table !== 'records')) {
    expect(cached[change.table]?.filter((r) => r.id === change.row.id)).toHaveLength(1);
    expect(cached[change.table]?.find((r) => r.id === change.row.id)).toMatchObject(change.row);
  }
  const timestamp = Number(session.row.updated_at);
  expect(
    (
      await push([
        { ...session, row: { ...session.row, title: 'Antiga', updated_at: timestamp - 1 } },
      ])
    ).stale,
  ).toBe(1);
  await push([
    { ...session, row: { ...session.row, title: 'Edição no PWA', updated_at: timestamp + 1 } },
  ]);
  expect((await push(changes)).stale).toBe(1);
  await page.goto('/');
  await page.reload();
  await synced(page);
  await page.goto('/historico');
  await expect(page.getByText('Edição no PWA', { exact: true })).toBeVisible();
  await push([{ ...session, row: { ...session.row, deleted: true, updated_at: timestamp + 2 } }]);
  await page.goto('/');
  await page.reload();
  await synced(page);
  await page.goto('/historico');
  await expect(page.getByText('Edição no PWA', { exact: true })).toBeHidden();
  expect((await readCache()).sessions?.find((r) => r.id === session.row.id)?.deleted).toBe(true);
});
