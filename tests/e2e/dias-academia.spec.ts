/**
 * Gym days: picked when setting up the plan, like the run days. A day is one or the
 * other, and the note under the rows says what is still missing.
 */
import { expect, test } from '@playwright/test';
import { login, shot, uniqueEmail, walkTo } from './helpers';

test('escolher os dias de academia na montagem', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('diasacademia'));

  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Lia');
  await walkTo(page, 'Quantos dias por semana?');

  // Three gym days (the default) and one run.
  await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  await expect(page.getByText('Opcional. Sem escolher, eu distribuo pela semana.')).toBeVisible();
  await page.getByRole('button', { name: 'Academia na segunda' }).click();
  await expect(
    page.getByText('Escolha mais 2 dias de academia ou deixe que eu encaixo.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Academia na quarta' }).click();
  await page.getByRole('button', { name: 'Academia no sábado' }).click();
  await expect(page.getByText('A corrida se encaixa nos outros dias.')).toBeVisible();

  // Saturday for running: it leaves the gym row.
  await page.getByRole('button', { name: 'Correr no sábado' }).click();
  await expect(page.getByRole('button', { name: 'Academia no sábado' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(
    page.getByText('Escolha mais 1 dia de academia ou deixe que eu encaixo.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Academia na sexta' }).click();
  await expect(page.getByText('Pronto: a semana fica nos dias que você escolheu.')).toBeVisible();
  await shot(page, '110-dias-academia');

  // The plan follows the picks. Three days with no focus: the whole body, A and B.
  await walkTo(page, 'Seu plano da semana');
  const week = page.getByLabel('Semana do plano');
  await expect(week.getByLabel('segunda: ficha A')).toBeVisible();
  await expect(week.getByLabel('quarta: ficha B')).toBeVisible();
  await expect(week.getByLabel('sexta: ficha A')).toBeVisible();
  await expect(week.getByLabel('sábado: corrida')).toBeVisible();
  await expect(
    page.getByText('Academia na segunda, na quarta e na sexta, nos dias que você escolheu.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');

  // Redoing the plan brings the picks back.
  await page.goto('/comecar');
  await walkTo(page, 'Quantos dias por semana?');
  await expect(page.getByRole('button', { name: 'Academia na quarta' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
