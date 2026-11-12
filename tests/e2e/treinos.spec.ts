/**
 * Plano has two tabs. Treinos keeps the plan's fichas apart from the person's own: a new plan
 * replaces only the first ones (a user lost a ficha of his own this way, on 20/10/2026), and
 * archived ones come back with one tap. Semana shows the real ficha of each day.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Monday 19/10/2026.
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
});

const section = (page: Page, title: string) =>
  page.locator('.hb-widget').filter({ has: page.getByRole('heading', { name: title }) });

test('plano novo troca só as fichas do plano; os seus treinos ficam', async ({ page }) => {
  await login(page, uniqueEmail('treinos'));
  await onboard(page, 'Caio', { gym: 3, run: 0 });

  // A treino of his own, with one exercise.
  await page.goto('/plano?aba=treinos');
  await expect(section(page, 'Do seu plano').getByRole('link')).toHaveCount(3);
  await page.getByRole('button', { name: 'Criar treino' }).click();
  await page.waitForURL(/\/plano\/rotina\//);
  const name = page.getByLabel('Nome do treino');
  await name.fill('Costa do fildo');
  await name.blur();
  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await page.getByRole('dialog').getByLabel('Buscar exercício').fill('remada curvada');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Remada curvada com barra/ })
    .click();
  await expect(page.getByText('Remada curvada com barra adicionado')).toBeVisible();

  await page.goto('/plano?aba=treinos');
  const own = section(page, 'Seus treinos');
  await expect(own.getByRole('link', { name: /^Costa do fildo/ })).toBeVisible();
  await shot(page, '180-treinos', true);

  // A new plan, from Perfil de treino.
  await page.goto('/voce/treino');
  await page
    .getByRole('navigation', { name: 'Perguntas do perfil' })
    .getByRole('button', { name: 'Foco', exact: true })
    .click();
  await page.getByRole('button', { name: 'Peito e braços' }).click();
  await page.getByRole('button', { name: 'Revisar plano novo', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar plano novo', exact: true }).click();
  await page.waitForURL('**/plano');

  await page.goto('/plano?aba=treinos');
  await expect(
    section(page, 'Seus treinos').getByRole('link', { name: /^Costa do fildo/ }),
  ).toBeVisible();
  await expect(section(page, 'Do seu plano').getByRole('link')).toHaveCount(3);

  // The old plan's fichas are archived, and one comes back as his own.
  const toggle = page.getByRole('button', { name: /^Arquivados/ });
  await expect(toggle).toContainText('3 treinos');
  await toggle.click();
  await page.getByRole('button', { name: 'Restaurar' }).first().click();
  await expect(page.getByText(/voltou para Seus treinos$/)).toBeVisible();
  await expect(section(page, 'Seus treinos').getByRole('link')).toHaveCount(2);
  // Without the old letter: the plan in force has its own Ficha A, B, C.
  await expect(
    section(page, 'Seus treinos').getByRole('link', { name: /\(plano anterior\)/ }),
  ).toBeVisible();
  await shot(page, '181-treinos-arquivados', true);

  // Deleting for good: one, then the rest, after a confirmation each time.
  const archivedRows = page
    .locator('.hb-widget')
    .filter({ has: toggle })
    .getByRole('button', {
      name: /^Excluir Ficha/,
    });
  await expect(archivedRows).toHaveCount(2);
  await archivedRows.first().click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(/continuam no histórico/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Excluir de vez' }).click();
  await expect(page.getByText(/^Ficha [A-C]: .+ excluído$/)).toBeVisible();
  await expect(archivedRows).toHaveCount(1);
  await page.getByRole('button', { name: /^Excluir Ficha/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir de vez' }).click();
  // Nothing archived left: the block goes away.
  await expect(page.getByRole('button', { name: /^Arquivados/ })).toHaveCount(0);
});

test('ficha do plano: duplicar como meu treino', async ({ page }) => {
  await login(page, uniqueEmail('duplicar'));
  await onboard(page, 'Ana', { gym: 3, run: 0 });
  await page.goto('/plano');
  await page.getByRole('link', { name: /^Ficha B: Costas e bíceps/ }).click();
  await expect(page.getByRole('note')).toContainText('Esta ficha é do seu plano');
  await page.getByRole('button', { name: 'duplicar como meu treino' }).click();
  await expect(page.getByText('Cópia salva em Seus treinos')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Costas e bíceps (meu)' }),
  ).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'Esta ficha é do seu plano' })).toHaveCount(
    0,
  );
  await page.goto('/plano?aba=treinos');
  await expect(
    section(page, 'Seus treinos').getByRole('link', { name: /^Costas e bíceps \(meu\)/ }),
  ).toBeVisible();
});

test('semana: cada dia com a ficha de verdade, hoje marcado', async ({ page }) => {
  await login(page, uniqueEmail('semana'));
  await onboard(page, 'Rui', { gym: 3, run: 1 });
  await page.goto('/plano');
  const days = page.getByRole('list', { name: 'Esta semana' }).getByRole('button');
  await expect(days).toHaveCount(7);
  await expect(days.first()).toHaveAttribute('aria-label', /, hoje\. Mudar$/);
  // No more "Ficha da vez": the gym days show A, B and C, in order.
  const labels = await days.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  );
  const letters = labels.map((t) => /: Ficha ([A-C]):/.exec(t)?.[1]).filter(Boolean);
  expect(letters).toEqual(['A', 'B', 'C']);
  await expect(page.getByTestId('week-next')).toHaveText('Próximo: Hoje, Ficha A: Peito e tríceps');
  await shot(page, '182-semana', true);
});
