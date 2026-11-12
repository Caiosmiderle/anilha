/**
 * "Como fazer": a small button on the exercise card opens a sheet with the movement, tips
 * and common errors. Closing it leaves the workout where it was, rest timer included. No
 * video on the set screen; the YouTube player loads only after the tap, and only for a
 * curated video. The image is what teaches: only an exercise without one gets a search on
 * YouTube. Offline, the tips alone.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Monday 19/10/2026: a gym day of the plan.
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
});

async function startWorkout(page: Page, name: string) {
  await login(page, uniqueEmail('comofazer'));
  await onboard(page, name, { gym: 3, run: 0 });
  await page.getByRole('button', { name: 'Iniciar treino' }).click();
  await page.waitForURL(/\/treino\//);
}

test('dicas e erros comuns, e fechar volta ao treino com o descanso correndo', async ({ page }) => {
  await startWorkout(page, 'Caio');
  const first = page.getByTestId('item-card').first();
  const name = (await first.getAttribute('aria-label')) as string;

  // A set done: the rest starts.
  const editor = page.getByTestId('set-editor');
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('20');
  await editor.getByLabel('Repetições', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
  const rest = page.getByTestId('rest-timer');
  await expect(rest).toBeVisible();
  const before = (await rest.locator('.hb-rest-time').innerText()).trim();

  // Nothing from YouTube on the set screen.
  await expect(page.locator('iframe')).toHaveCount(0);

  await first.getByRole('button', { name: `Como fazer ${name.toLowerCase()}` }).click();
  const sheet = page.getByRole('dialog');
  await expect(
    sheet.getByRole('heading', { name: `Como fazer: ${name.toLowerCase()}` }),
  ).toBeVisible();
  const tips = sheet.getByRole('region', { name: 'Dicas' }).getByRole('listitem');
  expect(await tips.count()).toBeGreaterThanOrEqual(3);
  expect(await tips.count()).toBeLessThanOrEqual(4);
  const errors = sheet.getByRole('region', { name: 'Erros comuns' }).getByRole('listitem');
  expect(await errors.count()).toBeGreaterThanOrEqual(1);
  expect(await errors.count()).toBeLessThanOrEqual(2);
  // The image is enough: no search on YouTube and no player.
  await expect(sheet.getByRole('link', { name: 'Buscar no YouTube' })).toHaveCount(0);
  await expect(sheet.locator('iframe')).toHaveCount(0);
  // The two positions of the movement, from our own storage (reduced motion: side by side).
  const frames = sheet.locator('.howto-frames img');
  await expect(frames).toHaveCount(2);
  for (const src of await frames.evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src'))))
    expect(src).toMatch(
      /^https:\/\/ssuuvzgqtobnfvobvjcu\.supabase\.co\/storage\/v1\/object\/public\/midia-exercicios\//,
    );
  await expect
    .poll(() =>
      frames.evaluateAll((imgs) =>
        imgs.every(
          (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  await shot(page, '160-como-fazer');

  // Time passes with the sheet open; closing keeps the rest going.
  await page.clock.runFor(10_000);
  await sheet.getByRole('button', { name: 'Fechar' }).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rest).toBeVisible();
  await expect(rest.locator('.hb-rest-time')).not.toHaveText(before);
  await expect(page.getByRole('region', { name: 'Série atual' })).toBeVisible();
});

test('sem imagem: busca no YouTube; sem internet, só as dicas', async ({ page, context }) => {
  await login(page, uniqueEmail('semimagem'));
  // Every exercise has an image now: the test content takes the triceps one away.
  await page.evaluate(() =>
    localStorage.setItem(
      'anilha:conteudo-de-teste',
      JSON.stringify({
        midia: {
          'triceps-corda': { frames: [], fonte: '', autor: '', licenca: '', licencaUrl: '' },
        },
      }),
    ),
  );
  await onboard(page, 'Lia', { gym: 3, run: 0 });
  await page.goto('/exercicios/triceps-corda');
  await page.getByRole('button', { name: 'Como fazer' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('region', { name: 'Dicas' })).toBeVisible();
  await expect(sheet.getByRole('img')).toHaveCount(0);
  const search = sheet.getByRole('link', { name: 'Buscar no YouTube' });
  await expect(search).toHaveAttribute(
    'href',
    /^https:\/\/www\.youtube\.com\/results\?search_query=/,
  );
  await expect(search).toHaveAttribute('target', '_blank');

  await context.setOffline(true);
  await expect(sheet.getByText('Sem internet: por enquanto, só as dicas.')).toBeVisible();
  await expect(search).toHaveCount(0);
  await shot(page, '161-como-fazer-offline');
  await context.setOffline(false);
  // Back online, the search shows up without reopening.
  await expect(search).toBeVisible();
});

test('vídeo escolhido: fachada primeiro, o player do youtube-nocookie só depois do toque', async ({
  page,
}) => {
  const youtube: string[] = [];
  await page.route(/youtube/, (route) => {
    youtube.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<p>player</p>' });
  });
  await login(page, uniqueEmail('video'));
  // Test-only id, never in the content: the content takes only ids Caio gives.
  await page.evaluate(() =>
    localStorage.setItem(
      'anilha:conteudo-de-teste',
      JSON.stringify({ videos: { 'supino-reto-barra': 'abcdefghijk' } }),
    ),
  );
  await onboard(page, 'Rui', { gym: 3, run: 0 });
  await page.getByRole('button', { name: 'Iniciar treino' }).click();
  await page.waitForURL(/\/treino\//);
  await page.getByRole('button', { name: 'Como fazer supino reto com barra' }).click();
  const sheet = page.getByRole('dialog');
  const facade = sheet.getByRole('button', { name: /^Ver vídeo/ });
  await expect(facade).toBeVisible();
  await expect(sheet.locator('iframe')).toHaveCount(0);
  await expect(sheet.getByRole('link', { name: 'Buscar no YouTube' })).toHaveCount(0);
  expect(youtube).toEqual([]);
  await shot(page, '162-como-fazer-fachada');

  await facade.click();
  const frame = sheet.locator('iframe');
  await expect(frame).toHaveAttribute(
    'src',
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk\?/,
  );
  await expect.poll(() => youtube.length).toBeGreaterThan(0);
  expect(youtube.every((u) => u.startsWith('https://www.youtube-nocookie.com/'))).toBe(true);
});

test('na biblioteca: o mesmo Como fazer, e o nível do exercício', async ({ page }) => {
  await login(page, uniqueEmail('biblioteca'));
  await onboard(page, 'Téo', { gym: 3, run: 0 });
  await page.goto('/exercicios/barra-fixa');
  await expect(page.getByRole('heading', { name: 'Barra fixa', level: 1 })).toBeVisible();
  await expect(page.getByText('Avançado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Como fazer' }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: 'Dicas' })).toContainText(
    'Suba até o queixo passar da barra.',
  );
});

test('mídia do movimento em loop, do nosso armazenamento, com o crédito embaixo', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const base = 'https://ssuuvzgqtobnfvobvjcu.supabase.co/storage/v1/object/public/midia-exercicios';
  const icon = await (await page.request.get('/icon-512.png')).body();
  await page.route(`${base}/**`, (route) =>
    route.fulfill({ contentType: 'image/png', body: icon }),
  );
  await login(page, uniqueEmail('midia'));
  await page.evaluate(
    (b) =>
      localStorage.setItem(
        'anilha:conteudo-de-teste',
        JSON.stringify({
          midia: {
            'supino-reto-barra': {
              frames: [`${b}/teste/inicio.png`, `${b}/teste/fim.png`],
              fonte: 'Fonte de teste',
              autor: 'Autor de teste',
              licenca: 'Licença de teste',
              licencaUrl: 'https://exemplo.dev/licenca',
            },
          },
        }),
      ),
    base,
  );
  await onboard(page, 'Ana', { gym: 3, run: 0 });
  await page.getByRole('button', { name: 'Iniciar treino' }).click();
  await page.waitForURL(/\/treino\//);
  await page.getByRole('button', { name: 'Como fazer supino reto com barra' }).click();
  const sheet = page.getByRole('dialog');
  const loop = sheet.getByRole('img', { name: /^Movimento de supino reto com barra/ });
  await expect(loop).toBeVisible();
  // The two positions take turns.
  const on = loop.locator('img[data-on="true"]');
  await expect(on).toHaveCount(1);
  const first = await on.getAttribute('src');
  await page.clock.runFor(1_200);
  await expect(on).not.toHaveAttribute('src', first as string);
  await expect(sheet.getByText('Imagem: Fonte de teste.', { exact: false })).toBeVisible();
  // The sheet slides in with motion on: the picture after it settles.
  await page.waitForTimeout(500);
  await shot(page, '163-como-fazer-midia');
});

test('créditos: a fonte das imagens com a atribuição que a licença pede', async ({ page }) => {
  await login(page, uniqueEmail('creditos'));
  await onboard(page, 'Lu', { gym: 3, run: 0 });
  await page.goto('/voce');
  await page.getByRole('link', { name: /^Créditos e licenças/ }).click();
  await page.waitForURL('**/voce/creditos');
  const attribution = page.getByRole('link', { name: 'Exercise data by RepDB (repdb.co)' });
  await expect(attribution).toHaveAttribute('href', 'https://repdb.co');
  await expect(page.getByRole('link', { name: 'RepDB Free Tier License v1.0' })).toHaveAttribute(
    'href',
    'https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md',
  );
  await expect(page.getByText(/89 exercícios/)).toBeVisible();
  // As três imagens feitas pelo Anilha, em 3D, para o que o RepDB não tem.
  await expect(
    page.getByText(/Imagens feitas em 3D pela equipe do Anilha\. Termos de uso\. 3 exercícios/),
  ).toBeVisible();
  await shot(page, '164-creditos', true);
});

test('imagem própria: tríceps na corda com as duas posições, do próprio app', async ({ page }) => {
  await login(page, uniqueEmail('imgpropria'));
  await onboard(page, 'Rui', { gym: 3, run: 0 });
  await page.goto('/exercicios/triceps-corda');
  await page.getByRole('button', { name: 'Como fazer' }).click();
  const frames = page.getByRole('dialog').locator('.howto-frames img');
  await expect(frames).toHaveCount(2);
  const srcs = await frames.evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')));
  expect(srcs).toEqual(['/midia/triceps-corda/inicio.webp', '/midia/triceps-corda/fim.webp']);
  await expect
    .poll(() =>
      frames.evaluateAll((imgs) =>
        imgs.every(
          (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 512,
        ),
      ),
    )
    .toBe(true);
  await shot(page, '165-como-fazer-imagem-propria');
});
