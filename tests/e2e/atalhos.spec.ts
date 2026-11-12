/**
 * Shortcuts: drag to order the exercises of a ficha, trade two days of the plan, "Deixar
 * para o fim" and "Fazer agora" in the workout (equipment busy), and the shortcuts of the
 * app icon.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

/** Drags a handle with the mouse until its row is over `to`. */
async function dragTo(page: Page, handle: Locator, to: Locator) {
  const a = await handle.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('sem caixa');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, b.y + b.height / 2, { steps: 14 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Monday 19/10/2026: a gym day of the plan.
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
});

test('ficha: arrastar muda a ordem dos exercícios, e as setas do teclado também', async ({
  page,
}) => {
  await login(page, uniqueEmail('ordemficha'));
  await onboard(page, 'Duda', { gym: 3, run: 0 });
  await page.goto('/plano');
  await page.getByRole('link', { name: /^Ficha A: Peito e tríceps/ }).click();
  const names = page.locator('.routine-row .hb-list-title');
  await expect(names.first()).toBeVisible();
  const before = await names.allTextContents();
  expect(before.length).toBeGreaterThan(3);

  // The third exercise dragged to the top.
  const rows = page.locator('.routine-row');
  await dragTo(page, rows.nth(2).locator('.sort-handle'), rows.nth(0));
  await expect(names.first()).toHaveText(before[2] as string);
  await expect(names.nth(1)).toHaveText(before[0] as string);
  await shot(page, '130-ficha-arrastada');

  // Keyboard: the first one goes down one place.
  await rows.nth(0).locator('.sort-handle').focus();
  await page.keyboard.press('ArrowDown');
  await expect(names.first()).toHaveText(before[0] as string);
  await expect(names.nth(1)).toHaveText(before[2] as string);
});

test('plano: tocar num dia e trocar com outro', async ({ page }) => {
  await login(page, uniqueEmail('trocadia'));
  await onboard(page, 'Rui', { gym: 3, run: 1 });
  await page.goto('/plano');
  const week = page.getByRole('list', { name: 'Esta semana' });
  const monday = week.getByRole('button', { name: /^Segunda, 19\/10: / });
  const tuesday = week.getByRole('button', { name: /^Terça, 20\/10: / });
  const label = (s: string | null) => (s ?? '').replace(/^\S+, \d\d\/\d\d: /, '');
  const mondayWas = label(await monday.getAttribute('aria-label'));
  const tuesdayWas = label(await tuesday.getAttribute('aria-label'));
  expect(mondayWas).not.toEqual(tuesdayWas);
  await monday.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Trocar com terça/ })
    .click();
  // What was on Monday is now on Tuesday, and the other way around. The run can start on
  // either day (the test does not pin the onboarding's choice), so follow where it was.
  const runWasMonday = /Corrida/.test(mondayWas);
  expect(runWasMonday || /Corrida/.test(tuesdayWas)).toBe(true);
  const runNow = runWasMonday ? tuesday : monday;
  const otherNow = runWasMonday ? monday : tuesday;
  await expect(runNow).toHaveAttribute('aria-label', /: Corrida/);
  await expect(otherNow).not.toHaveAttribute('aria-label', /: Corrida/);
});

test('treino: deixar para o fim e fazer agora, para quando o aparelho está ocupado', async ({
  page,
}) => {
  await login(page, uniqueEmail('ocupado'));
  await onboard(page, 'Lia', { gym: 3, run: 0 });
  await page.getByRole('button', { name: 'Iniciar treino' }).click();
  await page.waitForURL(/\/treino\//);
  const cards = page.getByTestId('item-card');
  const first = await cards.nth(0).getAttribute('aria-label');
  const second = await cards.nth(1).getAttribute('aria-label');
  const last = await cards.last().getAttribute('aria-label');

  // The first machine is busy: it goes to the end and the next one is up.
  await page.getByRole('button', { name: `Opções de ${first}` }).click();
  await page.getByRole('menuitem', { name: /Deixar para o fim/ }).click();
  await expect(page.getByText(`${first} vai para o fim`)).toBeVisible();
  await expect(cards.first()).toHaveAttribute('aria-label', second as string);
  await expect(cards.last()).toHaveAttribute('aria-label', first as string);
  await expect(page.getByRole('region', { name: 'Série atual' })).toContainText(second as string);

  // The last one now: it comes before the one in progress.
  await page.getByRole('button', { name: `Opções de ${last}` }).click();
  await page.getByRole('menuitem', { name: /Fazer agora/ }).click();
  await expect(cards.first()).toHaveAttribute('aria-label', last as string);
  await expect(page.getByRole('region', { name: 'Série atual' })).toContainText(last as string);
});

test('atalhos do ícone do app: treino de hoje e registrar corrida', async ({ page }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual([
    '/?atalho=treino',
    '/?atalho=corrida',
    '/historico',
  ]);

  await login(page, uniqueEmail('atalho'));
  await onboard(page, 'Bia', { gym: 3, run: 0 });
  await page.goto('/?atalho=corrida');
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Registrar corrida' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();

  await page.goto('/?atalho=treino');
  await page.waitForURL(/\/treino\//);
});
