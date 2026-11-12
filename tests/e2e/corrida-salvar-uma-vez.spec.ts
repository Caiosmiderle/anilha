import { expect, test, type Page } from '@playwright/test';
import type { RunRow } from '../../src/engine/types';
import { login, onboard, stats, synced, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function openRun(page: Page) {
  const email = uniqueEmail('corridaunica');
  await login(page, email);
  await onboard(page, 'Lia', { gym: 3, run: 0 });
  await synced(page);
  await page.goto('/?atalho=corrida');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Registrar corrida' })).toBeVisible();
  await dialog.getByLabel('Distância (km)', { exact: true }).fill('5');
  await dialog.getByLabel('Tempo', { exact: true }).fill('30:00');
  await dialog.getByLabel('Nota', { exact: true }).fill('Corrida de teste');
  await dialog.getByRole('button', { name: '6', exact: true }).click();
  return email;
}

async function localRuns(page: Page): Promise<RunRow[]> {
  return page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((d) => d.name?.startsWith('anilha-'))?.name;
    if (!name) throw new Error('Banco da conta ausente');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<RunRow[]>((resolve, reject) => {
        const request = database.transaction('runs').objectStore('runs').getAll();
        request.onsuccess = () => resolve((request.result as RunRow[]).filter((r) => !r.deleted));
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

test('dois cliques consecutivos em Salvar criam uma única corrida', async ({ page }) => {
  const email = await openRun(page);
  // Keep the first real IndexedDB transaction pending until the busy UI is checked.
  await page.evaluate(() => {
    let holding = true;
    window.addEventListener('release-run-write', () => (holding = false), { once: true });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'runs') {
        IDBObjectStore.prototype.put = put;
        const hold = () => {
          const read = this.get((args[0] as RunRow).id);
          read.onsuccess = () => {
            if (holding) hold();
          };
        };
        hold();
      }
      return request;
    };
  });
  await page.getByRole('button', { name: 'Salvar corrida' }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  try {
    await expect
      .soft(page.getByRole('button', { name: 'Salvando...', exact: true }))
      .toBeDisabled();
  } finally {
    await page.evaluate(() => window.dispatchEvent(new Event('release-run-write')));
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const runs = await localRuns(page);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ distance_km: 5, duration_sec: 1800 });
  await synced(page);
  expect((await stats(page, email)).runs).toBe(1);
  await page.goto('/historico');
  await expect(page.getByRole('button', { name: /Corrida leve/ })).toHaveCount(1);
});

for (const table of ['runs', 'records']) {
  test(`falha em ${table} mantém os campos e permite salvar sem duplicar`, async ({ page }) => {
    const email = await openRun(page);
    const dialog = page.getByRole('dialog');
    const distance = table === 'records' ? 10 : 5;
    await dialog.getByLabel('Distância (km)', { exact: true }).fill(String(distance));
    const day = await dialog.getByLabel('Data', { exact: true }).inputValue();
    // 'records' fails after the run was already written, exercising a partial save.
    await page.evaluate((table) => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === table) {
          IDBObjectStore.prototype.put = put;
          throw new DOMException('Falha de armazenamento simulada', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    }, table);
    await dialog.getByRole('button', { name: 'Salvar corrida' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'Não foi possível salvar. Seus dados continuam aqui. Tente novamente.',
    );
    await expect(dialog.getByLabel('Distância (km)', { exact: true })).toHaveValue(
      String(distance),
    );
    await expect(dialog.getByLabel('Tempo', { exact: true })).toHaveValue('30:00');
    await expect(dialog.getByLabel('Nota', { exact: true })).toHaveValue('Corrida de teste');
    await expect(dialog.getByLabel('Data', { exact: true })).toHaveValue(day);
    await expect(dialog.getByRole('button', { name: '6', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const before = await localRuns(page);
    expect(before).toHaveLength(table === 'runs' ? 0 : 1);
    await expect(dialog.getByRole('button', { name: 'Salvar corrida' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Salvar corrida' }).click();
    await expect(dialog).toHaveCount(0);
    const runs = await localRuns(page);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      distance_km: distance,
      duration_sec: 1800,
      note: 'Corrida de teste',
      rpe: 6,
      local_date: day,
    });
    if (before[0]) expect(runs[0]?.id).toBe(before[0].id);
    await synced(page);
    expect((await stats(page, email)).runs).toBe(1);
  });
}

test('editar e apagar corrida permitem tentar de novo após falha', async ({ page }) => {
  const email = await openRun(page);
  await page.getByRole('button', { name: 'Salvar corrida' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/historico');
  await page.getByRole('button', { name: /Corrida leve/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tempo', { exact: true }).fill('31:00');
  const failNextWrite = async () => {
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'runs') {
          IDBObjectStore.prototype.put = put;
          throw new DOMException('Falha de armazenamento simulada', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    });
  };
  await failNextWrite();
  await dialog.getByRole('button', { name: 'Salvar corrida' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Seus dados continuam aqui');
  await expect(dialog.getByLabel('Tempo', { exact: true })).toHaveValue('31:00');
  await dialog.getByRole('button', { name: 'Salvar corrida' }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(dialog).toHaveCount(0);
  const runs = await localRuns(page);
  expect(runs).toHaveLength(1);
  expect(runs[0]?.duration_sec).toBe(1860);
  await page.getByRole('button', { name: /Corrida leve/ }).click();
  await dialog.getByRole('button', { name: 'Apagar corrida' }).click();
  await failNextWrite();
  await dialog.getByRole('button', { name: 'Apagar corrida' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Não foi possível apagar esta corrida. Tente novamente.',
  );
  expect(await localRuns(page)).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Apagar corrida' }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(dialog).toHaveCount(0);
  expect(await localRuns(page)).toHaveLength(0);
  await page.goto('/');
  await synced(page);
  expect((await stats(page, email)).runs).toBe(0);
});
