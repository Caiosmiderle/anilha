/**
 * Sending a ficha: a friend sends one of their routines, the other sees it in the inbox,
 * looks at the exercises and adds it to their own fichas; the sender is told. From the
 * panel, the team sends to anyone, signed "Anilha", and the person can decline.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { API, login, onboard, shot, synced, uniqueEmail } from './helpers';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

test('amigo manda uma ficha; o outro vê os exercícios e adiciona às fichas dele', async ({
  browser,
}) => {
  const lia = await phone(browser);
  const liaEmail = uniqueEmail('lia-ficha');
  await login(lia, liaEmail);
  await onboard(lia, 'Lia', { gym: 3, run: 0 });
  await synced(lia);

  const teo = await phone(browser);
  const teoEmail = uniqueEmail('teo-ficha');
  await login(teo, teoEmail);
  await onboard(teo, 'Teo', { gym: 2, run: 0 });
  await synced(teo);

  const made = await lia.request.get(
    `${API}/dev/friends?a=${encodeURIComponent(liaEmail)}&b=${encodeURIComponent(teoEmail)}`,
  );
  expect(made.ok()).toBe(true);

  // Lia opens one of her routines and sends it.
  await lia.goto('/plano');
  await lia
    .getByRole('link', { name: /Peito e tríceps/ })
    .first()
    .click();
  await lia.waitForURL(/\/plano\/rotina\//);
  const sendButton = lia.getByRole('button', { name: 'Enviar para um amigo' });
  await expect(sendButton).toBeVisible();
  const name = (await lia.getByRole('heading', { level: 1 }).innerText()).trim();
  await sendButton.click();
  const send = lia.getByRole('dialog');
  await send.getByRole('button', { name: 'Teo' }).click();
  await send.getByLabel('Recado (opcional)').fill('Faz duas vezes na semana.');
  await shot(lia, '101-enviar-ficha');
  await send.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(lia.getByText('Ficha enviada para Teo')).toBeVisible();

  // Teo: the bell, the exercises, add.
  await teo.goto('/avisos');
  const row = teo.getByRole('button', {
    name: new RegExp(`Lia Teste te mandou uma ficha: ${escape(name)}`),
  });
  await expect(row).toBeVisible();
  await row.click();
  const preview = teo.getByRole('dialog');
  await expect(preview.getByText('Faz duas vezes na semana.')).toBeVisible();
  await expect(preview.getByTestId('shared-items').locator('li').first()).toContainText('séries');
  await shot(teo, '102-ficha-recebida');
  await preview.getByRole('button', { name: 'Adicionar às minhas fichas' }).click();
  await teo.waitForURL(/\/plano\/rotina\/recebida-/);
  await expect(teo.getByRole('heading', { level: 1, name })).toBeVisible();
  // A received ficha is his own: Plano, Treinos.
  await teo.goto('/plano?aba=treinos');
  await expect(teo.getByRole('link', { name: new RegExp(escape(name)) })).toBeVisible();

  // Lia is told.
  await lia.goto('/avisos');
  await expect(lia.getByText(`Teo Teste adicionou sua ficha ${name}`)).toBeVisible();

  await lia.context().close();
  await teo.context().close();
});

test('o admin manda uma ficha pelo painel para quem não é amigo; a pessoa pode recusar', async ({
  browser,
}) => {
  const dono = await phone(browser);
  const donoEmail = uniqueEmail('dono-ficha');
  await login(dono, donoEmail);
  await onboard(dono, 'Caio', { gym: 3, run: 0 });
  await dono.request.get(`${API}/dev/admin?email=${encodeURIComponent(donoEmail)}`);

  const ana = await phone(browser);
  const anaEmail = uniqueEmail('ana-ficha');
  await login(ana, anaEmail);
  await onboard(ana, 'Ana', { gym: 2, run: 0 });
  await synced(ana);

  await dono.goto('/admin?aba=pessoas');
  await dono.getByTestId('admin-person').filter({ hasText: anaEmail }).click();
  const sheet = dono.getByRole('dialog');
  const team = sheet.getByRole('region', { name: 'Mandar uma ficha' });
  await team.getByLabel('Recado (opcional)').fill('Para a sua primeira semana.');
  await team.getByRole('button', { name: 'Enviar como Anilha' }).click();
  await expect(dono.getByText(/Ficha enviada para Ana/)).toBeVisible();
  await expect(sheet.getByText(/esperando resposta/)).toBeVisible();

  await ana.goto('/avisos');
  const row = ana.getByRole('button', { name: /Anilha te mandou uma ficha/ });
  await row.click();
  await ana.getByRole('dialog').getByRole('button', { name: 'Recusar' }).click();
  await expect(ana.getByText('Ficha recusada')).toBeVisible();
  await expect(ana.getByRole('button', { name: /Você recusou a ficha/ })).toBeVisible();

  await dono.context().close();
  await ana.context().close();
});
