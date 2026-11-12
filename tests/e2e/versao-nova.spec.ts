/**
 * A new version goes out while the app is open: the files of the old one are gone. Opening
 * a screen that was not loaded yet reloads once into the new version, without an error;
 * if it fails again right away, the error screen shows instead of a loop.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, uniqueEmail } from './helpers';

// The service worker would answer the app files from its cache; blocked so the test can
// take a file away the way a deploy does.
test.use({ serviceWorkers: 'block' });

async function ready(page: Page, name: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail(name));
  await onboard(page, 'Vi', { gym: 3, run: 0 });
  const reported: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('log_client_error')) reported.push(r.postData() ?? '');
  });
  let loads = 0;
  page.on('load', () => (loads += 1));
  return { reported, loads: () => loads };
}

test('arquivo da tela sumiu: recarrega uma vez e abre, sem registrar erro', async ({ page }) => {
  const { reported, loads } = await ready(page, 'versaonova');
  let gone = true;
  await page.route(/\/assets\/Plan-[^/]+\.js$/, async (route) => {
    if (!gone) return route.continue();
    gone = false;
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.getByRole('link', { name: 'Plano' }).first().click();
  await expect(page.getByRole('heading', { name: 'Plano', level: 1 })).toBeVisible();
  expect(loads()).toBe(1);
  expect(reported).toEqual([]);
});

test('falhou de novo logo depois: tela de erro, sem recarregar em loop', async ({ page }) => {
  const { loads } = await ready(page, 'versaoquebrada');
  await page.route(/\/assets\/Plan-[^/]+\.js$/, (route) =>
    route.fulfill({ status: 404, body: 'Not found' }),
  );
  await page.getByRole('link', { name: 'Plano' }).first().click();
  await expect(page.getByRole('heading', { name: 'Algo deu errado nesta tela' })).toBeVisible();
  expect(loads()).toBe(1);
});
