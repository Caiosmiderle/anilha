/**
 * From the plan to the first workout: Today explains the first one until it is done, and
 * the panel speaks only to who never trained.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { API, login, onboard, shot, synced, uniqueEmail } from './helpers';

async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
}

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

test('Hoje explica o primeiro treino até ele ser feito', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Monday: a gym day of the plan.
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
  await login(page, uniqueEmail('primeiro'));
  await onboard(page, 'Rui', { gym: 3, run: 0 });

  const guide = page.getByTestId('first-steps');
  await expect(page.getByRole('heading', { name: 'Seu primeiro treino' })).toBeVisible();
  await expect(guide).toContainText('Na primeira vez de cada exercício, escolha uma carga');
  await guide.scrollIntoViewIfNeeded();
  await shot(page, '117-primeiro-treino');

  await quickSession(page, '20kg 12 12');
  await page.goto('/');
  // Today drawn with the workout done.
  await expect(page.getByRole('button', { name: /^Segunda, 19\/10: feito: / })).toBeVisible();
  await expect(page.getByTestId('first-steps')).toHaveCount(0);
});

test('aviso para quem nunca treinou chega só a essas pessoas', async ({ browser }) => {
  const nova = await phone(browser);
  await login(nova, uniqueEmail('nunca-treinou'));
  await onboard(nova, 'Nina', { gym: 3, run: 0 });

  const ativa = await phone(browser);
  await login(ativa, uniqueEmail('ja-treinou'));
  await onboard(ativa, 'Ada', { gym: 3, run: 0 });
  await quickSession(ativa, '20kg 12 12');
  await ativa.goto('/');
  await synced(ativa);

  const dono = await phone(browser);
  const donoEmail = uniqueEmail('dono-publico');
  await login(dono, donoEmail);
  await onboard(dono, 'Caio', { gym: 3, run: 0 });
  await synced(dono);
  await dono.request.get(`${API}/dev/admin?email=${encodeURIComponent(donoEmail)}`);

  await dono.goto('/admin?aba=conteudo');
  const news = dono.getByRole('region', { name: 'Avisos do Anilha' });
  await news.getByLabel('Título').fill('Seu primeiro treino te espera');
  await news
    .getByRole('textbox', { name: 'Texto' })
    .fill('Abra Hoje e toque em Iniciar treino: o app explica o resto.');
  await news.getByLabel('Ao tocar, abre').selectOption('/');
  await news
    .getByRole('group', { name: 'Para quem' })
    .getByRole('button', { name: 'Nunca treinaram' })
    .click();
  await expect(news.getByTestId('audience-size')).toHaveText(
    /^\d+ contas? agora\. Quem treinar depois deixa de ver o aviso\.$/,
  );
  await news.getByRole('button', { name: 'Publicar aviso' }).click();
  await expect(dono.getByText('Aviso publicado')).toBeVisible();
  await expect(news.getByTestId('admin-announcement').first()).toContainText(
    'para quem nunca treinou',
  );
  await shot(dono, '118-aviso-publico', true);

  // Nina never trained: the news is in her bell.
  await nova.goto('/avisos');
  // It opens Today, where the first workout is explained.
  await nova.getByRole('link', { name: /Seu primeiro treino te espera/ }).click();
  await nova.waitForURL('/');
  await expect(nova.getByTestId('first-steps')).toBeVisible();

  // Ada already trained: not in hers.
  const loaded = ativa.waitForResponse((r) => r.url().includes('/rpc/inbox'));
  await ativa.goto('/avisos');
  await loaded;
  await expect(ativa.getByRole('heading', { name: 'Avisos', level: 1 })).toBeVisible();
  await expect(ativa.getByText('Seu primeiro treino te espera')).toHaveCount(0);

  for (const p of [nova, ativa, dono]) await p.context().close();
});
