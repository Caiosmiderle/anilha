/**
 * Main flow at 390x844: create account, start a session, log sets (steppers, one tap,
 * quick text), switch a set to warm-up, swap and skip exercises, finish, see history and
 * the next-time suggestion, then train offline and sync without duplicates.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, stats, uniqueEmail } from './helpers';

async function openStartSheet(page: Page) {
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Iniciar treino' })).toBeVisible();
}

function card(page: Page, name: RegExp) {
  return page.getByTestId('item-card').filter({ has: page.getByRole('heading', { name }) });
}

async function waitSynced(page: Page) {
  await expect(page.getByTestId('sync-status').filter({ visible: true })).toHaveAttribute(
    'data-state',
    'idle',
    {
      timeout: 20_000,
    },
  );
  await expect(page.getByTestId('sync-status').filter({ visible: true })).toHaveText(
    'Sincronizado',
    { timeout: 20_000 },
  );
}

test('fluxo principal: registrar, trocar, pular, encerrar, histórico, sugestão e offline', async ({
  page,
  context,
}) => {
  const email = uniqueEmail('principal');
  await login(page, email);
  await onboard(page, 'Rita', { gym: 3, run: 2 });
  await expect(page.getByRole('heading', { name: /Rita/ })).toBeVisible();

  // Start from a routine.
  await openStartSheet(page);
  await page.getByRole('button', { name: /^Ficha B: Costas e bíceps/ }).click();
  await page.waitForURL(/\/treino\//);
  const puxada = card(page, /Puxada frente na polia/);
  await expect(puxada.getByTestId('suggestion')).toHaveAttribute('data-kind', 'first_time');

  // Warm-up first: no effort asked.
  const editor = page.getByTestId('set-editor');
  await expect(puxada.getByTestId('set-row').first()).toHaveAttribute('data-kind', 'warmup');
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('20');
  await editor.getByLabel('Repetições', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect(page.getByTestId('effort-prompt')).toHaveCount(0);
  // Warm-up rest is one minute, whatever the exercise rest.
  await expect(page.getByTestId('rest-timer').locator('.hb-rest-time')).toHaveText(
    /^(1:00|0:5[0-9])$/,
  );

  // Mandatory warm-up for an intermediate: 2 sets, 40% and 80%; the rule is on the card.
  await expect(puxada.getByTestId('warmup-note')).toContainText(
    'Aquecimento obrigatório: 2 séries de 6, com 40% e 80% da carga de trabalho',
  );
  await expect(puxada.getByTestId('set-row').nth(1)).toHaveAttribute('data-kind', 'warmup');
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('32,5');
  await editor.getByLabel('Repetições', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
  await expect(page.getByTestId('effort-prompt')).toHaveCount(0);
  await expect(puxada.getByTestId('warmup-note')).toHaveCount(0);

  // Work set with the big steppers: starts from the last set, type the load, bump reps.
  await expect(editor.getByLabel('Carga (kg)', { exact: true })).toHaveValue('32,5');
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('40');
  await editor.getByLabel('Repetições', { exact: true }).fill('9');
  await editor.getByRole('button', { name: 'Aumentar repetições' }).click();
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
  await expect(puxada.getByTestId('set-row').nth(2)).toHaveAttribute('data-done', 'true');
  await page.getByTestId('effort-prompt').getByRole('button', { name: 'Ok', exact: true }).click();
  await expect(puxada.getByTestId('set-row').nth(2)).toContainText('Ok');

  // The rest of the sets with quick text.
  await editor.getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('40kg 10 10 pesado');
  await expect(page.getByTestId('quick-preview')).toContainText('2 séries de trabalho');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await expect(puxada.locator('[data-testid="set-row"][data-done="true"]')).toHaveCount(5);

  // One tap toggles warm-up and work on a row.
  const remada = card(page, /Remada curvada com barra/);
  const firstRow = remada.getByTestId('set-row').first();
  await expect(firstRow).toHaveAttribute('data-kind', 'work');
  await firstRow.getByRole('button', { name: /Tocar alterna/ }).click();
  await expect(remada.getByTestId('set-row').first()).toHaveAttribute('data-kind', 'warmup');

  // Swap the barbell row: the original stays recorded.
  await remada.getByRole('button', { name: /Opções de Remada curvada/ }).click();
  await page.getByRole('menuitem', { name: /Substituir exercício/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Remada unilateral com halter/ })
    .first()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aparelho ocupado' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Trocar exercício' }).click();
  const unilateral = card(page, /Remada unilateral com halter/);
  await expect(unilateral).toContainText('no lugar de remada curvada com barra');

  // Skip with a reason.
  const baixa = card(page, /Remada baixa na polia/);
  await baixa.getByRole('button', { name: /Opções de Remada baixa/ }).click();
  await page.getByRole('menuitem', { name: /Pular exercício/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sem tempo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pular exercício' }).click();
  await expect(baixa).toContainText('Pulado: Sem tempo.');

  // Finish early: nothing done is lost.
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);

  // History keeps planned, swapped and skipped, plus next time.
  await expect(page.getByTestId('substitution')).toContainText('Remada curvada com barra');
  await expect(page.getByTestId('skip-reason')).toContainText('Sem tempo');
  await expect(page.getByTestId('next-time').first()).toContainText(
    'Fique em 40 kg e some repetições até 12',
  );

  await page.getByRole('link', { name: 'Histórico' }).filter({ visible: true }).click();
  await expect(page.getByRole('link', { name: /Costas e bíceps/ })).toBeVisible();

  // Next time the session shows the suggestion and prefills it.
  await page
    .getByRole('link', { name: /Costas e bíceps/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Repetir este treino' }).click();
  await page.waitForURL(/\/treino\//);
  const again = card(page, /Puxada frente na polia/);
  await expect(again.getByTestId('suggestion')).toHaveAttribute('data-kind', 'hold_reps');
  await expect(again.locator('[data-testid="set-row"][data-kind="work"]').first()).toContainText(
    '40 kg × 10',
  );
  // Warm-up loads come from today's working load: 40% and 80% of 40 kg, in pulley steps.
  const warm = again.locator('[data-testid="set-row"][data-kind="warmup"]');
  await expect(warm.first()).toContainText('15 kg × 6');
  await expect(warm.nth(1)).toContainText('32,5 kg × 6');
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Descartar treino' }).click();
  await page.waitForURL('/');

  await waitSynced(page);
  const before = await stats(page, email);
  expect(before.sets).toBe(5);
  expect(before.sessions).toBe(1);

  // Offline at the gym: the app opens from the service worker and logs sets locally.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 20_000,
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Rita/ })).toBeVisible();
  await openStartSheet(page);
  await page.getByRole('button', { name: /^Ficha C: Perna/ }).click();
  await page.waitForURL(/\/treino\//);
  await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('60kg 10 10 10 ok');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);
  expect((await stats(page, email)).sets).toBe(5);

  // Back online: syncs once, with no duplicates even after reloads.
  await context.setOffline(false);
  await page.goto('/');
  await waitSynced(page);
  await expect.poll(async () => (await stats(page, email)).sets, { timeout: 20_000 }).toBe(8);
  await page.reload();
  await waitSynced(page);
  const after = await stats(page, email);
  expect(after.sets).toBe(8);
  expect(after.sessions).toBe(2);
});

test('outro aparelho recebe o histórico pela sincronização', async ({ browser }) => {
  const email = uniqueEmail('aparelho');
  const first = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const a = await first.newPage();
  await login(a, email);
  await onboard(a, 'Teo', { gym: 3, run: 0 });
  await a
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await a.getByRole('button', { name: /^Ficha A: Peito e tríceps/ }).click();
  await a.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await a.getByLabel('Do jeito que você fala').fill('50kg 8 8 8');
  await a.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await a.getByRole('button', { name: 'Opções do treino' }).click();
  await a.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await a.waitForURL(/\/historico\/treino\//);
  await expect.poll(async () => (await stats(a, email)).sets, { timeout: 20_000 }).toBe(3);

  const second = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const b = await second.newPage();
  await login(b, email);
  await expect(b.getByRole('heading', { name: /Teo/ })).toBeVisible();
  await b.goto('/historico');
  await expect(b.getByRole('link', { name: /Peito e tríceps/ })).toBeVisible();
  await first.close();
  await second.close();
});
