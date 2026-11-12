/** The wide screen for the manifest (install dialog on a computer) and the landing. */
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { login } from '../../tests/e2e/helpers';
import { renameAtRealTime } from './flow';

test('tela larga', async ({ page, browser }) => {
  await renameAtRealTime(browser, 'caio@anilha.dev');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-26T06:10:00-03:00') });
  await login(page, 'caio@anilha.dev');
  await expect(page.getByTestId('sync-status').filter({ visible: true })).toHaveAttribute(
    'data-state',
    'idle',
    { timeout: 20_000 },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Rafa/ })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(500);
  mkdirSync('marketing/capture/screens', { recursive: true });
  await page.screenshot({ path: 'marketing/capture/screens/desktop-hoje.png' });
});
