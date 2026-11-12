/**
 * Focus mode in the workout, in the style of a running app: the clock and one big button.
 * Série feita records what is shown, the rest is a big countdown with Pular and +15 s, and
 * the device remembers the choice.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Monday 19/10/2026: a gym day of the plan.
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
});

test('modo foco: série feita num toque, descanso grande, e o aparelho lembra', async ({ page }) => {
  await login(page, uniqueEmail('modofoco'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });
  await page.getByRole('button', { name: 'Iniciar treino' }).click();
  await page.waitForURL(/\/treino\//);

  await page.getByRole('button', { name: 'Modo foco' }).click();
  const focus = page.getByRole('region', { name: 'Modo foco' });
  await expect(focus).toBeVisible();
  await expect(focus).toContainText('Supino reto com barra');
  // The first warm-up comes with its reps; the load is set once, in Ajustar.
  await expect(focus.getByLabel('A fazer: 6 repetições')).toBeVisible();
  await focus.getByRole('button', { name: 'Ajustar' }).click();
  await expect(focus).toHaveCount(0);
  const editor = page.getByTestId('set-editor');
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('20');
  await editor.getByLabel('Repetições', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();

  // Back to focus: the rest, big, with Pular and +15 s.
  await page.getByRole('button', { name: 'Modo foco' }).click();
  const rest = focus.getByRole('timer', { name: 'Descanso restante' });
  await expect(rest).toBeVisible();
  const before = await rest.innerText();
  await focus.getByRole('button', { name: '15 s' }).click();
  await expect(rest).not.toHaveText(before);
  await shot(page, '190-foco-descanso');
  await focus.getByRole('button', { name: 'Pular descanso' }).click();

  // The next warm-up keeps the load of the last one and its own reps: one tap records it.
  await expect(focus.getByLabel('A fazer: 20 kg × 6')).toBeVisible();
  await shot(page, '191-foco-serie');
  await focus.getByRole('button', { name: 'Série feita' }).click();
  await expect(focus.getByRole('timer', { name: 'Descanso restante' })).toBeVisible();
  await expect(focus).toContainText('Próxima:');

  // The device remembers: the workout opens in focus mode.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Modo foco' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair do modo foco' }).click();
  await expect(page.getByRole('region', { name: 'Modo foco' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('set-editor')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Modo foco' })).toHaveCount(0);
  // Two sets recorded, both in the history of the card.
  await expect(
    page.getByTestId('item-card').first().locator('[data-testid="set-row"][data-done="true"]'),
  ).toHaveCount(2);
});
