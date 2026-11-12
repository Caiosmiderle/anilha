/**
 * Navigation and gestures: Today in the middle of the tabs, the landing one tap away for
 * who is signed in, and history rows that slide to repeat or delete (still asked).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
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

/** Drags a row sideways from its middle, like a thumb. */
async function slide(page: Page, row: Locator, dx: number) {
  const box = await row.boundingBox();
  if (!box) throw new Error('linha sem caixa');
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 12 });
  await page.mouse.up();
}

/** The same with a finger: touch events through the browser's protocol. */
async function swipeTouch(page: Page, row: Locator, dx: number) {
  const box = await row.boundingBox();
  if (!box) throw new Error('linha sem caixa');
  const y = Math.round(box.y + box.height / 2);
  const x = Math.round(box.x + box.width / 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i += 1)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: Math.round(x + (dx * i) / 12), y }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('Hoje no meio das abas e a página do Anilha a um toque', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('abas'));
  await onboard(page, 'Bel', { gym: 3, run: 0 });
  await expect(page.locator('.hb-tabbar a')).toHaveText([
    'Histórico',
    'Plano',
    'Hoje',
    'Amigos',
    /^Você/,
  ]);
  await page.goto('/voce');
  await page.getByRole('link', { name: /Página do Anilha/ }).click();
  await page.waitForURL('**/conheca/');
  await expect(page.getByRole('heading', { level: 1, name: /Seu treino da semana/ })).toBeVisible();
});

test('arrastar um treino: para a direita repete, para a esquerda apaga depois de confirmar', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('gestos'));
  await onboard(page, 'Gil', { gym: 3, run: 0 });
  await quickSession(page, '30kg 10 10');
  await quickSession(page, '32kg 10 10');

  await page.goto('/historico');
  const rows = page.getByRole('link', { name: /^Ficha A: Peito e tríceps/ });
  await expect(rows).toHaveCount(2);

  // Left: Apagar shows; it still asks before deleting.
  await slide(page, rows.first(), -150);
  const del = page.getByRole('button', { name: 'Apagar', exact: true });
  await expect(del).toBeVisible();
  await shot(page, '120-arrastar-apagar');
  await del.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Apagar este treino?' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Apagar treino' }).click();
  await expect(page.getByText('Treino apagado')).toBeVisible();
  await expect(rows).toHaveCount(1);

  // A tap on the row still opens it; a slide that goes back does not.
  await slide(page, rows.first(), -150);
  await rows.first().click();
  await expect(page).toHaveURL(/\/historico$/);

  // Right: Repetir starts the same workout again.
  await slide(page, rows.first(), 150);
  await page.getByRole('button', { name: 'Repetir', exact: true }).click();
  await page.waitForURL(/\/treino\//);
});

test('com o dedo: arrastar para a esquerda mostra Apagar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('gestotoque'));
  await onboard(page, 'Lu', { gym: 3, run: 0 });
  await quickSession(page, '30kg 10 10');
  await page.goto('/historico');
  const row = page.getByRole('link', { name: /^Ficha A: Peito e tríceps/ }).first();
  await swipeTouch(page, row, -150);
  await expect(page.getByRole('button', { name: 'Apagar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apagar', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Apagar este treino?' }),
  ).toBeVisible();
});

test('barra de vidro: a pílula desliza até a aba tocada, virando lente no caminho', async ({
  page,
}) => {
  await login(page, uniqueEmail('vidro'));
  await onboard(page, 'Lia', { gym: 3, run: 0 });
  await quickSession(page, '30kg 10 10');
  await page.goto('/');
  const bar = page.locator('.hb-tabbar');
  const pill = page.locator('.tab-pill');
  await expect(bar.getByRole('link', { name: 'Hoje' })).toHaveClass(/is-active/);
  await page.waitForTimeout(500);
  await bar.screenshot({ path: 'artifacts/screens/125-barra-parada.png' });
  await shot(page, '126-barra-tela');

  await bar.getByRole('link', { name: 'Plano' }).click();
  await expect(pill).toHaveClass(/is-moving/);
  await page.waitForTimeout(110);
  await bar.screenshot({ path: 'artifacts/screens/127-barra-lente.png' });
  await expect(pill).not.toHaveClass(/is-moving/);
  await expect(bar.getByRole('link', { name: 'Plano' })).toHaveClass(/is-active/);
  await page.waitForTimeout(500);
  await bar.screenshot({ path: 'artifacts/screens/128-barra-plano.png' });

  // A screen inside a tab keeps it lit; one outside all tabs hides the pill.
  await page.goto('/ajustes');
  await expect(page.locator('.hb-tabbar')).toHaveCSS('--tab-index', '4');
  await page.goto('/avisos');
  await expect(page.locator('.tab-pill')).toHaveClass(/is-hidden/);
});

test('arrastar a pílula pela barra: a lente segue o dedo e abre a aba onde soltar', async ({
  page,
}) => {
  await login(page, uniqueEmail('arrastabarra'));
  await onboard(page, 'Téo', { gym: 3, run: 0 });
  await page.goto('/');
  const bar = page.locator('.hb-tabbar');
  const box = await bar.boundingBox();
  if (!box) throw new Error('barra sem caixa');
  const slot = (box.width - 8) / 5;
  const at = (i: number) => box.x + 4 + slot * i + slot / 2;
  const y = box.y + box.height / 2;

  // With the mouse: from Hoje (middle) to Amigos.
  await page.mouse.move(at(2), y);
  await page.mouse.down();
  await page.mouse.move(at(3), y, { steps: 10 });
  await expect(page.locator('.tab-pill')).toHaveClass(/is-dragging/);
  await expect(bar.getByRole('link', { name: 'Amigos' })).toHaveClass(/is-active/);
  await page.mouse.up();
  await page.waitForURL('**/amigos');
  await expect(page.locator('.tab-pill')).not.toHaveClass(/is-dragging/);

  // With a finger: from Amigos to Histórico, a stop in the middle to see the lens.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y) }],
    });
  await touch('touchStart', at(3));
  for (let i = 1; i <= 8; i += 1) await touch('touchMove', at(3) + ((at(1) - at(3)) * i) / 8);
  await bar.screenshot({ path: 'artifacts/screens/129-barra-arrastando.png' });
  for (let i = 1; i <= 6; i += 1) await touch('touchMove', at(1) + ((at(0) - at(1)) * i) / 6);
  await touch('touchEnd', at(0));
  await page.waitForURL('**/historico');
  await cdp.detach();

  // A plain tap still opens the tab.
  await bar.getByRole('link', { name: 'Plano' }).click();
  await page.waitForURL('**/plano');
});
