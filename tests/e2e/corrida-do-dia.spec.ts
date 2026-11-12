/**
 * The run of the day on Today: the plan says the type, the engine says what to run. Without
 * a recent time it goes by effort; with one, each part gets a pace.
 */
import { expect, test } from '@playwright/test';
import { login, shot, uniqueEmail, walkTo } from './helpers';

test('dia de qualidade: blocos com esforço, e com ritmo depois do tempo recente', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Wednesday 21/10/2026: the quality run of the week.
  await page.clock.install({ time: new Date('2026-10-21T08:00:00-03:00') });
  await login(page, uniqueEmail('corridadodia'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Teo');
  await walkTo(page, 'Quantos dias por semana?');
  for (let i = 0; i < 3; i += 1)
    await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  for (const day of ['na segunda', 'na quarta', 'no sábado'])
    await page.getByRole('button', { name: `Correr ${day}` }).click();
  await walkTo(page, 'Seu plano da semana');
  await expect(page.getByText(/^Corrida quase toda leve, no ritmo de conversa/)).toBeVisible();
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');

  await expect(page.getByText('Hoje: limiar, 3 x 8 min')).toBeVisible();
  const steps = page.getByTestId('run-steps');
  await expect(steps).toContainText('Aquecimento15 min leve');
  await expect(steps).toContainText(
    '3 x 8 minesforço 6 a 7 de 10, só frases curtas, com 2 min de trote entre',
  );
  await expect(steps).toContainText('Desaquecimento10 min leve');

  await page.goto('/plano');
  await page.getByRole('button', { name: 'Informar tempo recente' }).click();
  await page.getByRole('dialog').getByLabel('Tempo').fill('50:00');
  await page
    .getByRole('dialog')
    .getByRole('group', { name: 'Distância' })
    .getByRole('button', { name: '10 km' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar tempo' }).click();
  await expect(page.getByText('Pelo tempo de 10 km em 50:00 (21/10)')).toBeVisible();

  await page.goto('/');
  await expect(steps).toContainText(/3 x 8 min\d:\d\d\/km \(esforço 6 a 7 de 10/);
  await shot(page, '116-corrida-do-dia');
});
