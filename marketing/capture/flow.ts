/** Steps shared by the captures: the account answered and named, so no prompt shows. */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { login } from '../../tests/e2e/helpers';

/**
 * The health data choice answered, so no red dot on the Você tab shows in the images
 * (the seed has body logs: allowed).
 */
export async function answerHealth(page: Page) {
  await page.goto('/voce');
  // Você drawn (the Privacidade row is always there); only then is the pending card final.
  await expect(page.getByRole('link', { name: /^Privacidade/ })).toBeVisible();
  const pending = page.getByTestId('health-pending');
  if (await pending.isVisible()) {
    await pending.getByRole('button', { name: 'Permitir', exact: true }).click();
    await expect(pending).toHaveCount(0);
  }
}

/** The one-time reminder offer on Today answered, so it does not show in the images. */
export async function answerReminder(page: Page) {
  await page.goto('/');
  // Today is drawn when the week shows; only then is the offer (or its absence) final.
  await expect(page.getByRole('heading', { name: 'Sua semana' })).toBeVisible();
  const later = page.getByRole('button', { name: 'Agora não' });
  if (await later.isVisible()) await later.click();
  await expect(page.getByRole('heading', { name: 'Lembrete do treino' })).toHaveCount(0);
}

/** A neutral name on screen; return mode off (the seed starts in it). */
export async function rename(page: Page) {
  await answerHealth(page);
  await answerReminder(page);
  await page.goto('/voce');
  await page.getByRole('button', { name: /^Nome/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Nome', { exact: true }).fill('Rafa');
  await sheet.getByLabel('Sobrenome', { exact: true }).fill('Souza');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet).toBeHidden();
  await page.goto('/voce/treino');
  await page.getByRole('button', { name: 'Desligado' }).click();
  await expect(page.getByRole('button', { name: 'Desligado' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('/');
  await expect(page.getByTestId('sync-status').filter({ visible: true })).toHaveAttribute(
    'data-state',
    'idle',
    { timeout: 20_000 },
  );
}

/**
 * The same, in a context of its own at real time, before a test installs its clock. The
 * seed is written at real time, so a profile saved under a clock set in the past loses to
 * it on the next sync and the previous display name comes back.
 */
export async function renameAtRealTime(browser: Browser, email: string) {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL } =
    test.info().project.use;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    userAgent,
    baseURL,
  });
  const page = await context.newPage();
  await login(page, email);
  await rename(page);
  await context.close();
}
