/**
 * The load goes up only after the top of the range twice in a row:
 * first "repeat the load", then the jump.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

async function quickSession(page: Page, text: string) {
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
  await page.getByLabel('Do jeito que você fala').fill(text);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);
}

test('a carga sobe só depois do topo duas vezes seguidas: na primeira, repete', async ({
  page,
}) => {
  await login(page, uniqueEmail('topo'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });

  await quickSession(page, '40kg 12 12 12');
  const next = page.getByTestId('next-time').first();
  await expect(next).toContainText(
    'Próxima vez: Repita 40 kg: se bater o topo de novo, a carga sobe.',
  );
  await expect(next).toContainText('pela primeira vez com 40 kg');
  await next.scrollIntoViewIfNeeded();
  await shot(page, '199-progressao-repita');

  await quickSession(page, '40kg 12 12 12');
  const again = page.getByTestId('next-time').first();
  // Typed sets carry no effort: the jump comes "com cautela".
  await expect(again).toContainText(
    'Próxima vez: Suba para 42 kg com cautela e volte para 8 repetições.',
  );
  await expect(again).toContainText('pela segunda sessão seguida');
  await again.scrollIntoViewIfNeeded();
  await shot(page, '200-progressao-sobe');
});
