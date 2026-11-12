/**
 * The conversation with a friend, made only of fichas: Ana sends one from the thread (no
 * text field anywhere), Bruno sees it there, adds it, and both see what happened.
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
  return ctx.newPage();
}

async function openThread(page: Page, friend: string) {
  await page.goto('/amigos');
  await page.getByRole('link', { name: `Ver ${friend}` }).click();
  await page.getByRole('link', { name: /^Fichas entre vocês/ }).click();
  await page.waitForURL(/\/amigos\/[^/]+\/fichas$/);
}

test('conversa de fichas: mandar, receber, adicionar, sem campo de texto', async ({ browser }) => {
  const a = await phone(browser);
  const b = await phone(browser);
  const ana = uniqueEmail('ana');
  const bruno = uniqueEmail('bruno');
  await login(a, ana);
  await onboard(a, 'Ana', { gym: 3, run: 0 });
  await login(b, bruno);
  await onboard(b, 'Bruno', { gym: 3, run: 0 });
  const made = await a.request.get(
    `${API}/dev/friends?a=${encodeURIComponent(ana)}&b=${encodeURIComponent(bruno)}`,
  );
  expect(made.ok()).toBe(true);
  // Names and plans have to reach the server before the other one looks.
  await synced(a);
  await synced(b);

  // Ana: the thread starts empty; sending is choosing one of her treinos.
  await a.goto('/amigos');
  await a.getByRole('link', { name: 'Ver Bruno Teste' }).click();
  await expect(a.getByRole('link', { name: /^Fichas entre vocês/ })).toContainText(
    'Nenhuma ainda. Mande a primeira.',
  );
  await a.getByRole('link', { name: /^Fichas entre vocês/ }).click();
  await expect(a.getByRole('heading', { name: 'Fichas com Bruno' })).toBeVisible();
  await expect(a.getByText('Nenhuma ficha entre vocês ainda. Mande a primeira.')).toBeVisible();
  await a.getByRole('button', { name: 'Mandar uma ficha' }).click();
  const pick = a.getByRole('dialog');
  await expect(pick.getByRole('textbox')).toHaveCount(0);
  await pick.getByRole('button', { name: /^Ficha A: Peito e tríceps \(6 exercícios\)/ }).click();
  await pick.getByRole('button', { name: 'Mandar', exact: true }).click();
  await expect(a.getByText('Ficha enviada para Bruno')).toBeVisible();
  const mine = a.getByRole('list', { name: 'Fichas entre você e Bruno' }).getByRole('listitem');
  await expect(mine).toHaveCount(1);
  await expect(mine.first()).toContainText('Você mandou');
  await expect(mine.first()).toContainText('Aguardando Bruno');
  // No way to type a message.
  await expect(a.getByRole('textbox')).toHaveCount(0);

  // Bruno: one waiting for him, from the friend page and in the thread.
  await b.goto('/amigos');
  await b.getByRole('link', { name: 'Ver Ana Teste' }).click();
  await expect(b.getByRole('link', { name: /^Fichas entre vocês/ })).toContainText(
    '1 recebida, 0 enviadas. 1 esperando você',
  );
  await b.getByRole('link', { name: /^Fichas entre vocês/ }).click();
  const got = b.getByRole('list', { name: 'Fichas entre você e Ana' }).getByRole('listitem');
  await expect(got.first()).toContainText('Ana mandou');
  await expect(got.first()).toContainText('Esperando você');
  await shot(b, '195-conversa-fichas');
  await got.first().getByRole('button', { name: 'Ver e adicionar' }).click();
  await b.getByRole('dialog').getByRole('button', { name: 'Adicionar às minhas fichas' }).click();
  await b.waitForURL(/\/plano\/rotina\//);
  await openThread(b, 'Ana Teste');
  await expect(got.first()).toContainText('Você adicionou');

  // Ana sees it was added.
  await openThread(a, 'Bruno Teste');
  await expect(mine.first()).toContainText('Bruno adicionou');
  await shot(a, '196-conversa-adicionou');
});
