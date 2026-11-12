import { expect, test } from '@playwright/test';
import { API, login, onboard, shot, uniqueEmail } from './helpers';

test('Waltér mantém conversa e campo quando o iOS muda innerHeight e desloca a área visual', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => window.innerHeight, configurable: true },
      offsetTop: { value: 0, configurable: true },
    });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = uniqueEmail('walter-ios');
  await login(page, email);
  await onboard(page, 'Ana', { gym: 3, run: 0 });
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`);
  await page.goto('/plano');
  const trigger = page.getByRole('button', { name: 'Falar com Waltér', exact: true });
  const popup = page.getByRole('dialog', { name: 'Waltér', exact: true });
  const input = popup.getByLabel('Seu pedido');
  await trigger.click();
  await input.fill('Quero trocar o treino de hoje');
  const resting = await popup.boundingBox();
  const layoutHeight = await page.evaluate(() => document.documentElement.clientHeight);

  async function geometry(
    height: number,
    offsetTop: number,
    innerHeight: number,
    expectedDraft = 'Quero trocar o treino de hoje',
  ) {
    await page.evaluate(
      ({ height, offsetTop, innerHeight }) => {
        Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
        const viewport = window.visualViewport!;
        Object.defineProperties(viewport, {
          height: { value: height, configurable: true },
          offsetTop: { value: offsetTop, configurable: true },
        });
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      },
      { height, offsetTop, innerHeight },
    );
    await expect
      .poll(
        async () => {
          const rect = await popup.boundingBox();
          return (
            !!rect && rect.y >= offsetTop - 1 && rect.y + rect.height <= offsetTop + height + 1
          );
        },
        { timeout: 3000 },
      )
      .toBe(true);
    for (const control of [
      popup.locator('.agent-popup-head'),
      popup.locator('.agent-composer'),
      input,
    ]) {
      const rect = await control.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.y).toBeGreaterThanOrEqual(offsetTop - 1);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(offsetTop + height + 1);
    }
    // Being inside the visual rectangle is insufficient if the dialog has collapsed
    // and only the composer is left, as seen in the user's iPhone recording.
    expect((await popup.locator('.agent-body').boundingBox())!.height).toBeGreaterThan(80);
    expect(
      await input.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
      }),
    ).toBe(true);
    await expect(input).toHaveValue(expectedDraft);
  }

  await geometry(414, 0, layoutHeight);
  // A reduced innerHeight must not be used as the dialog's fixed containing block.
  await geometry(414, 96, 414);
  await geometry(414, 300, 414);
  const keyboardHeight = (await popup.boundingBox())!.height;
  await geometry(414, 420, 414);
  expect((await popup.boundingBox())!.height).toBeCloseTo(keyboardHeight, 0);
  await shot(page, '207-walter-teclado-deslocado');

  await popup.getByRole('button', { name: 'Fechar conversa com Waltér' }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await geometry(414, 96, 414);
  await expect(input).toHaveValue('Quero trocar o treino de hoje');

  // Rotate the actual layout, not just the reported window metrics.
  await page.setViewportSize({ width: 844, height: 390 });
  await geometry(284, 0, 284);
  await page.setViewportSize({ width: 390, height: 844 });
  await geometry(layoutHeight, 0, layoutHeight);
  const restored = await popup.boundingBox();
  expect(restored!.y).toBeCloseTo(resting!.y, 0);
  expect(restored!.height).toBeCloseTo(resting!.height, 0);

  await geometry(414, 96, 414);
  const backgroundScroll = await page.evaluate(() => window.scrollY);
  await input.fill('Quero mais foco em perna e glúteo');
  await popup.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(popup.getByTestId('agent-card').last()).toBeVisible();
  await expect.poll(() => popup.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(backgroundScroll);
  await geometry(414, 96, 414, '');
  await shot(page, '208-walter-proposta-com-teclado');
});
