/**
 * Adding an exercise: what was done lately comes first, so the usual one is a tap away.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test('adicionar exercício mostra primeiro os feitos recentemente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('recentes'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });

  // One workout with the first exercise of Ficha A, typed in a few words.
  await page.goto('/');
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^Ficha A: Peito e tríceps/ })
    .first()
    .click();
  await page.waitForURL(/\/treino\//);
  const first = (await page.getByTestId('set-editor').locator('.t-label').innerText()).split(
    '\n',
  )[0];
  await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('40kg 10 10');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);

  // The library opens with it on top.
  await page.goto('/exercicios');
  await expect(page.getByText('Feitos recentemente')).toBeVisible();
  const recent = page.locator('.stack-sm', { hasText: 'Feitos recentemente' });
  await expect(recent.getByRole('button', { name: new RegExp(first ?? '') })).toBeVisible();
  await shot(page, '211-exercicios-recentes');
  // Typing hides the shortcut: the search is over the whole library.
  await page.getByLabel('Buscar exercício').fill('remada');
  await expect(page.getByText('Feitos recentemente')).toHaveCount(0);
});
