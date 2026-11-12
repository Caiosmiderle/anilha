/**
 * Image of a finished workout to post, on the workout detail, for everyone. On the phone one
 * button opens the share menu (where the iPhone also saves the image); on a computer the
 * image downloads. The card draws the numbers of the workout on a story-sized image.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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

test('cartão do treino para todos: no computador a imagem baixa, no tamanho de story', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('cartao'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });

  await quickSession(page, '30kg 10 10');
  await quickSession(page, '35kg 10 8');
  await page.getByRole('button', { name: 'Compartilhar treino' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Compartilhar treino' })).toBeVisible();
  const img = sheet.getByRole('img', { name: /^Imagem do treino Ficha A: Peito e tríceps, de / });
  await expect(img).toBeVisible();
  const size = await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]);
  expect(size).toEqual([1080, 1920]);
  // Holding the picture saves it on the iPhone (the rest of the app blocks selection).
  expect(await img.evaluate((el) => getComputedStyle(el).userSelect)).toBe('auto');
  await shot(page, '111-cartao-treino');

  // The card itself, at full size, to look at.
  const dataUrl = await img.getAttribute('src');
  expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  mkdirSync('artifacts/screens', { recursive: true });
  writeFileSync(
    'artifacts/screens/112-cartao-imagem.png',
    Buffer.from((dataUrl as string).split(',')[1] as string, 'base64'),
  );

  // No share menu here (a computer): the PNG downloads.
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Baixar imagem' }).click();
  expect((await download).suggestedFilename()).toMatch(/^anilha-treino-\d{4}-\d{2}-\d{2}\.png$/);
});

test('no celular: um botão só abre o menu, onde fica Salvar imagem', async ({ page }) => {
  // A phone with a share menu: what it receives is recorded.
  await page.addInitScript(() => {
    const w = window as unknown as { shared: string[] };
    w.shared = [];
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { files?: File[] }) => {
        for (const f of data.files ?? []) w.shared.push(`${f.name} ${f.type} ${f.size > 1000}`);
      },
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('cartaocel'));
  await onboard(page, 'Bia', { gym: 3, run: 0 });
  await quickSession(page, '20kg 12 12');
  await page.getByRole('button', { name: 'Compartilhar treino' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'Baixar imagem' })).toHaveCount(0);
  await expect(sheet.getByText(/Salvar imagem fica nesse menu/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Compartilhar ou salvar' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { shared: string[] }).shared))
    .toEqual([expect.stringMatching(/^anilha-treino-\d{4}-\d{2}-\d{2}\.png image\/png true$/)]);
});
