/**
 * Computer menu at the side (room for new areas), the inbox in a panel under the bell with
 * "Marcar tudo como lido", and the person at the bottom: profile, settings, the site, sign
 * out. On the phone: the inbox page with the same button, and Você with sign out on top.
 */
import { expect, test, type Page } from '@playwright/test';
import { API, login, onboard, shot, synced, uniqueEmail } from './helpers';

/** An account with news in its bell: it becomes admin and posts two notices to everyone. */
async function withNews(page: Page, name: string, email: string) {
  await login(page, email);
  await onboard(page, name, { gym: 3, run: 0 });
  await synced(page);
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`);
  await page.goto('/admin?aba=conteudo');
  const news = page.getByRole('region', { name: 'Avisos do Anilha' });
  for (const title of [`Primeiro aviso de ${name}`, `Segundo aviso de ${name}`]) {
    await news.getByLabel('Título').fill(title);
    await news.getByRole('textbox', { name: 'Texto' }).fill('Só para conferir a leitura.');
    await news.getByRole('button', { name: 'Publicar aviso' }).click();
    // Two notices in a row can leave two toasts on screen.
    await expect(page.getByText('Aviso publicado').first()).toBeVisible();
  }
}

test.describe('computador', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('menu ao lado, avisos num painel e a conta embaixo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await withNews(page, 'Iara', uniqueEmail('menu'));
    await page.goto('/');

    const menu = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(menu.getByRole('link')).toHaveText([
      'Hoje',
      'Plano',
      'Histórico',
      'Amigos',
      'Painel',
    ]);

    // The bell opens a panel; the page stays where it is.
    const bell = page.getByTestId('inbox-bell').filter({ visible: true });
    await expect(bell).toHaveAccessibleName(/^Avisos, \d+ novos?$/);
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Avisos' });
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      panel.locator('[data-unread="true"]').filter({ hasText: 'Primeiro aviso de Iara' }),
    ).toBeVisible();
    await shot(page, '121-painel-avisos');
    await panel.getByRole('button', { name: 'Marcar tudo como lido' }).click();
    await expect(bell).toHaveAccessibleName('Avisos');
    await expect(panel.locator('[data-unread="true"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    // The account at the bottom: profile, settings, the site and sign out.
    await page.getByRole('button', { name: /^Sua conta: Iara/ }).click();
    const account = page.getByRole('menu', { name: 'Sua conta' });
    await expect(account.getByRole('menuitem')).toHaveText([
      /Ver perfil/,
      'Ajustes',
      'Página do Anilha',
      'Sair',
    ]);
    await shot(page, '122-menu-conta');
    await account.getByRole('menuitem', { name: /Ver perfil/ }).click();
    await page.waitForURL('**/voce');
    await expect(page.getByRole('heading', { name: 'Iara', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /^Sua conta: Iara/ }).click();
    await page
      .getByRole('menu', { name: 'Sua conta' })
      .getByRole('menuitem', { name: 'Sair' })
      .click();
    await page.waitForURL('**/entrar');
  });
});

test('celular: avisos novos marcados, ler um a um ou tudo; Sair no topo de Você', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withNews(page, 'Ravi', uniqueEmail('lidos'));
  await page.goto('/avisos');
  const first = page.locator('[data-unread="true"]').filter({ hasText: 'Primeiro aviso de Ravi' });
  await expect(first).toBeVisible();
  // Touching one reads it; the other stays new.
  await first.click();
  await expect(
    page.locator('.inbox-row').filter({ hasText: 'Primeiro aviso de Ravi' }),
  ).not.toHaveAttribute('data-unread', 'true');
  await expect(
    page.locator('[data-unread="true"]').filter({ hasText: 'Segundo aviso de Ravi' }),
  ).toBeVisible();
  await shot(page, '123-avisos-celular');
  await page.getByRole('button', { name: 'Marcar tudo como lido' }).click();
  await expect(page.locator('[data-unread="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar tudo como lido' })).toHaveCount(0);

  await page.goto('/voce');
  await expect(page.getByRole('heading', { name: 'Ravi', level: 1 })).toBeVisible();
  await shot(page, '124-voce-topo');
  await shot(page, '125-voce-inteiro', true);
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL('**/entrar');
});
