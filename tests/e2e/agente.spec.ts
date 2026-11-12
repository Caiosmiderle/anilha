/**
 * The assistant, with the model simulated by the local server (same shape as the real
 * function): ask in words, see before and after, save, put it back. Open to every account;
 * the request queue in the Panel stays with the team.
 */
import { expect, test } from '@playwright/test';
import { API, login, onboard, shot, uniqueEmail } from './helpers';

test('pedir uma mudança: proposta com antes e depois, salvar e voltar ao anterior', async ({
  page,
}) => {
  const email = uniqueEmail('agente');
  await login(page, email);
  await onboard(page, 'Ana', { gym: 4, run: 0 });
  expect((await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`)).ok()).toBe(
    true,
  );
  await page.goto('/plano');
  await page.getByRole('button', { name: 'Falar com Waltér', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Waltér' })).toBeVisible();
  await expect(page).toHaveURL('/plano');
  await expect(page.getByRole('heading', { name: 'Waltér' })).toBeVisible();

  // In words, as the person would say it.
  await page.getByLabel('Seu pedido').fill('Quero mais foco em perna e glúteo');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  const answer = page.getByTestId('agent-answer').last();
  await expect(answer).toContainText('foco em pernas e glúteos');

  // The card: the profile before and after, field by field.
  const card = page.getByTestId('agent-card').last();
  await expect(card).toContainText('Plano novo');
  const fields = card.getByRole('definition');
  await expect(card.locator('.agent-field', { hasText: 'Foco' })).toContainText('Glúteos e pernas');
  await expect(card.locator('.agent-field', { hasText: 'Foco' })).toContainText('muda');
  await expect(card.locator('.agent-field', { hasText: 'Dias de academia' })).toContainText(
    'mantém',
  );
  expect(await fields.count()).toBe(6);
  await expect(card).toContainText('Ficha A: Anterior de coxa');
  // The upper body at maintenance level: said, with the source.
  await expect(card).toContainText('nível de manter');
  await card.scrollIntoViewIfNeeded();
  await shot(page, '201-agente-proposta', true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, '204-agente-popup-desktop');
  await page.setViewportSize({ width: 390, height: 844 });

  // The answer types once: minimized and opened again, it is whole right away.
  const whole = await answer.textContent();
  await page.getByRole('button', { name: 'Fechar conversa com Waltér' }).click();
  await page.getByRole('button', { name: 'Falar com Waltér', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Waltér' })).toBeVisible();
  expect(await answer.evaluate((el) => el.textContent)).toBe(whole);

  // Save, then put it back.
  await card.getByRole('button', { name: /^Salvar/ }).click();
  await expect(card).toContainText('Salvo.');
  await card.getByRole('button', { name: 'Voltar ao anterior' }).click();
  await expect(card).toContainText('Desfeito: voltou como estava.');
  await page.goto('/plano');
  await expect(page.getByText('Ficha A: Anterior de coxa')).toHaveCount(0);

  // Again, and this time it stays.
  await page.goto('/plano/pedir');
  await page.getByLabel('Seu pedido').fill('Mais perna e glúteo, por favor');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await page
    .getByTestId('agent-card')
    .last()
    .getByRole('button', { name: /^Salvar/ })
    .click();
  await expect(page.getByTestId('agent-card').last()).toContainText('Salvo.');
  await page.goto('/plano');
  await expect(page.getByText('Ficha A: Anterior de coxa').first()).toBeVisible();
});

test('o que já existe vira atalho, e o que não dá é registrado', async ({ page }) => {
  const email = uniqueEmail('agente-onde');
  await login(page, email);
  await onboard(page, 'Bia', { gym: 3, run: 0 });
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`);
  await page.goto('/plano/pedir');

  await page.getByLabel('Seu pedido').fill('Como eu mudo para libras?');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  const card = page.getByTestId('agent-card').last();
  await expect(card).toContainText('Já existe no app');
  await expect(page.getByTestId('agent-answer').last()).toContainText('Ajustes');

  await page.getByLabel('Seu pedido').fill('Faz uma dieta pra mim');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByTestId('agent-answer').last()).toContainText('Registrei seu pedido');
  await shot(page, '202-agente-registro', true);

  await card.getByRole('button', { name: 'Abrir' }).click();
  await page.waitForURL('**/ajustes');

  // The queue in the panel: what the app does not do yet, grouped.
  await page.goto('/admin?aba=assistente');
  const request = page.getByTestId('agent-request').filter({ hasText: 'Montar uma dieta.' });
  await expect(request).toContainText('Não conseguiu');
  await shot(page, '203-painel-assistente', true);
  // Built: who asked hears it in the inbox.
  await request.getByRole('combobox').selectOption('feito');
  await expect(page.getByText('Quem pediu vai receber um aviso no sino')).toBeVisible();
  await page.goto('/avisos');
  await expect(
    page.getByTestId('inbox-item').filter({ hasText: 'O que você pediu agora dá para fazer' }),
  ).toContainText('Montar uma dieta.');
});

test('Waltér está aberto para qualquer conta, sem ser da equipe', async ({ page }) => {
  await login(page, uniqueEmail('agente-todos'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });
  await page.goto('/plano');
  await page.getByRole('button', { name: 'Falar com Waltér', exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Waltér' });
  await popup.getByLabel('Seu pedido').fill('Quero mais foco em perna e glúteo');
  await popup.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(popup.getByTestId('agent-card').last()).toContainText('Plano novo');
  await expect(popup.getByRole('alert')).toHaveCount(0);
});

test('popup preserva rascunho, funciona com teclado e explica o modo offline', async ({
  page,
  context,
}) => {
  const email = uniqueEmail('agente-popup');
  await login(page, email);
  await onboard(page, 'Ana', { gym: 3, run: 0 });
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`);
  await page.goto('/plano');
  const trigger = page.getByRole('button', { name: 'Falar com Waltér', exact: true });
  const popup = page.getByRole('dialog', { name: 'Waltér' });
  await trigger.click();
  await popup.getByLabel('Seu pedido').fill('Quero mudar o descanso');
  await popup.getByRole('button', { name: 'Fechar conversa com Waltér' }).click();
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(popup.getByLabel('Seu pedido')).toHaveValue('Quero mudar o descanso');
  await context.setOffline(true);
  await expect(popup).toContainText('Sem internet');
  await expect(popup.getByRole('button', { name: 'Enviar pedido' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await trigger.press('Enter');
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel('Seu pedido')).toHaveValue('Quero mudar o descanso');
  const bounds = await popup.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await context.setOffline(false);
  await expect(popup.getByRole('button', { name: 'Enviar pedido' })).toBeEnabled();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await shot(page, '205-agente-popup-escuro');
});

test('minimizar durante uma resposta mantém a proposta e permite nova conversa', async ({
  page,
}) => {
  const email = uniqueEmail('agente-minimizar');
  await login(page, email);
  await onboard(page, 'Bia', { gym: 3, run: 0 });
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`);
  await page.goto('/plano');
  const trigger = page.getByRole('button', { name: 'Falar com Waltér', exact: true });
  const popup = page.getByRole('dialog', { name: 'Waltér' });
  await trigger.click();
  await popup.getByLabel('Seu pedido').fill('Quero mais foco em perna e glúteo');
  await popup.getByRole('button', { name: 'Enviar pedido' }).click();
  await popup.getByRole('button', { name: 'Fechar conversa com Waltér' }).click();
  await expect(popup).toBeHidden();
  await trigger.click();
  await expect(popup.getByTestId('agent-card').last()).toContainText('Plano novo');
  await popup.getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await expect(popup.getByTestId('agent-card')).toHaveCount(0);
  await expect(popup.getByLabel('Seu pedido')).toHaveValue('');
  await expect(popup.getByLabel('Sugestões de pedido')).toBeVisible();
});

test('popup acompanha teclado e deslocamento visual sem encolher a janela', async ({ page }) => {
  // Model the iOS geometry separately from innerHeight: a desktop viewport resize alone
  // cannot reproduce the keyboard covering a fixed popup in the unchanged layout viewport.
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => window.innerHeight, configurable: true },
      offsetTop: { value: 0, configurable: true },
    });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = uniqueEmail('agente-teclado');
  await login(page, email);
  await onboard(page, 'Ana', { gym: 3, run: 0 });
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`);
  await page.goto('/plano');
  const trigger = page.getByRole('button', { name: 'Falar com Waltér', exact: true });
  const popup = page.getByRole('dialog', { name: 'Waltér' });
  const input = popup.getByLabel('Seu pedido');
  await trigger.click();
  await input.fill('Quero mudar o descanso sem perder este texto');
  const restingBounds = await popup.boundingBox();
  const tabbarBounds = await page.locator('.hb-tabbar').boundingBox();
  expect(restingBounds).not.toBeNull();
  expect(tabbarBounds).not.toBeNull();
  expect(restingBounds!.y + restingBounds!.height).toBeLessThanOrEqual(tabbarBounds!.y);
  const layoutHeight = await page.evaluate(() => window.innerHeight);

  async function visualGeometry(height: number, offsetTop: number, event: 'resize' | 'scroll') {
    await page.evaluate(
      ({ height, offsetTop, event }) => {
        const viewport = window.visualViewport!;
        Object.defineProperties(viewport, {
          height: { value: height, configurable: true },
          offsetTop: { value: offsetTop, configurable: true },
        });
        viewport.dispatchEvent(new Event(event));
      },
      { height, offsetTop, event },
    );
    await expect
      .poll(async () => {
        const bounds = await popup.boundingBox();
        return !!bounds && bounds.y >= offsetTop && bounds.y + bounds.height <= offsetTop + height;
      })
      .toBe(true);
    for (const control of [popup.locator('.agent-popup-head'), popup.locator('.agent-composer')]) {
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.y).toBeGreaterThanOrEqual(offsetTop);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(offsetTop + height);
    }
    expect(await page.evaluate(() => window.innerHeight)).toBe(layoutHeight);
    await expect(input).toHaveValue('Quero mudar o descanso sem perder este texto');
  }

  // Open keyboard; then Safari pans the visual viewport to keep the focused field visible.
  await visualGeometry(414, 0, 'resize');
  await expect(input).toBeFocused();
  await visualGeometry(414, 96, 'scroll');
  await expect(input).toBeFocused();
  await shot(page, '206-agente-popup-teclado');
  await popup.getByRole('button', { name: 'Fechar conversa com Waltér' }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await visualGeometry(414, 96, 'resize');

  // Closing the keyboard restores the original position above the navigation bar.
  await visualGeometry(layoutHeight, 0, 'resize');
  const restoredBounds = await popup.boundingBox();
  expect(restoredBounds!.y).toBeCloseTo(restingBounds!.y, 0);
  expect(restoredBounds!.height).toBeCloseTo(restingBounds!.height, 0);
});
