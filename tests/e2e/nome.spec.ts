/**
 * Name and last name, both required: in the onboarding, in Você, and once for accounts made
 * before the last name was asked. The app keeps calling the person by the first name.
 */
import { expect, test } from '@playwright/test';
import { API, login, onboard, shot, synced, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('cadastro: sem sobrenome não passa da primeira tela', async ({ page }) => {
  await login(page, uniqueEmail('sobrenome'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Marina');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Diga seu sobrenome')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await shot(page, '170-nome-sobrenome');
  await page.getByLabel('Sobrenome', { exact: true }).fill('Alves Costa');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Qual a sua idade?' })).toBeVisible();
});

test('o app chama pelo primeiro nome; Você edita os dois e não aceita vazio', async ({ page }) => {
  await login(page, uniqueEmail('primeironome'));
  await onboard(page, 'Marina', { gym: 3, run: 0 });
  await expect(page.getByRole('heading', { name: /Marina/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Teste/ })).toHaveCount(0);

  await page.goto('/voce');
  await expect(page.getByRole('heading', { name: 'Marina Teste', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /^Nome Marina Teste/ }).click();
  const sheet = page.getByRole('dialog');
  const last = sheet.getByLabel('Sobrenome', { exact: true });
  await last.fill('');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet.getByText('Diga seu sobrenome')).toBeVisible();
  await last.fill('Alves');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Marina Alves', level: 1 })).toBeVisible();
});

test('conta antiga sem sobrenome: uma tela antes do app, uma vez', async ({
  browser,
}, testInfo) => {
  const opts = { baseURL: testInfo.project.use.baseURL, viewport: { width: 390, height: 844 } };
  const email = uniqueEmail('antiga');
  const first = await (await browser.newContext(opts)).newPage();
  await login(first, email);
  await onboard(first, 'Rui', { gym: 3, run: 0 });
  await synced(first);
  await first.request.get(`${API}/dev/sem-sobrenome?email=${encodeURIComponent(email)}`);

  // Another phone: the account comes from the server, without the last name.
  const page = await (await browser.newContext(opts)).newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, email);
  await expect(page.getByRole('heading', { name: 'Como você se chama?' })).toBeVisible();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Rui');
  await shot(page, '171-conta-antiga-sobrenome');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Diga seu sobrenome')).toBeVisible();
  await page.getByLabel('Sobrenome', { exact: true }).fill('Barros');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: /Rui/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Rui/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Como você se chama?' })).toHaveCount(0);
});
