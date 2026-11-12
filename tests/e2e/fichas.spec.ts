/**
 * Split question of the onboarding (fichas in rotation) and the menu of a finished
 * session: hold the row in the history to repeat or delete it.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, shot, uniqueEmail, walkTo } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function toSplitStep(page: Page, gym: number) {
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Caio');
  await walkTo(page, 'Quantos dias por semana?');
  for (let i = 3; i < gym; i += 1)
    await page.getByRole('button', { name: 'Aumentar academia' }).click();
  if (gym >= 5) await page.getByRole('button', { name: `Quero ${gym} mesmo assim` }).click();
  await walkTo(page, 'Como dividir os treinos?');
}

/** Muscle groups, A to C: the tests below open "Ficha A: Peito e tríceps". */
async function byGroups(page: Page) {
  await page.getByRole('radio', { name: /^Por grupo muscular/ }).click();
  await walkTo(page, 'Seu plano da semana');
}

test('divisão: sugestão equilibrada, ou por grupo muscular em fichas que giram', async ({
  page,
}) => {
  await login(page, uniqueEmail('fichas'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Caio');

  // Where: visual cards, full gym by default.
  await walkTo(page, 'Onde você treina?');
  await expect(page.getByRole('radio', { name: /Academia completa/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await shot(page, '71-onde', true);
  await walkTo(page, 'Quantos dias por semana?');
  for (let i = 3; i < 5; i += 1)
    await page.getByRole('button', { name: 'Aumentar academia' }).click();
  await page.getByRole('button', { name: 'Quero 5 mesmo assim' }).click();
  await walkTo(page, 'Como dividir os treinos?');

  // Suggested with 5 days: upper and lower, a balanced week.
  const upperLower = page.getByRole('radio', { name: /^Superior e inferior/ });
  await expect(upperLower).toHaveAttribute('aria-checked', 'true');
  await expect(upperLower).toContainText('Sugerido');

  // Muscle groups by hand: A to C, the week shows A, B, C, A, B.
  const grupos = page.getByRole('radio', { name: /^Por grupo muscular/ });
  await grupos.click();
  await expect(grupos).toHaveAttribute('aria-checked', 'true');
  await expect(grupos).toContainText('Peito e tríceps');
  await expect(page.getByText(/elas giram: A, B, C, A, B/)).toBeVisible();
  await shot(page, '70-divisao', true);

  // Five fichas, A to E: arms get their own day.
  await page.getByRole('button', { name: 'A a E' }).click();
  await expect(grupos).toContainText('Braços');

  // Gender is optional: the button says so.
  await walkTo(page, 'Como você se identifica?');
  await expect(page.getByText(/^Opcional\. Só ajusta um pouco o volume/)).toBeVisible();
  await shot(page, '72-genero', true);
  await page.getByRole('button', { name: 'Pular' }).click();

  await expect(page.getByRole('heading', { name: 'Seu plano da semana' })).toBeVisible();
  await expect(page.getByText('Ficha E: Braços')).toBeVisible();
  await expect(page.getByLabel('Semana do plano')).toBeVisible();
  await shot(page, '73-plano-fichas', true);
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');

  await page.goto('/plano');
  await expect(page.getByText('Rodízio de fichas')).toBeVisible();
  await expect(page.getByTestId('week-next')).toContainText('Ficha A: Peito');
  await shot(page, '74-plano-rodizio', true);
});

test('segurar o treino no histórico abre o menu e apaga', async ({ page }) => {
  await login(page, uniqueEmail('apagar'));
  await toSplitStep(page, 3);
  await byGroups(page);
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');

  // One quick session.
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Ficha A: Peito e tríceps/ }).click();
  await page.waitForURL(/\/treino\//);
  await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('30kg 10 10');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);

  // The session page has an options button at the top.
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await expect(page.getByRole('menuitem', { name: /Apagar treino/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();

  await page.goto('/historico');
  const row = page.getByRole('link', { name: /Ficha A: Peito e tríceps/ });
  await expect(row).toBeVisible();

  // Touch hold: the menu opens and the tap that ends the hold does not open the row.
  const box = await row.boundingBox();
  if (!box) throw new Error('linha sem posição');
  const at = { clientX: box.x + 40, clientY: box.y + box.height / 2 };
  await row.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, ...at });
  await page.waitForTimeout(600);
  await row.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, ...at });
  const menu = page.getByRole('dialog');
  await expect(menu.getByRole('menuitem', { name: /Repetir este treino/ })).toBeVisible();
  await shot(page, '75-menu-historico');
  await menu.getByRole('menuitem', { name: /Apagar treino/ }).click();
  await expect(menu.getByRole('heading', { name: 'Apagar este treino?' })).toBeVisible();
  await menu.getByRole('button', { name: 'Apagar treino' }).click();
  await expect(page.getByText('Treino apagado')).toBeVisible();
  await expect(page.getByRole('link', { name: /Ficha A: Peito e tríceps/ })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/historico');
});

test('clique com o botão direito também abre o menu do treino', async ({ page }) => {
  await login(page, uniqueEmail('direito'));
  await toSplitStep(page, 3);
  await byGroups(page);
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Ficha B: Costas e bíceps/ }).click();
  await page.waitForURL(/\/treino\//);
  await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('40kg 10 10');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);

  await page.goto('/historico');
  const row = page.getByRole('link', { name: /Ficha B: Costas e bíceps/ });
  await row.click({ button: 'right' });
  await expect(
    page.getByRole('dialog').getByRole('menuitem', { name: /Ver treino/ }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  expect(new URL(page.url()).pathname).toBe('/historico');
});
