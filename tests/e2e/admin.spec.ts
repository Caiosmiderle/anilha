/**
 * Management panel: hidden from everyone but the admin; the admin sees the numbers and
 * the people, answers a request about personal data, and the person reads the answer in
 * the app and in the inbox.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { API, login, onboard, shot, uniqueEmail } from './helpers';

async function phone(browser: Browser, width = 390, height = 844): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: width < 768,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const page = await ctx.newPage();
  // Stable screenshots: sheets open without the animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
}

test('painel: a pessoa pede, o admin responde e a resposta chega no app', async ({ browser }) => {
  // A person writes a request about personal data.
  const ana = await phone(browser);
  const anaEmail = uniqueEmail('ana');
  await login(ana, anaEmail);
  await onboard(ana, 'Ana', { gym: 2, run: 0 });
  await ana.goto('/mensagens');
  await ana.getByLabel('Assunto').selectOption('dados');
  await ana.getByLabel('Pedido').selectOption('acesso');
  await ana
    .getByRole('textbox', { name: 'Mensagem' })
    .fill('Quero saber quais dados vocês guardam sobre mim.');
  await ana.getByRole('button', { name: 'Enviar' }).click();
  await expect(ana.getByText('Mensagem enviada')).toBeVisible();

  // Not an admin: no link in Você, and the panel says so.
  await ana.goto('/voce');
  await expect(ana.getByRole('link', { name: /Fale com o Anilha/ })).toBeVisible();
  await expect(ana.getByRole('link', { name: /Painel de gestão/ })).toHaveCount(0);
  await ana.goto('/admin');
  await expect(ana.getByRole('heading', { name: 'Sem acesso' })).toBeVisible();

  // The admin.
  const dono = await phone(browser);
  const donoEmail = uniqueEmail('dono');
  await login(dono, donoEmail);
  await onboard(dono, 'Caio', { gym: 3, run: 1 });
  const made = await dono.request.get(`${API}/dev/admin?email=${encodeURIComponent(donoEmail)}`);
  expect(made.ok()).toBe(true);
  await dono.goto('/voce');
  await dono.getByRole('link', { name: /Painel de gestão/ }).click();
  await dono.waitForURL('/admin');
  await expect(dono.getByRole('heading', { name: 'Painel' })).toBeVisible();
  await expect(dono.getByText(/pedidos? sobre dados abertos?/)).toBeVisible();
  await expect(dono.getByText(/vence em 1[45] dias/)).toBeVisible();
  await shot(dono, '97-painel-geral', true);

  // People: Ana is there, new, with her e-mail; nothing about health.
  await dono.getByRole('button', { name: 'Pessoas', exact: true }).click();
  const person = dono.getByTestId('admin-person').filter({ hasText: anaEmail });
  await expect(person).toContainText('Novo');
  await person.click();
  const sheet = dono.getByRole('dialog');
  await expect(sheet.getByText('Atividade nas últimas 12 semanas')).toBeVisible();
  await expect(sheet.getByText('Dados de saúde')).toBeVisible();
  await shot(dono, '98-painel-pessoa');
  await sheet.getByRole('button', { name: 'Fechar' }).click();

  // Messages: the request with its deadline; answer it.
  await dono.getByRole('button', { name: 'Mensagens', exact: true }).click();
  const ticket = dono
    .getByTestId('admin-ticket')
    .filter({ hasText: 'Quero saber quais dados vocês guardam sobre mim.' });
  await expect(ticket).toContainText('Pedido sobre dados pessoais');
  await ticket
    .getByRole('textbox', { name: 'Resposta' })
    .fill('Oi, Ana. Em Você, Seus dados, o JSON traz tudo o que guardamos.');
  await shot(dono, '99-painel-mensagens');
  await ticket.getByRole('button', { name: 'Enviar resposta' }).click();
  await expect(dono.getByText('Resposta enviada')).toBeVisible();
  // Answered: it leaves the open list and shows under Respondidas.
  await expect(ticket).toHaveCount(0);
  await dono.getByRole('button', { name: 'Respondidas', exact: true }).click();
  await expect(ticket).toContainText('Respondida');

  // Ana: the bell tells, the answer is in the messages.
  await ana.goto('/avisos');
  const item = ana.getByRole('link', { name: /O Anilha respondeu sua mensagem/ });
  await expect(item).toBeVisible();
  await item.click();
  await ana.waitForURL('/mensagens');
  const mine = ana.getByTestId('ticket').first();
  await expect(mine).toContainText('Respondida');
  await expect(mine).toContainText('o JSON traz tudo o que guardamos');

  await ana.context().close();
  await dono.context().close();
});

test('painel no computador: números em três colunas', async ({ browser }) => {
  const page = await phone(browser, 1440, 900);
  const email = uniqueEmail('dono-pc');
  await login(page, email);
  await onboard(page, 'Caio', { gym: 3, run: 1 });
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
  await expect(page.getByText('Ativos em 7 dias')).toBeVisible();
  await expect(page.getByText('Criaram conta')).toBeVisible();
  const columns = await page
    .locator('.kpi-grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(3);
  await shot(page, '100-painel-computador', true);
  await page.context().close();
});
