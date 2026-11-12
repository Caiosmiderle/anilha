/**
 * The way in. Without an account, the address of the app opens the landing in the browser
 * and a welcome screen in the installed app; both lead to the same login. Any other screen
 * goes straight to login, and with an account the address opens Today.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test('navegador sem conta: o endereço abre a landing, e dela se chega ao login', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForURL('**/conheca/');
  await expect(page.getByRole('heading', { level: 1, name: /Seu treino da semana/ })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir o Anilha' }).first().click();
  await page.waitForURL('**/entrar');
  await expect(page.getByRole('heading', { name: 'Entrar no Anilha' })).toBeVisible();
});

test('app instalado sem conta: tela com a marca e o botão Entrar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // As if opened from the home screen icon.
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes('display-mode: standalone')
        ? ({ ...real(q), matches: true, media: q } as MediaQueryList)
        : real(q);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Anilha' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await shot(page, '119-boas-vindas');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/entrar');
  await expect(page.getByRole('heading', { name: 'Entrar no Anilha' })).toBeVisible();
});

test('link direto para uma tela vai ao login; com conta, o endereço abre Hoje', async ({
  page,
}) => {
  await page.goto('/plano');
  await page.waitForURL('**/entrar');
  await expect(page.getByRole('heading', { name: 'Entrar no Anilha' })).toBeVisible();
  await login(page, uniqueEmail('entrada'));
  await onboard(page, 'Edu', { gym: 3, run: 0 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Edu/ })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
