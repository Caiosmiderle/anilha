/**
 * Fixing a finished workout: tap a set to correct it, add a forgotten one, and the
 * records follow (a record that is no longer one disappears, a new one appears).
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

async function quickSession(page: Page, ficha: RegExp, text: string) {
  await page.goto('/');
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  // The routine, not "como da última vez".
  await page.getByRole('button', { name: ficha }).first().click();
  await page.waitForURL(/\/treino\//);
  await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill(text);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);
}

test('corrigir treino encerrado recalcula os recordes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('editar'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });

  await quickSession(page, /^Ficha A: Peito e tríceps/, '30kg 10 10');
  await quickSession(page, /^Ficha A: Peito e tríceps/, '35kg 10 10');
  const records = page.getByRole('region', { name: 'Recordes deste treino' });
  await expect(records).toBeVisible();

  // Typed 35 by mistake: it was 25. Fix both sets.
  const fix = async (n: number, load: string) => {
    await page
      .getByRole('button', { name: new RegExp(`Corrigir série ${n} de Supino reto`) })
      .click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Editar série' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Desmarcar feita' })).toHaveCount(0);
    await sheet.getByLabel('Carga (kg)', { exact: true }).fill(load);
    await sheet.getByRole('button', { name: 'Salvar série' }).click();
    await expect(sheet).toBeHidden();
  };
  await fix(1, '25');
  await fix(2, '25');
  await expect(
    page.getByRole('button', { name: /Corrigir série 1 de Supino reto.*25 kg/ }),
  ).toBeVisible();
  // Below last time: no record anymore.
  await expect(records).toHaveCount(0);

  // A forgotten set at 40 kg: added, and it is a record.
  await page.getByRole('button', { name: 'Adicionar série' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Carga (kg)', { exact: true }).fill('40');
  await sheet.getByLabel('Repetições', { exact: true }).fill('8');
  await sheet.getByRole('button', { name: 'Salvar série' }).click();
  await expect(
    page.getByRole('button', { name: /Corrigir série 3 de Supino reto.*40 kg/ }),
  ).toBeVisible();
  await expect(records).toBeVisible();
  await shot(page, '24-treino-corrigido', true);
});
