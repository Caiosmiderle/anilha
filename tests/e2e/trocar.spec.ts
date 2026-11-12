/**
 * Swapping an exercise in the workout: only coherent substitutes, at most 6, each with one
 * line of why; never the current one or one already in the workout. The whole muscle group
 * only after "Ver todos de".
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Monday 19/10/2026: a gym day of the plan.
  await page.clock.install({ time: new Date('2026-10-19T08:00:00-03:00') });
});

test('trocar exercício: até 6 parecidos com o porquê, e o grupo todo só se pedir', async ({
  page,
}) => {
  await login(page, uniqueEmail('trocar'));
  await onboard(page, 'Bel', { gym: 3, run: 0 });
  await page.getByRole('button', { name: 'Iniciar treino' }).click();
  await page.waitForURL(/\/treino\//);
  const cards = page.getByTestId('item-card');
  await expect(cards.first()).toBeVisible();
  const inWorkout = (await cards.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  )) as string[];
  const first = inWorkout[0] as string;

  await page.getByRole('button', { name: `Opções de ${first}` }).click();
  await page.getByRole('menuitem', { name: /Substituir exercício/ }).click();
  const sheet = page.getByRole('dialog');
  const list = sheet.getByLabel('Substitutos sugeridos');
  const rows = list.getByRole('button');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(3);
  expect(count).toBeLessThanOrEqual(6);
  const names = await list.locator('.hb-list-title').allTextContents();
  const reasons = await list.locator('.hb-list-sub').allTextContents();
  // Never the current one nor one already in the workout.
  for (const n of names) expect(inWorkout).not.toContain(n);
  // One line of why each.
  expect(reasons).toHaveLength(count);
  for (const r of reasons) expect(r).toMatch(/^(Mesmo movimento|Mesmo músculo|Outra parte)/);
  // No full list up front: no search, only the quiet link.
  await expect(sheet.getByRole('searchbox')).toHaveCount(0);
  const all = sheet.getByRole('button', { name: /^Ver todos de / });
  await expect(all).toBeVisible();
  await shot(page, '150-trocar-sugestoes');

  // The whole group on request, filtered and searchable.
  await all.click();
  await expect(sheet.getByRole('searchbox', { name: 'Buscar exercício' })).toBeVisible();
  await expect(
    sheet.getByRole('group', { name: 'Grupo' }).locator('[aria-pressed="true"]'),
  ).toHaveCount(1);
  await shot(page, '151-trocar-todos');

  // Picking one goes on to the reason, as before.
  await sheet.getByRole('searchbox', { name: 'Buscar exercício' }).fill(names[0] as string);
  await sheet
    .getByRole('button', { name: new RegExp(`^${names[0]}`) })
    .first()
    .click();
  await expect(sheet.getByRole('heading', { name: 'Por que a troca?' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Trocar exercício' }).click();
  await expect(cards.first()).toHaveAttribute('aria-label', names[0] as string);
});

test('na ficha: trocar um exercício pelos parecidos, e vale para os próximos treinos', async ({
  page,
}) => {
  await login(page, uniqueEmail('trocarficha'));
  await onboard(page, 'Ivo', { gym: 3, run: 0 });
  await page.goto('/plano');
  await page.getByRole('link', { name: /^Ficha A: Peito e tríceps/ }).click();
  const names = page.locator('.routine-row .hb-list-title');
  await expect(names.first()).toHaveText('Supino reto com barra');
  const before = await names.allTextContents();

  await page.getByRole('button', { name: 'Editar Supino reto com barra' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Trocar exercício' }).click();
  await expect(sheet.getByRole('heading', { name: 'Trocar supino reto com barra' })).toBeVisible();
  const list = sheet.getByLabel('Substitutos sugeridos');
  await expect(list.locator('.hb-list-title').first()).toBeVisible();
  const options = await list.locator('.hb-list-title').allTextContents();
  expect(options.length).toBeGreaterThanOrEqual(3);
  expect(options.length).toBeLessThanOrEqual(6);
  // Nothing already in the ficha.
  for (const n of options) expect(before).not.toContain(n);
  await expect(list.locator('.hb-list-sub').first()).toHaveText(/^Mesmo movimento/);
  await expect(sheet.getByRole('button', { name: 'Ver todos de peito' })).toBeVisible();
  await shot(page, '152-trocar-na-ficha');

  const pick = options[0] as string;
  await list.getByRole('button', { name: new RegExp(`^${pick}`) }).click();
  await expect(
    page.getByText(`Supino reto com barra virou ${pick.toLowerCase()} na ficha`),
  ).toBeVisible();
  await expect(names.first()).toHaveText(pick);

  // The next workout of this ficha already comes with it.
  await page.reload();
  await expect(names.first()).toHaveText(pick);
  await page.goto('/');
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Ficha A: Peito e tríceps/ }).click();
  await page.waitForURL(/\/treino\//);
  await expect(page.getByTestId('item-card').first()).toHaveAttribute('aria-label', pick);
});
