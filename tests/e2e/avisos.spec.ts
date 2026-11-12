/**
 * End-of-rest notification: with notifications allowed, finishing a set schedules it on
 * the server with the next set in the text; skipping the rest cancels it.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, stats, uniqueEmail } from './helpers';

test('descanso agenda o aviso no servidor e pular o descanso cancela', async ({ page }) => {
  // Headless Chromium always reports notifications as denied; here the person allowed them.
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
  });
  const email = uniqueEmail('descanso');
  await login(page, email);
  await onboard(page, 'Duda', { gym: 3, run: 0 });

  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Ficha A: Peito e tríceps/ }).click();
  await page.waitForURL(/\/treino\//);
  const editor = page.getByTestId('set-editor');
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('20');
  await editor.getByLabel('Repetições', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect.poll(async () => (await stats(page, email)).rest_alerts).toBe(1);

  // A new set replaces it: still one.
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
  await expect.poll(async () => (await stats(page, email)).rest_alerts).toBe(1);

  // Skip the rest: cancelled.
  await page
    .getByTestId('rest-timer')
    .getByRole('button', { name: /Pular|Encerrar descanso/ })
    .click();
  await expect.poll(async () => (await stats(page, email)).rest_alerts).toBe(0);
});
