/**
 * Run days: picked when setting up the plan, and moved later from Plan or from the
 * week on Today, swapping with what the other day holds.
 */
import { expect, test } from '@playwright/test';
import { login, shot, uniqueEmail, walkTo } from './helpers';

test('escolher os dias de corrida na montagem e trocar depois', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('diascorrida'));

  // Setup: two runs, on Tuesday and Saturday.
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Duda');
  await walkTo(page, 'Quantos dias por semana?');
  await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  await expect(page.getByText('Opcional. Sem escolher, eu distribuo pela semana.')).toBeVisible();
  await page.getByRole('button', { name: 'Correr na terça' }).click();
  await page.getByRole('button', { name: 'Correr no sábado' }).click();
  await expect(page.getByRole('button', { name: 'Correr na terça' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shot(page, '64-dias-corrida');
  await walkTo(page, 'Seu plano da semana');
  await expect(page.getByRole('heading', { name: 'Seu plano da semana' })).toBeVisible();
  const week = page.getByLabel('Semana do plano');
  await expect(week.getByLabel('terça: corrida')).toBeVisible();
  await expect(week.getByLabel('sábado: corrida')).toBeVisible();
  await expect(page.getByText(/nos dias que você escolheu/)).toBeVisible();
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');

  // Plan: Tuesday's run goes to Thursday, Thursday's workout comes to Tuesday.
  await page.goto('/plano');
  await page.getByRole('button', { name: /^Terça/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Mudar a corrida de dia')).toBeVisible();
  await shot(page, '78-trocar-dia');
  await sheet.getByRole('button', { name: /^Trocar com quinta/ }).click();
  await expect(page.getByText('Corrida passou para quinta')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Quinta.*Corrida/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Terça.*Corrida/ })).toHaveCount(0);

  // Today: each day of the week opens the same choice.
  await page.goto('/');
  await page.getByRole('button', { name: /^Sábado, .*Mudar no plano/ }).click();
  await expect(page.getByRole('dialog').getByText('Mudar a corrida de dia')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Trocar com domingo/ })
    .click();
  await expect(page.getByText('Corrida passou para domingo')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Domingo, .*corrida.*Mudar no plano/ }),
  ).toBeVisible();
});
