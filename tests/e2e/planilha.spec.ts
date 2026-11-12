/**
 * Fichas as a spreadsheet: all treinos in use from Plano, Treinos and from Você, Seus dados
 * (one tab each), or one ficha from its screen. On a computer the file downloads; on the
 * iPhone it goes to the share menu, where "Salvar em Arquivos" is. When the menu turns the
 * spreadsheet type down, a generic type goes; when it takes nothing, the file opens in the
 * system preview, which has its own share button.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { unzipStore } from '../../src/lib/zip';
import { login, onboard, shot, uniqueEmail } from './helpers';

const dec = new TextDecoder();
const text = (files: Map<string, Uint8Array>, name: string) => dec.decode(files.get(name));
/** The texts of the shared string table, in order. */
const strings = (files: Map<string, Uint8Array>) =>
  [...text(files, 'xl/sharedStrings.xml').matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map(
    (m) => m[1],
  );

test('exportar as fichas numa planilha, todas ou uma', async ({ page }) => {
  await login(page, uniqueEmail('planilha'));
  await onboard(page, 'Rui', { gym: 3, run: 0 });
  await page.goto('/plano?aba=treinos');
  const all = page.getByRole('button', { name: 'Exportar planilha' });
  await expect(all).toBeVisible();
  await shot(page, '189-exportar-planilha', true);

  let download = page.waitForEvent('download');
  await all.click();
  let file = await download;
  expect(file.suggestedFilename()).toMatch(/^anilha-fichas-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const bytes = readFileSync(await file.path());
  // A copy to open in Excel, Numbers or Google Sheets.
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/fichas-exemplo.xlsx', bytes);
  let parts = unzipStore(new Uint8Array(bytes));
  const workbook = text(parts, 'xl/workbook.xml');
  const tabs = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  expect(tabs).toHaveLength(3);
  expect(tabs[0]).toBe('Ficha A Peito e tríceps');
  expect(strings(parts)).toEqual(
    expect.arrayContaining(['Ficha A: Peito e tríceps', 'Semana 4', 'Supino reto com barra']),
  );
  expect(text(parts, 'xl/worksheets/sheet1.xml')).not.toContain('inlineStr');
  await expect(page.getByText('Planilha baixada')).toBeVisible();

  // One ficha, from its screen.
  await page
    .getByRole('link', { name: /Ficha A: Peito e tríceps/ })
    .first()
    .click();
  await page.waitForURL(/\/plano\/rotina\//);
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar planilha' }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe('anilha-ficha-a-peito-e-triceps.xlsx');
  parts = unzipStore(new Uint8Array(readFileSync(await file.path())));
  expect(text(parts, 'xl/workbook.xml').match(/<sheet /g)).toHaveLength(1);

  // And with the other exports, in Você, Seus dados.
  await page.goto('/voce/dados');
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar fichas (planilha)' }).click();
  file = await download;
  expect(file.suggestedFilename()).toMatch(/^anilha-fichas-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

/** An iPhone whose share menu takes only the types in `accepts`; records what it gets. */
async function iphone(page: Page, accepts: string[] | 'all') {
  await page.addInitScript((acc) => {
    const w = window as unknown as { shared: string[]; opened: string[] };
    w.shared = [];
    w.opened = [];
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data: { files?: File[] }) =>
        acc === 'all' || (data.files ?? []).every((f) => (acc as string[]).includes(f.type)),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { files?: File[] }) => {
        for (const f of data.files ?? []) w.shared.push(`${f.name} ${f.type || '(sem tipo)'}`);
      },
    });
    window.open = ((url?: string | URL) => {
      w.opened.push(String(url));
      return window;
    }) as typeof window.open;
  }, accepts);
  await login(page, uniqueEmail('planilhaios'));
  await onboard(page, 'Bia', { gym: 3, run: 0 });
  await page.goto('/plano?aba=treinos');
  await page.getByRole('button', { name: 'Exportar planilha' }).click();
}

const got = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { shared: string[]; opened: string[] };
    return { shared: w.shared, opened: w.opened };
  });

test('no iPhone a planilha vai para o menu de compartilhar', async ({ page }) => {
  await iphone(page, 'all');
  await expect
    .poll(() => got(page))
    .toEqual({
      shared: [
        expect.stringMatching(
          /^anilha-fichas-\d{4}-\d{2}-\d{2}\.xlsx application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/,
        ),
      ],
      opened: [],
    });
});

test('menu que recusa o tipo da planilha: vai como arquivo genérico', async ({ page }) => {
  await iphone(page, ['image/png', 'application/octet-stream']);
  await expect
    .poll(() => got(page))
    .toEqual({
      shared: [expect.stringMatching(/\.xlsx application\/octet-stream$/)],
      opened: [],
    });
});

test('menu que recusa qualquer arquivo: abre na prévia do sistema', async ({ page }) => {
  await iphone(page, []);
  await expect
    .poll(() => got(page))
    .toEqual({ shared: [], opened: [expect.stringMatching(/^blob:/)] });
  await expect(
    page.getByText('Planilha aberta: toque em Compartilhar para salvar em Arquivos'),
  ).toBeVisible();
});
