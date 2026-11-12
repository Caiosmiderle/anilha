/**
 * The focus, asked on a screen of its own and optional: the whole body evenly unless the
 * person picks one or more groups. Legs get fichas of their own; the other groups weigh
 * inside the usual split. With no focus the week is balanced.
 */
import { expect, test } from '@playwright/test';
import { login, shot, uniqueEmail, walkTo } from './helpers';

test('foco em pernas e glúteos: fichas próprias e o primeiro treino é de perna', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('foco'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Bia');
  await walkTo(page, 'Quer mais foco em algum grupo?');
  await page.getByRole('button', { name: 'Glúteos e pernas' }).click();
  await expect(page.getByRole('button', { name: 'Corpo todo por igual' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(
    page.getByText(/Anterior, posterior e glúteos ganham fichas próprias/),
  ).toBeVisible();
  await shot(page, '108-foco-cadastro', true);

  await walkTo(page, 'Como dividir os treinos?');
  await expect(page.getByText('Pernas por partes')).toBeVisible();
  await expect(page.getByText('Corpo inteiro com mais perna')).toBeVisible();
  // Upper and lower comes in its legs version: two days of legs and two of upper body.
  await expect(page.getByText('Superior e inferior com mais perna')).toBeVisible();
  await expect(page.getByText('Superior e inferior', { exact: true })).toHaveCount(0);
  await shot(page, '109-foco-divisao', true);

  await walkTo(page, 'Seu plano da semana');
  for (const name of [
    'Ficha A: Anterior de coxa',
    'Ficha B: Parte de cima',
    'Ficha C: Posterior de coxa',
    'Ficha D: Glúteos',
  ])
    await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(/Foco em pernas e glúteos/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');

  await page.goto('/plano');
  await expect(page.getByTestId('week-next')).toContainText('Ficha A: Anterior de coxa');
});

test('sem foco, a semana é equilibrada: corpo inteiro em 3 dias', async ({ page }) => {
  await login(page, uniqueEmail('sem-foco'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Davi');
  await walkTo(page, 'Quer mais foco em algum grupo?');
  await expect(page.getByRole('button', { name: 'Corpo todo por igual' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await walkTo(page, 'Como dividir os treinos?');
  const full = page.getByRole('radio', { name: /^Corpo inteiro/ });
  await expect(full).toHaveAttribute('aria-checked', 'true');
  await expect(full).toContainText('Sugerido');
  await walkTo(page, 'Seu plano da semana');
  await expect(page.getByRole('heading', { name: /^Ficha A: Corpo inteiro/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Ficha B: Corpo inteiro/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ficha A: Peito e tríceps' })).toHaveCount(0);
});

test('mais de um foco: costas e ombros com abdômen; corpo todo desmarca os outros', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('focos'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Rui');
  await walkTo(page, 'Quer mais foco em algum grupo?');
  const even = page.getByRole('button', { name: 'Corpo todo por igual' });
  const back = page.getByRole('button', { name: 'Costas e ombros' });
  const abs = page.getByRole('button', { name: 'Abdômen' });
  await back.click();
  await abs.click();
  await expect(back).toHaveAttribute('aria-pressed', 'true');
  await expect(abs).toHaveAttribute('aria-pressed', 'true');
  await expect(even).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(/^Esses grupos ganham mais séries na semana/)).toBeVisible();
  await shot(page, '111-varios-focos');

  // Evenly clears the others; then the two again.
  await even.click();
  await expect(back).toHaveAttribute('aria-pressed', 'false');
  await back.click();
  await abs.click();

  await walkTo(page, 'Seu plano da semana');
  await expect(
    page.getByText(/^Foco em costas e ombros e abdômen: os exercícios desses grupos têm 4 séries/),
  ).toBeVisible();
  // Abs every ficha, back and shoulders with 4 sets.
  await expect(
    page.getByText(/Prancha|Dead bug|Abdominal|Elevação de pernas/).first(),
  ).toBeVisible();
  await expect(page.getByText(/^4x /).first()).toBeVisible();
});
