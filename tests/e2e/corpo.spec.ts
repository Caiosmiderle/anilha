/**
 * Body tab: register weight and waist, see the weekly pace and what it means for the
 * goal; fix an entry. Syncs like everything else.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test('peso e cintura: ritmo por semana e orientação para ganhar massa', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('corpo'));
  await onboard(page, 'Rafa', { gym: 3, run: 0 });

  await page.goto('/historico?aba=corpo');
  // Health data waits for the person's answer; here it is allowed.
  await page.getByRole('button', { name: 'Permitir dados de saúde' }).click();
  await expect(page.getByText('A média da semana vale mais que um dia')).toBeVisible();

  const today = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const weeksAgo = new Date(today.getTime() - 21 * 86_400_000);

  // Three weeks ago: 80 kg, waist 82 cm.
  await page.getByRole('button', { name: 'Registrar peso e medidas' }).click();
  let sheet = page.getByRole('dialog');
  await sheet.getByLabel('Peso (kg)', { exact: true }).fill('80');
  await sheet.getByLabel('Cintura (cm)', { exact: true }).fill('82');
  await sheet.getByLabel('Data').fill(iso(weeksAgo));
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet).toBeHidden();

  // Today: the weight starts from the last one; 81 kg is about 0.4% a week.
  await page.getByRole('button', { name: 'Registrar peso e medidas' }).click();
  sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('Peso (kg)', { exact: true })).toHaveValue('80');
  await sheet.getByLabel('Peso (kg)', { exact: true }).fill('81');
  await sheet.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByText(/^\+0,4\d?%$/)).toBeVisible();
  await expect(page.getByTestId('body-advice')).toHaveText('No ritmo de quem está ganhando massa.');
  await shot(page, '25-corpo', true);

  // Fix today's entry.
  await page.getByRole('button', { name: /81 kg/ }).click();
  sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Corrigir registro' })).toBeVisible();
  await sheet.getByLabel('Peso (kg)', { exact: true }).fill('80,1');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByTestId('body-advice')).toContainText('Peso quase parado');
});

test('mais de 12 medidas: as antigas continuam alcançáveis e corrigíveis', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('corpo-antigas'));
  await onboard(page, 'Rafa', { gym: 3, run: 0 });
  await page.goto('/historico?aba=corpo');
  await page.getByRole('button', { name: 'Permitir dados de saúde' }).click();

  // 13 weekly weigh-ins, the oldest 13 weeks ago at 70 kg, then 71 to 82.
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let w = 13; w >= 1; w -= 1) {
    await page.getByRole('button', { name: 'Registrar peso e medidas' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Peso (kg)', { exact: true }).fill(String(70 + (13 - w)));
    await sheet.getByLabel('Data').fill(iso(new Date(Date.now() - w * 7 * 86_400_000)));
    await sheet.getByRole('button', { name: 'Salvar' }).click();
    await expect(sheet).toBeHidden();
  }

  const list = page
    .getByRole('region', { name: 'Registros' })
    .or(page.locator('.hb-widget', { hasText: 'Toque para corrigir' }));
  await expect(list.getByRole('button', { name: /^70 kg/ })).toHaveCount(0);
  await list.getByRole('button', { name: /Mostrar mais 1 de 1 anteriores/ }).click();
  await list.getByRole('button', { name: /^70 kg/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Peso (kg)', { exact: true }).fill('69,5');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet).toBeHidden();
  await expect(list.getByRole('button', { name: /^69,5 kg/ })).toBeVisible();
});
