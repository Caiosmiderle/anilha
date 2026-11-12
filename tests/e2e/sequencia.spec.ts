/**
 * The flame next to the greeting: days in a row following the plan, from 5 on. Rest days of
 * the plan count; "Hoje é descanso" keeps the streak; gray while today's workout is missing.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

test('foguinho: 7 dias seguindo o plano, cinza até o treino de hoje, e descanso não zera', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The plan starts on Monday 12/10.
  await page.clock.install({ time: new Date('2026-10-12T08:00:00-03:00') });
  await login(page, uniqueEmail('sequencia'));
  await onboard(page, 'Nina', { gym: 3, run: 0 });
  const flame = page.getByRole('button', { name: /dias seguidos no plano/ });
  await expect(page.getByRole('heading', { name: /, Nina$/ })).toBeVisible();
  await expect(flame).toHaveCount(0);

  // The training days of that week.
  await page.goto('/plano');
  const days = page.getByRole('list', { name: 'Esta semana' }).getByRole('button');
  await expect(days).toHaveCount(7);
  const labels = await days.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  );
  const gymDays = labels
    .filter((t) => /: (Ficha|Academia)/.test(t))
    .map((t) => /(\d\d)\/10:/.exec(t)?.[1] as string);
  expect(gymDays).toHaveLength(3);

  // A week later: each training day had a run (any activity counts), rest days rested.
  await page.clock.setSystemTime(new Date('2026-10-19T08:00:00-03:00'));
  for (const dd of gymDays) {
    await page.goto('/?atalho=corrida');
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Distância (km)').fill('3');
    await sheet.getByLabel('Tempo').fill('20:00');
    await sheet.getByLabel('Data').fill(`2026-10-${dd}`);
    await sheet.getByRole('button', { name: 'Salvar corrida' }).click();
    await expect(sheet).toBeHidden();
  }

  // Monday 19 is a training day still open: 7 days, the flame waits in gray.
  await page.goto('/');
  await expect(flame).toHaveAttribute(
    'aria-label',
    '7 dias seguidos no plano, falta o treino de hoje',
  );
  await expect(flame).toHaveAttribute('data-pending', 'true');
  await shot(page, '186-foguinho-cinza');

  await flame.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: '7 dias seguidos no plano' })).toBeVisible();
  await expect(sheet.getByText(/a sequência pausa e não zera/)).toBeVisible();
  await shot(page, '187-foguinho-como-conta');
  await sheet.getByRole('button', { name: 'Fechar' }).last().click();

  // Rest today: the streak stays, lit, without counting the day.
  await page.getByRole('button', { name: 'Hoje é descanso' }).click();
  await expect(flame).toHaveAttribute('aria-label', '7 dias seguidos no plano');
  await expect(flame).toHaveAttribute('data-pending', 'false');
  await shot(page, '188-foguinho');
});
