/**
 * One set, one draft: what the person types in the editor is what the focus mode shows and
 * saves, and turning a suggestion down brings the editor back to last time's values
 * (dossiê UX-01 e UX-02).
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('editar no editor e voltar ao foco mostra e grava os mesmos valores', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
  await login(page, uniqueEmail('rascunho-foco'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });
  await page.getByRole('button', { name: 'Iniciar treino' }).click();
  await page.waitForURL(/\/treino\//);

  await page.getByRole('button', { name: 'Modo foco' }).click();
  const focus = page.getByRole('region', { name: 'Modo foco' });
  await focus.getByRole('button', { name: 'Ajustar' }).click();
  const editor = page.getByTestId('set-editor');
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('20');
  await editor.getByLabel('Repetições', { exact: true }).fill('10');

  // Back to focus without saving: the same 20 kg × 10, and that is what gets recorded.
  await page.getByRole('button', { name: 'Modo foco' }).click();
  await expect(focus.getByLabel('A fazer: 20 kg × 10')).toBeVisible();
  await focus.getByRole('button', { name: 'Ajustar' }).click();
  await expect(editor.getByLabel('Carga (kg)', { exact: true })).toHaveValue('20');
  await expect(editor.getByLabel('Repetições', { exact: true })).toHaveValue('10');
  await page.getByRole('button', { name: 'Modo foco' }).click();
  await focus.getByRole('button', { name: 'Série feita' }).click();
  await page.getByRole('button', { name: 'Sair do modo foco' }).click();

  const done = page
    .getByTestId('item-card')
    .first()
    .locator('[data-testid="set-row"][data-done="true"]');
  await expect(done).toHaveCount(1);
  await expect(done).toContainText('20 kg');
  await expect(done).toContainText('10');
});

async function openFichaA(page: Page) {
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
}

test('recusar a progressão volta o editor para a carga de antes', async ({ page }) => {
  await login(page, uniqueEmail('rascunho-recusa'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });
  for (let i = 0; i < 2; i += 1) {
    await openFichaA(page);
    await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
    await page.getByLabel('Do jeito que você fala').fill('40kg 12 12 12');
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
    await page.getByRole('button', { name: 'Opções do treino' }).click();
    await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
    await page.waitForURL(/\/historico\/treino\//);
  }

  // Third time: the plan asks for 42 kg. Pick a work set, then turn the jump down.
  await openFichaA(page);
  const card = page.getByTestId('item-card').first();
  const work = card.locator('[data-testid="set-row"][data-kind="work"]').first();
  await work.locator('.hb-setrow-values').click();
  const editor = page.getByTestId('set-editor');
  await expect(editor.getByLabel('Carga (kg)', { exact: true })).toHaveValue('42');
  // The row says what it was last time, under the new values.
  await expect(work).toContainText('antes 40 kg × 12');
  await shot(page, '210-serie-antes');
  await card.getByRole('button', { name: 'Ignorar sugestão' }).click();
  await expect(work).toContainText('40 kg');
  await expect(work).not.toContainText('antes');
  await expect(editor.getByLabel('Carga (kg)', { exact: true })).toHaveValue('40');
  await expect(editor.getByLabel('Repetições', { exact: true })).toHaveValue('12');

  // A manual change afterwards still wins, in the editor and in focus.
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('41');
  await page.getByRole('button', { name: 'Modo foco' }).click();
  await expect(
    page.getByRole('region', { name: 'Modo foco' }).getByLabel('A fazer: 41 kg × 12'),
  ).toBeVisible();
});

test('ver o histórico do exercício sem sair do treino', async ({ page }) => {
  await login(page, uniqueEmail('historico-no-treino'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });
  await openFichaA(page);
  await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('40kg 12 12 12');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);

  await openFichaA(page);
  const url = page.url();
  await page
    .getByTestId('item-card')
    .first()
    .getByRole('button', { name: /^Opções de / })
    .click();
  await page.getByRole('menuitem', { name: /Ver histórico/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('40 kg');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(url);
});
