/**
 * Your data is yours: export JSON and CSV, import without duplicates, delete the account.
 */
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { API, login, onboard, stats, uniqueEmail } from './helpers';

test('exportar, importar sem duplicar e apagar conta', async ({ page }) => {
  const email = uniqueEmail('dados');
  await login(page, email);
  await onboard(page, 'Nina', { gym: 2, run: 1 });
  await page.goto('/voce/dados');

  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar tudo (JSON)' }).click(),
  ]);
  const payload = JSON.parse(readFileSync((await json.path()) as string, 'utf8')) as {
    app: string;
    tables: Record<string, unknown[]>;
  };
  expect(payload.app).toBe('anilha');
  expect(payload.tables.plans?.length).toBe(1);
  expect(payload.tables.routines?.length).toBe(2);

  mkdirSync('test-results', { recursive: true });
  const csv =
    'data;distancia_km;tempo_segundos;tipo;esforco_1a10;nota\n2026-10-10;8,5;3060;leve;5;\n2026-10-11;21,1;8460;longo;8;meia\n';
  writeFileSync('test-results/corridas.csv', csv);
  const input = page.getByLabel('Arquivo para importar');
  await input.setInputFiles('test-results/corridas.csv');
  await expect(page.getByText('2 corridas importadas')).toBeVisible();
  await input.setInputFiles('test-results/corridas.csv');
  await expect(page.getByText('2 corridas importadas').first()).toBeVisible();
  await expect.poll(async () => (await stats(page, email)).runs, { timeout: 20_000 }).toBe(2);

  const [runsCsv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar corridas (CSV)' }).click(),
  ]);
  const text = readFileSync((await runsCsv.path()) as string, 'utf8');
  expect(text).toContain('2026-10-11;21,1;8460;longo;8;meia');

  await page.getByRole('button', { name: 'Apagar conta e dados' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Apagar para sempre' })).toBeDisabled();
  await dialog.getByLabel('Digite "APAGAR" para confirmar').fill('APAGAR');
  await dialog.getByRole('button', { name: 'Apagar para sempre' }).click();
  await page.waitForURL('/entrar');
  const gone = await page.request.get(`${API}/dev/stats?email=${encodeURIComponent(email)}`);
  expect(gone.status()).toBe(404);
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs.filter((n) => n?.startsWith('anilha-'))).toHaveLength(0);
});
