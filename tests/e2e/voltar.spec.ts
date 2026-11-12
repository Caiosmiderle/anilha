/**
 * Back on the phone: the installed iPhone app has no browser back, so screens below a
 * tab have "Voltar" at the top left and, in the installed app, the swipe from the edge.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

/** A finger dragged from the left edge to the middle of the screen. */
async function swipeFromEdge(page: Page) {
  await page.evaluate(() => {
    const at = (x: number) =>
      new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 420 });
    const fire = (type: string, x: number, list: boolean) =>
      document.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          touches: list ? [at(x)] : [],
          changedTouches: [at(x)],
        }),
      );
    fire('touchstart', 6, true);
    fire('touchmove', 80, true);
    fire('touchend', 160, false);
  });
}

test('voltar: botão nas telas de dentro e gesto da borda no app instalado', async ({ page }) => {
  // As the app installed on the iPhone home screen.
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }),
  );
  await login(page, uniqueEmail('voltar'));
  await onboard(page, 'Bia', { gym: 3, run: 0 });

  // Tabs have no back.
  await expect(page.getByRole('button', { name: 'Voltar', exact: true })).toHaveCount(0);

  // Inside the app: back to the screen it came from.
  await page.getByRole('link', { name: 'Plano' }).first().click();
  await page
    .getByRole('link', { name: /Peito e tríceps/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: /Peito e tríceps/ })).toBeVisible();
  await shot(page, '29-voltar');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.waitForURL(/\/plano$/);

  // The edge swipe does the same.
  await page.goto('/plano?aba=treinos');
  await page.getByRole('button', { name: 'Ver exercícios' }).click();
  await expect(page.getByRole('heading', { name: 'Exercícios' })).toBeVisible();
  await swipeFromEdge(page);
  await page.waitForURL(/\/plano\?aba=treinos$/);

  // Opened directly (a link or a notification): goes to the screen above.
  await page.goto('/ajustes');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.waitForURL(/\/voce$/);

  // A finished workout: back to Today, which has nothing to ignore anymore.
  await page.goto('/');
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
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('heading', { name: 'Treino de hoje feito' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ocultar explicação' })).toHaveCount(0);
});
