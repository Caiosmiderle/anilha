/**
 * Target race: asked in the setup for whoever runs races, then on Plan (countdown and the
 * long run of each week) and on Today, where the long run gets its distance.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail, walkTo } from './helpers';

test('prova alvo: no cadastro, em Plano e no dia do longão', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Monday 19/10/2026; the half marathon is on Sunday 17/01/2027.
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
  await login(page, uniqueEmail('prova'));

  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Lu');
  await walkTo(page, 'Qual o seu objetivo principal?');
  await page.getByRole('radio', { name: /^Correr provas/ }).click();
  // Its own screen, only for runners.
  await walkTo(page, 'Tem prova marcada?');
  await page
    .getByRole('group', { name: 'Prova marcada' })
    .getByRole('button', { name: '21 km' })
    .click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Escolha a data da prova')).toBeVisible();
  await page.getByLabel('Data da prova').fill('2027-01-17');

  // One run, today (Monday).
  await walkTo(page, 'Quantos dias por semana?');
  await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  await page.getByRole('button', { name: 'Correr na segunda' }).click();
  await walkTo(page, 'Seu plano da semana');
  await expect(
    page.getByText(
      /^Prova de 21 km \(meia maratona\) em 17\/01: o longão sobe até 10 % por semana/,
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');

  // Today: the long run has its distance, by effort without a recent time, and the why.
  await expect(page.getByText('Hoje: longão de 8 km')).toBeVisible();
  await expect(page.getByTestId('run-steps')).toContainText(
    '8 kmleve, esforço 3 a 4 de 10, dá para conversar em frases inteiras',
  );
  await expect(page.getByTestId('run-why')).toHaveText(
    'O longão sobe até 10 % por semana: mais que isso aumenta o risco de lesão. Faltam 12 semanas para a prova de 21 km (meia maratona).',
  );
  // The week below has loaded the new plan too.
  await expect(
    page.getByRole('button', { name: /^Segunda, 19\/10: planejado: corrida\. Mudar no plano/ }),
  ).toBeVisible();
  await shot(page, '113-prova-hoje');

  // Plan: the countdown and the long run of each week.
  await page.goto('/plano');
  const card = page.getByTestId('race-card');
  await expect(page.getByRole('heading', { name: 'Prova de 21 km (meia maratona)' })).toBeVisible();
  await expect(page.getByText('Faltam 12 semanas: no domingo (17/01).')).toBeVisible();
  await expect(card.getByText('Longão desta semana: 8 km.')).toBeVisible();
  await expect(
    card.getByRole('img', { name: /^Longão por semana até a prova: 8, 8,5, 9, 7,/ }),
  ).toBeVisible();
  // 12 weeks are not enough for 18 km within 10 % a week: the card says how far it gets.
  await expect(card.getByText(/^Até a prova, o longão chega a 13 km\./)).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shot(page, '114-prova-plano');

  // Paces: from a recent 5 km in 25:00.
  const paces = page.getByRole('heading', { name: 'Seus ritmos' });
  await expect(paces).toBeVisible();
  await page.getByRole('button', { name: 'Informar tempo recente' }).click();
  const markSheet = page.getByRole('dialog');
  await markSheet.getByLabel('Tempo').fill('25:99');
  await markSheet.getByRole('button', { name: 'Salvar tempo' }).click();
  await expect(markSheet.getByText(/^Escreva o tempo/)).toBeVisible();
  await markSheet.getByLabel('Tempo').fill('25:00');
  await markSheet.getByRole('button', { name: 'Salvar tempo' }).click();
  await expect(page.getByText('Tempo salvo. Os ritmos foram atualizados')).toBeVisible();
  await expect(page.getByText('Pelo tempo de 5 km em 25:00 (19/10)')).toBeVisible();
  const zones = page.getByTestId('paces');
  await expect(zones).toContainText('Limiar');
  await expect(zones).toContainText(/Previsão na prova de 21 km\d:\d\d:\d\d \(\d:\d\d\/km\)/);
  await zones.scrollIntoViewIfNeeded();
  await shot(page, '115-ritmos');
  // Today now gives the long run a pace range.
  await page.goto('/');
  await expect(page.getByTestId('run-steps')).toContainText(/8 kmleve, \d:\d\d\/km a \d:\d\d\/km/);
  await page.goto('/plano');

  // Another race: 10 km on 13/12.
  await page.getByRole('button', { name: 'Mudar prova' }).click();
  const sheet = page.getByRole('dialog');
  await sheet
    .getByRole('group', { name: 'Distância' })
    .getByRole('button', { name: '10 km' })
    .click();
  await sheet.getByLabel('Data da prova').fill('2026-12-13');
  await sheet.getByRole('button', { name: 'Salvar prova' }).click();
  await expect(page.getByText('Prova salva')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prova de 10 km' })).toBeVisible();
  await expect(page.getByText('Faltam 7 semanas: no domingo (13/12).')).toBeVisible();

  // No race anymore: the card offers one.
  await page.getByRole('button', { name: 'Tirar prova' }).click();
  await expect(page.getByText('Prova tirada')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Definir prova' })).toBeVisible();
});

test('prova definida em Plano: a última corrida da semana vira longa', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
  await login(page, uniqueEmail('provaplano'));
  // Goal of the setup (gain mass) with one run: an easy one, no long run.
  await onboard(page, 'Rê', { gym: 3, run: 1 });
  await page.goto('/plano');
  await expect(page.getByRole('button', { name: /: Corrida leve\. Mudar$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /: Corrida longa\. Mudar$/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Definir prova' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: '5 km' }).click();
  await sheet.getByRole('button', { name: 'Salvar prova' }).click();
  await expect(sheet.getByText('Escolha a data da prova')).toBeVisible();
  await sheet.getByLabel('Data da prova').fill('2026-11-29');
  await sheet.getByRole('button', { name: 'Salvar prova' }).click();
  await expect(page.getByText(/^Prova salva\. A corrida (na|no) \S+ virou longa$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prova de 5 km' })).toBeVisible();
  await expect(page.getByRole('button', { name: /: Corrida longa\. Mudar$/ })).toBeVisible();
});
