/**
 * Team content: the library of ready-made fichas (four to start; adding one makes it a
 * routine of yours) and the panel's Conteúdo tab, where the admin publishes news for
 * everyone's inbox and new ready-made fichas.
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

test('fichas prontas: ver os exercícios e adicionar às suas fichas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('prontas'));
  await onboard(page, 'Rita', { gym: 3, run: 0 });

  await page.goto('/plano?aba=treinos');
  await page.getByRole('button', { name: 'Fichas prontas' }).click();
  await page.waitForURL('/plano/fichas-prontas');
  await expect(page.getByRole('heading', { level: 1, name: 'Fichas prontas' })).toBeVisible();
  for (const name of [
    'Corpo inteiro para começar',
    'Treino de 30 minutos',
    'Em casa com halteres',
    'Glúteo e posterior',
  ])
    await expect(page.getByRole('heading', { name })).toBeVisible();
  await shot(page, '105-fichas-prontas', true);

  const quick = page.getByTestId('ready-routine').filter({ hasText: 'bi-sets' });
  await quick.getByRole('button', { name: 'Ver exercícios' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByTestId('shared-items').locator('li')).toHaveCount(5);
  await expect(sheet.getByTestId('shared-items')).toContainText('bi-set');
  await expect(sheet.getByTestId('shared-items')).toContainText('Prancha');
  await shot(page, '106-ficha-pronta');
  await sheet.getByRole('button', { name: 'Adicionar às minhas fichas' }).click();
  await page.waitForURL(/\/plano\/rotina\/pronta-/);
  await expect(page.getByRole('heading', { level: 1, name: 'Treino de 30 minutos' })).toBeVisible();

  await page.goto('/plano/fichas-prontas');
  await expect(quick.getByText('Nas suas fichas')).toBeVisible();
  await page.goto('/plano?aba=treinos');
  await expect(page.getByRole('link', { name: /Treino de 30 minutos/ })).toBeVisible();
});

test('painel: aviso no sino de todos e ficha pronta nova, com a conta de adições', async ({
  browser,
}) => {
  // The person's account exists before the news (new accounts see only what comes after).
  const lia = await phone(browser);
  await login(lia, uniqueEmail('lia-aviso'));
  await onboard(lia, 'Lia', { gym: 2, run: 0 });

  const dono = await phone(browser);
  const donoEmail = uniqueEmail('dono-conteudo');
  await login(dono, donoEmail);
  await onboard(dono, 'Caio', { gym: 3, run: 0 });
  await synced(dono);
  await dono.request.get(`${API}/dev/admin?email=${encodeURIComponent(donoEmail)}`);

  await dono.goto('/admin?aba=conteudo');
  const news = dono.getByRole('region', { name: 'Avisos do Anilha' });
  await news.getByLabel('Título').fill('Chegaram as fichas prontas');
  await news.getByRole('textbox', { name: 'Texto' }).fill('Quatro fichas para começar, em Plano.');
  await news.getByLabel('Ao tocar, abre').selectOption('/plano/fichas-prontas');
  await news.getByRole('button', { name: 'Publicar aviso' }).click();
  await expect(dono.getByText('Aviso publicado')).toBeVisible();
  await expect(news.getByTestId('admin-announcement').first()).toContainText(
    'Chegaram as fichas prontas',
  );

  const lib = dono.getByRole('region', { name: 'Fichas prontas' });
  await lib.getByLabel('Descrição').fill('Peito e tríceps em uns 50 minutos.');
  await lib.getByRole('button', { name: 'Publicar ficha' }).click();
  await expect(dono.getByText('Ficha publicada')).toBeVisible();
  const published = lib.getByTestId('admin-library').filter({ hasText: 'Peito e tríceps' }).first();
  await expect(published).toContainText('adicionada 0 vezes');
  await shot(dono, '107-painel-conteudo', true);

  // Lia: the news in the bell takes her to the library; she adds the new ficha.
  await lia.goto('/avisos');
  const item = lia.getByRole('link', { name: /Chegaram as fichas prontas/ });
  await expect(item).toBeVisible();
  await item.click();
  await lia.waitForURL('/plano/fichas-prontas');
  const fresh = lia.getByTestId('ready-routine').filter({ hasText: 'uns 50 minutos' });
  await fresh.getByRole('button', { name: 'Ver exercícios' }).click();
  await lia.getByRole('dialog').getByRole('button', { name: 'Adicionar às minhas fichas' }).click();
  await lia.waitForURL(/\/plano\/rotina\/pronta-/);

  await dono.reload();
  await expect(
    dono
      .getByRole('region', { name: 'Fichas prontas' })
      .getByTestId('admin-library')
      .filter({ hasText: 'Peito e tríceps' })
      .first(),
  ).toContainText('adicionada 1 vez');

  await lia.context().close();
  await dono.context().close();
});
