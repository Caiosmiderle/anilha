/**
 * History opens with the month at a glance: the days with a workout or cardio, and a day
 * opens what was done on it.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test('calendário do mês: dias com treino e corrida, e o dia abre o que foi feito', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-21T19:00:00-03:00') });
  await login(page, uniqueEmail('calendario'));
  await onboard(page, 'Caio', { gym: 3, run: 1 });

  // A workout today, typed in a few words.
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
  await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('40kg 10 10');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);

  // And a run yesterday.
  await page.goto('/?atalho=corrida');
  const run = page.getByRole('dialog');
  await run.getByLabel('Distância (km)', { exact: true }).fill('5');
  await run.getByLabel('Tempo', { exact: true }).fill('30:00');
  await run.getByLabel('Data', { exact: true }).fill('2026-10-20');
  await run.getByRole('button', { name: 'Salvar corrida' }).click();
  await expect(run).toHaveCount(0);

  await page.goto('/historico');
  const cal = page.getByRole('region', { name: 'Calendário do mês' });
  await expect(cal).toContainText('Outubro de 2026');
  await expect(cal).toContainText('2 dias com treino');
  await expect(cal.getByRole('button', { name: /^quarta, 21\/10: academia$/i })).toBeEnabled();
  await expect(cal.getByRole('button', { name: /^terça, 20\/10: cardio$/i })).toBeEnabled();
  await expect(cal.getByRole('button', { name: /^segunda, 19\/10: sem treino$/i })).toBeDisabled();
  await expect(cal.getByRole('button', { name: 'Próximo mês' })).toBeDisabled();

  await cal.getByRole('button', { name: /terça, 20\/10/i }).click();
  await expect(cal.getByTestId('month-day')).toContainText('5');
  await shot(page, '212-historico-calendario');

  await cal.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(cal).toContainText('Setembro de 2026');
  await expect(cal).toContainText('Nenhum treino neste mês');
});
