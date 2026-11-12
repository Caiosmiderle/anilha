/**
 * The landing (/conheca/): a static page outside the app. One poster for the screen
 * shape, the install steps for the device first, a warning inside in-app browsers.
 */
import { devices, expect, test, type Page } from '@playwright/test';
import { shot } from './helpers';

function trackVideos(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\.mp4(?:[?#]|$)/i.test(request.url())) requests.push(request.url());
  });
  return requests;
}

async function expectPoster(page: Page, wide: boolean) {
  const poster = page.locator('picture > img#promo');
  await expect(poster).toBeVisible();
  await expect(poster).toHaveAttribute('alt', /Marca Anilha.*Seu treino, num toque.*Comece grátis/);
  await expect
    .poll(() =>
      poster.evaluate((img: HTMLImageElement) => ({
        src: new URL(img.currentSrc).pathname,
        loaded: img.complete && img.naturalWidth > 0,
      })),
    )
    .toEqual({
      src: `/conheca/media/poster-${wide ? '16x9' : '9x16'}.webp`,
      loaded: true,
    });
  const frame = await page.locator('.video-frame').boundingBox();
  expect(frame).not.toBeNull();
  expect(frame!.width / frame!.height).toBeCloseTo(wide ? 16 / 9 : 9 / 16, 2);
  await expect(page.locator('video, [data-sound], [data-play], #texto-do-video')).toHaveCount(0);
  await expect(page.locator('a[href="#texto-do-video"]')).toHaveCount(0);
}

/** Lazy images load only near the viewport: walk the page before a full-page shot. */
async function loadAll(page: Page) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

const IPHONE_26 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const INSTAGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 Instagram 330.0.0.0 Android';

test('celular Android: pôster vertical, aba Android primeiro, entra no app', async ({ page }) => {
  const videos = trackVideos(page);
  await page.goto('/conheca/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Cada série');
  await expect(page.getByRole('tab', { name: 'Android' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#painel-android')).toBeVisible();
  await expect(page.locator('#painel-iphone')).toBeHidden();
  await expect(page.locator('[data-inapp]')).toBeHidden();
  await expectPoster(page, false);
  await shot(page, 'l1-conheca-celular');
  await loadAll(page);
  await shot(page, 'l2-conheca-celular-inteira', true);

  // Keyboard: arrows move between tabs.
  await page.getByRole('tab', { name: 'Android' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'iPhone' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#painel-iphone')).toBeVisible();

  // FAQ opens; the button goes to the app's sign-in.
  await page.getByText('Instalei e sumiram meus dados').click();
  await expect(page.getByText(/Entre com o mesmo e-mail e tudo volta da nuvem/)).toBeVisible();
  await page.getByRole('link', { name: 'Abrir o Anilha' }).first().click();
  await page.waitForURL(/\/entrar/);
  await expect(page.getByRole('heading', { name: 'Entrar no Anilha' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Como funciona, como instalar e dúvidas/ }),
  ).toBeVisible();
  expect(videos).toEqual([]);
});

test('iPhone com iOS 26: aba iPhone e os passos do iOS 26 primeiro', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    userAgent: IPHONE_26,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto('/conheca/');
  await expect(page.getByRole('tab', { name: 'iPhone' })).toHaveAttribute('aria-selected', 'true');
  const first = page.locator('.ios-versions > .ios').first();
  await expect(first).toHaveAttribute('data-ios', '26');
  await expect(first).toContainText('Abrir como app web');
  await page.locator('#instalar').scrollIntoViewIfNeeded();
  await shot(page, 'l3-conheca-iphone-instalar');
  await context.close();
});

test('dentro do Instagram: avisa que não instala e oferece abrir no Chrome', async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    userAgent: INSTAGRAM_ANDROID,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto('/conheca/');
  const warn = page.locator('[data-inapp]');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('dentro de outro app');
  await expect(page.locator('[data-open-chrome]')).toHaveAttribute(
    'href',
    /^intent:\/\/.*package=com\.android\.chrome/,
  );
  await warn.scrollIntoViewIfNeeded();
  await shot(page, 'l4-conheca-instagram');
  await context.close();
});

test('computador: pôster horizontal e aba Computador', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const videos = trackVideos(page);
  await page.goto('/conheca/');
  await expectPoster(page, true);
  await expect(page.getByRole('tab', { name: 'Computador' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await shot(page, 'l5-conheca-computador');
  await loadAll(page);
  await shot(page, 'l6-conheca-computador-inteira', true);
  expect(videos).toEqual([]);
  await context.close();
});

test('pôster muda aos 768 px, mesmo sem JavaScript, sem pedir MP4', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 767, height: 900 },
  });
  const page = await context.newPage();
  const videos = trackVideos(page);
  await page.goto('/conheca/');
  await expectPoster(page, false);
  await page.setViewportSize({ width: 768, height: 900 });
  await expectPoster(page, true);
  await page.setViewportSize({ width: 767, height: 900 });
  await expectPoster(page, false);
  expect(videos).toEqual([]);
  await context.close();
});

test('manual passo a passo: mandar e receber ficha, e as dúvidas novas', async ({ page }) => {
  await page.goto('/conheca/#manual');
  await expect(page.getByRole('heading', { name: 'Manual passo a passo' })).toBeVisible();
  const send = page.locator('#mandar-ficha');
  await send.scrollIntoViewIfNeeded();
  await expect(
    send.getByRole('heading', { name: '9. Mande uma ficha para um amigo' }),
  ).toBeVisible();
  await expect(send).toContainText('Enviar para um amigo');
  const receive = page.locator('#receber-ficha');
  await receive.scrollIntoViewIfNeeded();
  await expect(receive.getByRole('heading', { name: '10. Receba uma ficha' })).toBeVisible();
  // Both screens are real images that load.
  for (const step of [send, receive]) {
    const loaded = await step
      .locator('img')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(loaded).toBe(true);
  }
  const ready = page.locator('#fichas-prontas');
  await ready.scrollIntoViewIfNeeded();
  await expect(
    ready.getByRole('heading', { name: '11. Comece por uma ficha pronta' }),
  ).toBeVisible();
  await shot(page, 'l5-manual-fichas');

  for (const question of [
    'Como mando uma ficha para um amigo?',
    'Meu personal pode mandar meu treino pelo app?',
    'Onde mando uma sugestão ou aviso de um problema?',
    'O app guarda meu peso e minhas dores?',
    'O Anilha usa cookies?',
  ]) {
    await page.getByText(question).click();
  }
  await expect(page.getByText(/o plano dela não muda sem ela aceitar/)).toBeVisible();
  await expect(page.getByText(/Em Você, Fale com o Anilha/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Política de privacidade' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
