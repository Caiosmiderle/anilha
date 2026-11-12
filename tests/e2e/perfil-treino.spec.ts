/**
 * Perfil de treino: every onboarding answer editable later, a new plan only after a
 * confirmation, and the joints to spare only with the health consent. Seus dados: what is
 * kept and why, export and delete, in plain words.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, shot, synced, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  // These flows must never call a hosted backend, even with an incorrect local build.
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const question = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Perguntas do perfil' })
    .getByRole('button', { name, exact: true });

/** Read the real local data: saving preferences must not rewrite a single workout row. */
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((database) =>
      database.name?.startsWith('anilha-'),
    )?.name;
    if (!name) throw new Error('Banco da conta ausente');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tables: Record<string, unknown[]> = {};
    try {
      for (const table of [
        'plans',
        'routines',
        'routine_items',
        'sessions',
        'sets',
        'day_overrides',
      ]) {
        tables[table] = await new Promise((resolve, reject) => {
          const request = database.transaction(table).objectStore(table).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      return tables;
    } finally {
      database.close();
    }
  });
}

test('mudar o foco em Você gera um plano novo depois de confirmar', async ({ page }) => {
  await login(page, uniqueEmail('perfiltreino'));
  await onboard(page, 'Nina', { gym: 4, run: 0, split: 'sugerida' });
  await page.goto('/voce');
  await page.getByRole('link', { name: /^Perfil de treino/ }).click();
  await page.waitForURL('**/voce/treino');
  await page.getByText('Revisar todas as respostas', { exact: true }).click();
  const answers = page.getByRole('region', { name: 'Suas respostas' });
  await expect(
    answers.getByRole('button', { name: 'Foco: Corpo todo por igual. Mudar' }),
  ).toBeVisible();
  await expect(
    answers.getByRole('button', { name: 'Divisão: Superior e inferior. Mudar' }),
  ).toBeVisible();
  await expect(
    answers.getByRole('button', { name: 'Faixa de idade: 30 a 39. Mudar' }),
  ).toBeVisible();
  await expect(answers.getByRole('button', { name: 'Gênero: Não informado. Mudar' })).toBeVisible();
  // Joints are health data: no row without the consent, the card to allow instead.
  await expect(answers.getByRole('button', { name: /^Articulações a poupar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Permitir dados de saúde' })).toBeVisible();
  const generate = page.getByRole('button', { name: 'Revisar plano novo', exact: true });
  await expect(generate).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Salvar perfil', exact: true })).toBeDisabled();
  await shot(page, '140-perfil-treino', true);

  // One answer at a time, in the same card for both entry points.
  await answers.getByRole('button', { name: /^Foco:/ }).click();
  await page.getByRole('button', { name: 'Peito e braços' }).click();
  await shot(page, '141-perfil-foco');
  await expect(answers.getByRole('button', { name: 'Foco: Peito e braços. Mudar' })).toBeVisible();

  // Nothing changes before the confirmation.
  await generate.click();
  const confirm = page.getByRole('region', { name: 'Revisão do plano' });
  await expect(confirm.getByRole('heading', { name: 'Este será seu novo plano' })).toBeVisible();
  await expect(
    confirm.getByText(/O plano e as fichas de agora vão para o histórico, e o novo começa hoje/),
  ).toBeVisible();
  await shot(page, '142-perfil-confirmar');
  await confirm.getByRole('button', { name: 'Gerar plano novo' }).click();
  await page.waitForURL('**/plano');
  await expect(page.getByText('Plano novo pronto')).toBeVisible();
  // The reasons of the plan are folded: open them.
  await page.getByText('Por que este plano').click();
  await expect(page.getByText(/^Foco em peito e braços/)).toBeVisible();

  // The answer stays saved for next time.
  await page.goto('/voce/treino');
  await page.getByText('Revisar todas as respostas', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Foco: Peito e braços. Mudar' })).toBeVisible();
});

test('articulações a poupar só com a permissão de saúde, e desfazer antes de gerar', async ({
  page,
}) => {
  await login(page, uniqueEmail('perfiljuntas'));
  await onboard(page, 'Lia', { gym: 3, run: 0 });
  await page.goto('/voce/treino');
  await page.getByRole('button', { name: 'Permitir dados de saúde' }).click();
  await page.getByText('Revisar todas as respostas', { exact: true }).click();
  const joints = page.getByRole('button', { name: 'Articulações a poupar: Nenhuma. Mudar' });
  await expect(joints).toBeVisible();
  await joints.click();
  await page.getByRole('button', { name: 'Joelho', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Articulações a poupar: joelho. Mudar' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Descartar mudanças' }).click();
  await expect(joints).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar perfil', exact: true })).toBeDisabled();
});

test('salvar só o perfil mantém plano, fichas e histórico; gerar direto permite respostas iguais', async ({
  page,
}) => {
  await login(page, uniqueEmail('perfilsemplano'));
  await onboard(page, 'Bia', { gym: 3, run: 0 });
  await synced(page);
  const before = await snapshot(page);
  await page.goto('/plano');
  await page.getByRole('button', { name: 'Editar perfil de treino', exact: true }).click();
  await expect(page).toHaveURL(/\/voce\/treino$/);
  await question(page, 'Foco').click();
  await page.getByRole('button', { name: 'Peito e braços' }).click();
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByText('Perfil salvo. Seu plano foi mantido.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar perfil', exact: true })).toBeDisabled();
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  await question(page, 'Foco').click();
  await expect(page.getByRole('button', { name: 'Peito e braços' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('/plano');
  await page.getByRole('button', { name: 'Gerar plano novo', exact: true }).click();
  await expect(page).toHaveURL(/\/voce\/treino\?acao=novo-plano$/);
  await expect(page.getByRole('heading', { name: 'Plano novo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar plano novo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Este será seu novo plano' })).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Voltar às respostas' }).click();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Revisar plano novo', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar plano novo', exact: true }).click();
  await page.waitForURL('**/plano');
  const after = await snapshot(page);
  expect(after.plans).toHaveLength(before.plans!.length + 1);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.sets).toEqual(before.sets);
});

test('falha ao salvar mantém o rascunho e permite tentar de novo', async ({ page }) => {
  await login(page, uniqueEmail('perfilfalha'));
  await onboard(page, 'Lia', { gym: 3, run: 0 });
  await synced(page);
  const before = await snapshot(page);
  await page.goto('/voce/treino');
  await question(page, 'Foco').click();
  await page.getByRole('button', { name: 'Peito e braços' }).click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles') {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Simulated storage failure', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Suas respostas continuam aqui');
  await expect(page.getByRole('button', { name: 'Peito e braços' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByText('Perfil salvo. Seu plano foi mantido.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('formulário por teclado, revisão e layout a 320 px e no desktop', async ({ page }) => {
  await login(page, uniqueEmail('perfilacessivel'));
  await onboard(page, 'Ana', { gym: 3, run: 0 });
  await page.goto('/voce/treino');
  await page.setViewportSize({ width: 1280, height: 900 });
  const goals = page.getByRole('radiogroup', { name: 'Objetivo' });
  const selected = goals.getByRole('radio', { checked: true });
  await selected.focus();
  await page.keyboard.press('ArrowDown');
  await expect(goals.getByRole('radio', { checked: true })).toBeFocused();
  await expect(goals.getByRole('radio', { checked: true })).toContainText('Emagrecer');
  await page.getByRole('button', { name: 'Descartar mudanças' }).click();
  await question(page, 'Foco').click();
  await shot(page, '144-perfil-desktop', true);
  await page.setViewportSize({ width: 320, height: 740 });
  for (const field of [
    'Foco',
    'Dias por semana',
    'Onde treina',
    'Divisão',
    'Horário dos treinos',
  ]) {
    await question(page, field).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Revisar plano novo', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.training-review-routine').first().locator('summary').click();
  await expect(page.locator('.training-review-routine').first().getByRole('list')).toBeVisible();
  await shot(page, '145-perfil-revisao-320', true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, '146-perfil-revisao-desktop', true);
});

test('seus dados: o que guardamos, para quê, exportar e apagar', async ({ page }) => {
  await login(page, uniqueEmail('seusdados'));
  await onboard(page, 'Téo', { gym: 3, run: 0 });
  await page.goto('/voce');
  await page.getByRole('link', { name: /^Seus dados/ }).click();
  await page.waitForURL('**/voce/dados');
  await expect(page.getByRole('heading', { name: 'O que guardamos e por quê' })).toBeVisible();
  for (const what of ['E-mail', 'Faixa de idade', 'Gênero, se você informar'])
    await expect(page.getByRole('term').filter({ hasText: what })).toBeVisible();
  await expect(
    page.getByText('Ajusta o começo do plano. A data de nascimento não é pedida.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar tudo (JSON)' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute(
    'href',
    '/privacidade/',
  );
  await shot(page, '143-seus-dados', true);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar tudo (JSON)' }).click();
  expect((await download).suggestedFilename()).toMatch(/^anilha-\d{8}\.json$/);

  await page.getByRole('button', { name: 'Apagar conta e dados' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('cartão, setas e salvar ficam estáveis entre perguntas longas e curtas, sem lista suspensa', async ({
  page,
}) => {
  await login(page, uniqueEmail('perfilestavel'));
  await onboard(page, 'Lia', { gym: 3, run: 0 });
  await page.goto('/voce/treino');
  await page.getByRole('button', { name: 'Permitir dados de saúde' }).click();
  await page.getByRole('radio', { name: /^Correr provas/ }).click();
  const nav = page.getByRole('navigation', { name: 'Perguntas do perfil' });
  const names = await nav
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')!));
  const measure = () =>
    page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return {
        card: rect('.training-card'),
        footer: rect('.training-question-footer'),
        save: rect('.training-form-actions > button'),
        scrollY,
      };
    });
  for (const viewport of [
    { width: 1440, height: 940 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.width > 1000 ? 'dark' : 'light' });
    await question(page, 'Objetivo').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await measure();
    let previousName = 'Objetivo';
    for (const name of names) {
      await question(page, name).click();
      await expect(question(page, name)).toHaveAttribute('aria-current', 'step');
      if (name !== previousName)
        await expect(page.getByRole('heading', { name, exact: true, level: 2 })).toBeFocused();
      previousName = name;
      const after = await measure();
      for (const target of ['card', 'footer', 'save'] as const) {
        for (const dimension of ['x', 'y', 'width', 'height'] as const) {
          expect(
            Math.abs(after[target][dimension] - before[target][dimension]),
            `${viewport.width}px: ${name}, ${target}.${dimension}`,
          ).toBeLessThan(2);
        }
      }
      expect(after.scrollY).toBe(before.scrollY);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await expect(page.getByRole('combobox')).toHaveCount(0);
    // Long and short content share the same frame; scrolling belongs to the options.
    await question(page, 'Objetivo').click();
    const options = page.getByRole('region', { name: 'Opções: Objetivo' });
    await options.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole('radio', { name: /^Correr provas/ })).toBeInViewport();
    await shot(page, `147-perfil-estavel-${viewport.width}-objetivo`);
    await page.getByRole('button', { name: 'Próxima pergunta', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Opções: Prova' })).toHaveJSProperty(
      'scrollTop',
      0,
    );
    await question(page, 'Foco').click();
    await shot(page, `148-perfil-estavel-${viewport.width}-foco`);
  }
});
