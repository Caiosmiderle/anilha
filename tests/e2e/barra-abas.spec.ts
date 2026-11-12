/**
 * The phone tab bar where iOS 26 puts its own (reference: the WhatsApp bar sent by Caio):
 * on an iPhone with the home bar, 21 pt above the screen edge and 20 pt from the sides,
 * 64 pt tall, with icons of 26 pt and labels of 10 pt; 12 px above the edge without it.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

// iPhone 15 Pro.
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });

test('barra de abas na altura do iOS: 21 pt da borda no iPhone, 12 px sem a barra de início', async ({
  page,
}) => {
  await login(page, uniqueEmail('abas'));
  await onboard(page, 'Rui', { gym: 3, run: 0 });
  await page.goto('/voce');
  const bar = page.locator('.hb-tabbar');

  // No safe area (Android, iPhone with a home button): 12 px from the edge.
  await expect.poll(() => bar.boundingBox()).toEqual({ x: 20, y: 852 - 12 - 64, width: 353, height: 64 });

  // iPhone with the home bar: the bottom safe area is 34 pt, the bar sits 21 pt up.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34 } });
  await expect.poll(() => bar.boundingBox()).toEqual({ x: 20, y: 852 - 21 - 64, width: 353, height: 64 });

  // Big icon, small semibold label, the same weight on every tab.
  const voce = bar.getByRole('link', { name: 'Você' });
  await expect(voce).toHaveClass(/is-active/);
  const icon = await voce.locator('svg').boundingBox();
  expect(icon).toMatchObject({ width: 26, height: 26 });
  for (const tab of await bar.locator('.hb-tab').all()) {
    await expect(tab).toHaveCSS('font-size', '10px');
    await expect(tab).toHaveCSS('font-weight', '600');
  }

  // What floats above the bar keeps clear of it: the end of the page scrolls past its top.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const last = await page.locator('.app-main > *').last().boundingBox();
  if (!last) throw new Error('página sem conteúdo');
  expect(last.y + last.height).toBeLessThanOrEqual(852 - 21 - 64);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, '197-barra-abas-iphone');
});
