/**
 * Cardio besides running: one row of chips on top of the same sheet. The elliptical
 * asks only for time; swimming takes meters and shows pace per 100 m; the phone
 * remembers the last activity.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test('registrar elíptico e natação sem mudar o resto da tela', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('cardio'));
  await onboard(page, 'Lu', { gym: 3, run: 0 });

  // A gym day: cardio is in the start sheet, next to the blank workout.
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Cardio/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Registrar corrida' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Elíptico' }).click();
  await expect(sheet.getByRole('heading', { name: 'Registrar elíptico' })).toBeVisible();
  // No distance on the elliptical, no run type.
  await expect(sheet.getByLabel(/Distância/)).toHaveCount(0);
  await expect(sheet.getByText('Tipo de corrida')).toHaveCount(0);
  await sheet.getByLabel('Tempo').fill('30:00');
  await sheet.getByRole('button', { name: '6', exact: true }).click();
  await shot(page, '79-cardio-eliptico');
  await sheet.getByRole('button', { name: 'Salvar elíptico' }).click();
  await expect(page.getByText('Elíptico registrado')).toBeVisible();

  // Bonus cardio: the gym day is still open, and the sheet opens on the last activity.
  await expect(page.getByRole('heading', { name: 'Treino de hoje feito' })).toHaveCount(0);
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Cardio/ }).click();
  await expect(sheet.getByRole('heading', { name: 'Registrar elíptico' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Natação' }).click();
  await sheet.getByLabel('Distância (m), opcional').fill('1500');
  await sheet.getByLabel('Tempo').fill('30:00');
  await expect(sheet.getByText('2:00 /100 m')).toBeVisible();
  await sheet.getByRole('button', { name: 'Salvar natação' }).click();
  await expect(page.getByText('Natação registrada')).toBeVisible();
  // No cardio in the plan: it is a bonus, not a deviation.
  await expect(page.getByTestId('week-text')).not.toContainText('desvio');

  // History: each one with its own name, distance and pace.
  await page.goto('/historico');
  await expect(page.getByRole('button', { name: /^Elíptico/ })).toContainText('30 min');
  await expect(page.getByRole('button', { name: /^Natação/ })).toContainText('1.500 m');
  await expect(page.getByRole('button', { name: /^Natação/ })).toContainText('2:00 /100 m');
  await expect(page.getByText('Desvio do plano')).toHaveCount(0);
  await shot(page, '80-cardio-historico');
});
