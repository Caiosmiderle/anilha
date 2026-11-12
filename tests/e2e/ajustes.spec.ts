/**
 * Ajustes: theme (stays after reload, no light flash), rest alert mode, screen awake.
 * Dark screenshots of the main screens for review.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test('ajustes: tema escuro, aviso só na tela e telas no escuro', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('ajustes'));
  await onboard(page, 'Bia', { gym: 3, run: 1 });

  await page.goto('/voce');
  await page
    .getByRole('link', { name: /^Ajustes/ })
    .last()
    .click();
  await page.waitForURL('/ajustes');
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();

  await page.getByRole('button', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(15, 16, 18)');

  await page.getByRole('button', { name: 'Só na tela' }).click();
  await page.getByRole('switch', { name: /Tela acesa/ }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('anilha:ajustes') ?? '{}'),
  );
  expect(saved).toMatchObject({ theme: 'dark', restAlert: 'silent', keepAwake: false });
  await shot(page, '80-ajustes-escuro', true);

  // After a reload the theme is there before the app runs.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Só na tela' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.goto('/');
  await shot(page, '81-hoje-escuro', true);
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Ficha A: Peito e tríceps/ }).click();
  await page.waitForURL(/\/treino\//);
  await expect(page.getByTestId('set-editor')).toBeVisible();
  await shot(page, '82-treino-escuro');
  await page.goto('/plano');
  await shot(page, '83-plano-escuro', true);

  // Back to automatic: follows the system (light here).
  await page.goto('/ajustes');
  await page.getByRole('button', { name: 'Automático' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});
