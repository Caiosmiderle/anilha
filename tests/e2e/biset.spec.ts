/**
 * Bi-set: paired in the routine, the workout alternates the two exercises with no rest
 * in between and rests after the pair.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test('bi-set na rotina: alterna os dois e descansa depois do par', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('biset'));
  await onboard(page, 'Lia', { gym: 3, run: 0 });

  await page.goto('/plano');
  await page
    .getByRole('link', { name: /Peito e tríceps/ })
    .first()
    .click();
  await page.waitForURL(/\/plano\/rotina\//);
  // The routine screen is a separate chunk: Plano stays on screen until it loads.
  await expect(page.getByRole('button', { name: 'Adicionar exercício' })).toBeVisible();
  const titles = page.locator('.hb-list-title');
  await expect(titles.first()).toBeVisible();
  const first = (await titles.nth(0).textContent()) ?? '';
  const second = (await titles.nth(1).textContent()) ?? '';

  await page.getByRole('button', { name: `Editar ${first}` }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByText(`Bi-set com ${second.toLowerCase()}`).click();
  // Two chest exercises: the sheet says opposite pairs work better, but allows it.
  await expect(sheet.getByRole('note')).toContainText('mesmo grupo');
  await shot(page, '27-biset-rotina');
  await sheet.getByRole('button', { name: 'Salvar exercício' }).click();
  await expect(page.locator('.hb-list-sub .ss-chip')).toHaveCount(2);

  // The workout.
  await page.goto('/');
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Ficha A: Peito e tríceps/ }).click();
  await page.waitForURL(/\/treino\//);
  await expect(page.getByTestId('superset-line')).toHaveCount(2);
  await expect(page.getByTestId('superset-line').first()).toContainText(second.toLowerCase());

  const editor = page.getByTestId('set-editor');
  const done = page.getByRole('button', { name: 'Concluir série', exact: true });
  const rest = page.getByTestId('rest-timer');
  const effortOk = page
    .getByTestId('effort-prompt')
    .getByRole('button', { name: 'Ok', exact: true });

  // Warm-ups of the pair first, each with its own short rest.
  for (let i = 0; i < 2; i += 1) {
    await expect(editor).toContainText('Aquecimento');
    await editor.getByLabel('Carga (kg)', { exact: true }).fill('20');
    await editor.getByLabel('Repetições', { exact: true }).fill('6');
    await done.click();
    await expect(rest).toBeVisible();
  }

  // A1: no rest, straight to B1.
  await expect(editor).toContainText(first);
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('40');
  await editor.getByLabel('Repetições', { exact: true }).fill('10');
  await done.click();
  await effortOk.click();
  await expect(rest).toHaveCount(0);
  await expect(editor).toContainText(second);
  await expect(editor).toContainText('Série 1 de');

  // B1 closes the round: now it rests, and the next set is A2.
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('20');
  await editor.getByLabel('Repetições', { exact: true }).fill('12');
  await done.click();
  await effortOk.click();
  await expect(rest).toBeVisible();
  await expect(editor).toContainText(first);
  await expect(editor).toContainText('Série 2 de');
  await shot(page, '28-biset-treino');
});
