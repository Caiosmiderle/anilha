/**
 * Runs can be deleted: from the run sheet, or by holding the row in the history.
 * The deletion reaches the server, so other devices lose it too.
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { login, onboard, shot, stats, uniqueEmail } from './helpers';

test('apagar corrida pelo menu do histórico e pela própria corrida', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = uniqueEmail('corridas');
  await login(page, email);
  await onboard(page, 'Lia', { gym: 2, run: 2 });

  // Two runs, imported from a CSV.
  await page.goto('/voce/dados');
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/corridas-apagar.csv',
    'data;distancia_km;tempo_segundos;tipo;esforco_1a10;nota\n2026-10-13;5,2;1870;leve;5;\n2026-10-15;12;4300;longo;7;\n',
  );
  await page.getByLabel('Arquivo para importar').setInputFiles('test-results/corridas-apagar.csv');
  await expect(page.getByText('2 corridas importadas')).toBeVisible();
  await expect.poll(async () => (await stats(page, email)).runs, { timeout: 20_000 }).toBe(2);

  await page.goto('/historico');
  const longa = page.getByRole('button', { name: /Corrida longa/ });
  const leve = page.getByRole('button', { name: /Corrida leve/ });
  await expect(longa).toBeVisible();

  // Hold the long run: menu with edit and delete.
  const box = await longa.boundingBox();
  if (!box) throw new Error('linha sem posição');
  const at = { clientX: box.x + 40, clientY: box.y + box.height / 2 };
  await longa.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, ...at });
  await page.waitForTimeout(600);
  await longa.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, ...at });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Corrida longa de 12 km' })).toBeVisible();
  await expect(dialog.getByRole('menuitem', { name: 'Editar corrida' })).toBeVisible();
  await shot(page, '76-menu-corrida');
  await dialog.getByRole('menuitem', { name: 'Apagar corrida' }).click();
  await expect(dialog.getByRole('heading', { name: 'Apagar esta corrida?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Apagar corrida' }).click();
  await expect(page.getByText('Corrida apagada')).toBeVisible();
  await expect(longa).toHaveCount(0);

  // Tap the other one: the edit sheet has the delete button too, and asks first.
  await leve.click();
  await expect(dialog.getByRole('heading', { name: 'Editar corrida' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Apagar corrida' }).click();
  await dialog.getByRole('button', { name: 'Manter corrida' }).click();
  await expect(dialog.getByRole('heading', { name: 'Editar corrida' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Apagar corrida' }).click();
  await dialog.getByRole('button', { name: 'Apagar corrida' }).click();
  await expect(leve).toHaveCount(0);

  // Gone on the server too.
  await expect.poll(async () => (await stats(page, email)).runs, { timeout: 20_000 }).toBe(0);
});

test('importar corrida de um arquivo do relógio', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = uniqueEmail('relogio');
  await login(page, email);
  await onboard(page, 'Leo', { gym: 2, run: 2 });

  // 3 points, about 2 km in 12 minutes, the day before.
  mkdirSync('test-results', { recursive: true });
  const day = new Date(Date.now() - 24 * 3600 * 1000);
  const at = (min: number) => new Date(day.getTime() + min * 60_000).toISOString();
  writeFileSync(
    'test-results/corrida.gpx',
    `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>` +
      `<trkpt lat="-20.300" lon="-40.30"><time>${at(0)}</time></trkpt>` +
      `<trkpt lat="-20.291" lon="-40.30"><time>${at(6)}</time></trkpt>` +
      `<trkpt lat="-20.282" lon="-40.30"><time>${at(12)}</time></trkpt>` +
      `</trkseg></trk></gpx>`,
  );

  await page
    .getByRole('button', { name: /Registrar corrida|Trocar por corrida/ })
    .first()
    .click();
  if (await page.getByRole('heading', { name: 'Registrar corrida' }).isHidden()) {
    await page.getByRole('button', { name: 'Registrar corrida' }).first().click();
  }
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Arquivo do relógio').setInputFiles('test-results/corrida.gpx');
  await expect(dialog.getByText('Importado de corrida.gpx. Confira e salve.')).toBeVisible();
  await expect(dialog.getByLabel('Distância (km)')).toHaveValue('2');
  await expect(dialog.getByLabel('Tempo')).toHaveValue('12:00');
  await shot(page, '77-importar-relogio');
  await dialog.getByRole('button', { name: 'Salvar corrida' }).click();
  await expect.poll(async () => (await stats(page, email)).runs, { timeout: 20_000 }).toBe(1);
  await page.goto('/historico');
  await expect(page.getByRole('button', { name: /Corrida leve.*2 km · 12 min/ })).toBeVisible();
});
