/** Evidence probes, not assertions that all observed UX behavior is correct. Local data only. */
import { expect, test, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API, login, onboard, uniqueEmail, walkTo } from '../../tests/e2e/helpers';

const out = resolve('artifacts/uiux-evidence');
mkdirSync(out, { recursive: true });
test.beforeAll(() => writeFileSync(resolve(out, 'observations.jsonl'), ''));
const record = (id: string, data: unknown) =>
  appendFileSync(resolve(out, 'observations.jsonl'), `${JSON.stringify({ id, data })}\n`);
const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: resolve(out, `${name}.png`), fullPage });

async function rows(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (storeName) => {
    const user = JSON.parse(localStorage.getItem('anilha:user')!);
    const database = await new Promise<IDBDatabase>((done, fail) => {
      const req = indexedDB.open(`anilha-${user.id}`);
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((done, fail) => {
        const req = database.transaction(storeName).objectStore(storeName).getAll();
        req.onsuccess = () => done(req.result);
        req.onerror = () => fail(req.error);
      });
    } finally {
      database.close();
    }
  }, store);
}

test('viewport, estilos e menu da conta', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'caio@anilha.dev');
  const routes = [
    ['hoje', '/'],
    ['plano', '/plano'],
    ['treinos', '/plano?aba=treinos'],
    ['historico', '/historico'],
    ['progresso', '/historico?aba=progresso'],
    ['amigos', '/amigos'],
    ['voce', '/voce'],
    ['ajustes', '/ajustes'],
    ['privacidade', '/voce/privacidade'],
  ];
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, route] of routes) {
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeVisible();
      await shot(page, `${name}-${width}`);
      if (width === 390 && ['plano', 'ajustes', 'historico', 'voce'].includes(name))
        await shot(page, `${name}-full`, true);
      const metrics = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clippedSegments: [...document.querySelectorAll('.hb-seg')]
          .map((el) => ({
            label: el.getAttribute('aria-label'),
            width: el.clientWidth,
            scroll: el.scrollWidth,
            options: [...el.querySelectorAll('button')].map((b) => ({
              text: b.textContent?.trim(),
              width: b.getBoundingClientRect().width,
            })),
          }))
          .filter((el) => el.scroll > el.width + 1),
      }));
      record(`${name}-${width}`, metrics);
    }
  }
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/ajustes');
    await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
    record(
      `tokens-${theme}`,
      await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return Object.fromEntries(
          [
            '--bg-surface',
            '--bg-page',
            '--brand-300',
            '--brand-500',
            '--ink-on-brand',
            '--danger',
            '--line-strong',
            '--shadow-focus',
          ].map((p) => [p, css.getPropertyValue(p).trim()]),
        );
      }),
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /^Sua conta:/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Sua conta' })).toBeVisible();
  await page.keyboard.press('Tab');
  record(
    'menu-keyboard',
    await page.evaluate(() => ({
      text: document.activeElement?.textContent?.trim(),
      role: document.activeElement?.getAttribute('role'),
      insideMenu: !!document.activeElement?.closest('[role="menu"]'),
    })),
  );
  await shot(page, 'desktop-menu');
});

test('valores editados e foco são divergentes?', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
  await login(page, uniqueEmail('ux-foco'));
  await onboard(page, 'Pessoa', { gym: 3, run: 0 });
  await page.getByRole('button', { name: 'Iniciar treino', exact: true }).click();
  await page.waitForURL(/\/treino\//);
  await page.getByRole('button', { name: 'Modo foco', exact: true }).click();
  const focus = page.getByRole('region', { name: 'Modo foco' });
  await focus.getByRole('button', { name: 'Ajustar', exact: true }).click();
  const editor = page.getByTestId('set-editor');
  await editor.getByLabel('Carga (kg)', { exact: true }).fill('20');
  await editor.getByLabel('Repetições', { exact: true }).fill('10');
  await shot(page, 'foco-antes');
  await page.getByRole('button', { name: 'Modo foco', exact: true }).click();
  const shown = await focus.locator('.focus-big.is-set').textContent();
  record('focus-draft', { edited: { load: 20, reps: 10 }, shown });
  const hidden = await page
    .locator('.hb-dock input')
    .first()
    .evaluate((el) => ({
      inert: !!el.closest('[inert]'),
      tabindex: (el as HTMLInputElement).tabIndex,
      ariaHidden: !!el.closest('[aria-hidden="true"]'),
    }));
  record('focus-background', hidden);
  await shot(page, 'foco-depois');
  await focus.getByRole('button', { name: 'Série feita', exact: true }).click();
  await expect(focus.getByRole('timer', { name: 'Descanso restante' })).toBeVisible();
  record(
    'focus-saved',
    (await rows(page, 'sets'))
      .filter((s) => s.completed_at != null)
      .map((s) => ({ load: s.load_kg, reps: s.reps, kind: s.kind })),
  );
});

test('trocar dias conserva o horário editado?', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('ux-dia'));
  await onboard(page, 'Pessoa', { gym: 3, run: 0 });
  await page.goto('/plano');
  await page.getByRole('button', { name: /^Segunda,.*Mudar$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Horário', { exact: true }).fill('07:45');
  await shot(page, 'dia-antes');
  await dialog.getByRole('button', { name: /^Trocar com terça/ }).click();
  await expect(dialog).toBeHidden();
  const plans = (await rows(page, 'plans')).filter((p) => !p.deleted);
  record('day-swap', { edited: '07:45', days: plans.map((p) => p.days) });
  await page.getByRole('button', { name: /^Terça,.*Mudar$/ }).click();
  record('day-swap-ui', {
    value: await page.getByRole('dialog').getByLabel('Horário', { exact: true }).inputValue(),
  });
  await shot(page, 'dia-depois');
});

test('cadastro retoma após recarregar?', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('ux-cadastro'));
  await page.getByLabel('Nome', { exact: true }).fill('Pessoa');
  const seen = await walkTo(page, 'Quanto tempo por treino?');
  const before = await page.locator('main h1').first().textContent();
  await shot(page, 'cadastro-antes');
  await page.reload();
  await expect(page.locator('main h1').first()).toBeVisible();
  record('onboarding-reload', {
    before,
    after: await page.locator('main h1').first().textContent(),
    seen,
  });
  await shot(page, 'cadastro-depois');
});

test('resposta digitada respeita a posição de leitura?', async ({ page }) => {
  const email = uniqueEmail('ux-rolagem');
  await login(page, email);
  await onboard(page, 'Pessoa', { gym: 3, run: 0 });
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`);
  await page.goto('/plano');
  const text = Array.from(
    { length: 38 },
    (_, i) =>
      `Linha ${i + 1}: esta é uma resposta longa simulada para verificar o controle de leitura.`,
  ).join('\n\n');
  await page.route('**/functions/v1/agente', (route) =>
    route.fulfill({ json: { text, stop: 'end_turn', assistant: [{ type: 'text', text }] } }),
  );
  await page.getByRole('button', { name: 'Falar com Waltér', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Waltér' });
  await dialog.getByLabel('Seu pedido').fill('Teste local de leitura');
  await dialog.getByRole('button', { name: 'Enviar pedido' }).click();
  await page.waitForFunction(() => {
    const e = document.querySelector('.agent-popup .agent-body');
    return !!e && e.scrollHeight > e.clientHeight + 100;
  });
  const body = dialog.locator('.agent-body');
  const before = await body.evaluate((e) => {
    e.scrollTop = 0;
    const at = e.scrollTop;
    e.dispatchEvent(new Event('scroll'));
    return at;
  });
  await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBeGreaterThan(50);
  record('agent-scroll', {
    simulatedUserScroll: before,
    after: await body.evaluate((e) => e.scrollTop),
    response: 'simulada localmente',
    reducedMotion: false,
  });
  await shot(page, 'agente-rolagem');
});

test('recusar a progressão atualiza o editor ativo?', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('ux-ignorar'));
  await onboard(page, 'Pessoa', { gym: 3, run: 0 });
  async function start() {
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
  }
  for (let i = 0; i < 2; i++) {
    await start();
    await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
    await page.getByLabel('Do jeito que você fala').fill('40kg 12 12 12');
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
    await page.getByRole('button', { name: 'Opções do treino' }).click();
    await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
    await page.waitForURL(/\/historico\/treino\//);
  }
  await start();
  const card = page.getByTestId('item-card').first();
  const row = card.locator('[data-testid="set-row"][data-kind="work"]').first();
  await row.locator('.hb-setrow-values').click();
  const editor = page.getByTestId('set-editor');
  const before = await editor.getByLabel('Carga (kg)', { exact: true }).inputValue();
  await card.getByRole('button', { name: 'Ignorar sugestão', exact: true }).click();
  await expect(row.locator('.hb-setrow-values')).toContainText('40');
  record('dismiss-progression', {
    before,
    rowAfter: await row.locator('.hb-setrow-values').innerText(),
    editorAfter: await editor.getByLabel('Carga (kg)', { exact: true }).inputValue(),
  });
  await shot(page, 'progressao-ignorada');
});

test('dois acionamentos antes de salvar criam quantas corridas?', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('ux-corrida'));
  await onboard(page, 'Pessoa', { gym: 3, run: 0 });
  await page.goto('/?atalho=corrida');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Distância (km)').fill('5');
  await dialog.getByLabel('Tempo', { exact: true }).fill('30:00');
  await dialog
    .getByRole('button', { name: 'Salvar corrida', exact: true })
    .evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await rows(page, 'runs')).length).toBeGreaterThan(0);
  record('run-double-submit', {
    events: 'dois cliques DOM consecutivos antes do primeiro await terminar',
    runs: (await rows(page, 'runs'))
      .filter((r) => !r.deleted)
      .map((r) => ({ distance: r.distance_km, time: r.duration_sec })),
  });
});
