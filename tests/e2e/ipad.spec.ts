/**
 * iPadOS 26 blurs the top ~40 pt of an installed web app, above the page. In the
 * installed iPad app the side menu and the page start below that band, so nothing sits
 * under the blur; in Safari, on the iPhone and on a computer nothing changes.
 */
import { expect, test, type Browser } from '@playwright/test';
import { login } from './helpers';

const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
// iPadOS Safari asks for the desktop site by default: a Mac agent with a touch screen.
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

async function open(
  browser: Browser,
  opts: { ua: string; installed: boolean; touchPoints: number; width: number; height: number },
) {
  const context = await browser.newContext({
    userAgent: opts.ua,
    viewport: { width: opts.width, height: opts.height },
    hasTouch: opts.touchPoints > 0,
    isMobile: false,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await context.addInitScript(
    ({ installed, touchPoints }) => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => installed });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => touchPoints });
    },
    { installed: opts.installed, touchPoints: opts.touchPoints },
  );
  const page = await context.newPage();
  await login(page, 'caio@anilha.dev');
  await expect(page.getByRole('heading', { name: /Rafa/ })).toBeVisible();
  const nav = page.locator('.app-sidenav');
  const brand = await nav.getByRole('link', { name: 'Anilha, início' }).boundingBox();
  const title = await page.getByRole('heading', { name: /Rafa/ }).boundingBox();
  const flagged = await page.evaluate(() => document.documentElement.hasAttribute('data-ipad-app'));
  return { context, page, brand, title, flagged };
}

test('iPad instalado: o menu e a página começam abaixo do desfoque do sistema', async ({
  browser,
}) => {
  const r = await open(browser, {
    ua: IPAD,
    installed: true,
    touchPoints: 5,
    width: 1366,
    height: 1024,
  });
  expect(r.flagged).toBe(true);
  // Brand and page title start below the 40 px band.
  expect(r.brand?.y ?? 0).toBeGreaterThanOrEqual(40);
  expect(r.title?.y ?? 0).toBeGreaterThanOrEqual(40);
  await r.page.screenshot({ path: 'artifacts/screens/92-ipad-instalado.png' });
  await r.context.close();

  // iPadOS asking for the desktop site: same thing.
  const mac = await open(browser, {
    ua: IPAD_AS_MAC,
    installed: true,
    touchPoints: 5,
    width: 1366,
    height: 1024,
  });
  expect(mac.flagged).toBe(true);
  expect(mac.brand?.y ?? 0).toBeGreaterThanOrEqual(40);
  await mac.context.close();
});

test('iPad no Safari e computador instalado: menu sem a faixa', async ({ browser }) => {
  const safari = await open(browser, {
    ua: IPAD,
    installed: false,
    touchPoints: 5,
    width: 1366,
    height: 1024,
  });
  expect(safari.flagged).toBe(false);
  expect(safari.brand?.y ?? 99).toBeLessThan(40);
  await safari.context.close();

  // A Mac with no touch screen, app installed from Chrome: not an iPad.
  const desktop = await open(browser, {
    ua: IPAD_AS_MAC,
    installed: true,
    touchPoints: 0,
    width: 1440,
    height: 900,
  });
  expect(desktop.flagged).toBe(false);
  expect(desktop.brand?.y ?? 99).toBeLessThan(40);
  await desktop.context.close();
});
