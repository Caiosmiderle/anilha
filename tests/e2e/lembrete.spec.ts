/**
 * Reminders offered where they help: on the last screen of the sign-up (30 minutes before
 * the workout, already checked) and once on Today for whoever has a plan and no reminder.
 * The weekly summary has its own switch in Ajustes.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import { login, onboard, shot, uniqueEmail, walkTo } from './helpers';

/**
 * Headless Chromium answers "denied" for notifications whatever the test grants, which
 * (rightly) hides the offer. Here the phone has said yes; this build has no push server,
 * so the choice is saved without a subscription, as in Ajustes.
 */
async function notificationsAllowed(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
  });
}

test('fim do cadastro oferece o lembrete 30 minutos antes; Ajustes mostra tudo ligado', async ({
  page,
  context,
}) => {
  await notificationsAllowed(context);
  await login(page, uniqueEmail('lembrete'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Duda');
  await walkTo(page, 'Seu plano da semana');
  await expect(page.getByRole('heading', { name: 'Seu plano da semana' })).toBeVisible();
  const remind = page.getByRole('checkbox', { name: /Me lembrar do treino 30 minutos antes/ });
  await expect(remind).toBeChecked();
  await expect(remind).toHaveAccessibleName(/às 05:30/);
  await shot(page, '103-lembrete-cadastro', true);
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');
  // Already answered at the sign-up: Today does not ask again.
  await expect(page.getByRole('heading', { name: 'Lembrete do treino' })).toHaveCount(0);

  await page.goto('/ajustes');
  await expect(page.getByRole('switch', { name: 'Lembrete do treino' })).toBeChecked();
  await expect(page.getByRole('switch', { name: /Resumo da semana/ })).toBeChecked();
  await expect(page.getByLabel('No dia do treino')).toHaveValue('05:30');
});

test('quem já tinha plano vê a oferta uma vez em Hoje', async ({ page, context }) => {
  await notificationsAllowed(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'bruno@anilha.dev');
  const offer = page.getByRole('heading', { name: 'Lembrete do treino' });
  await expect(offer).toBeVisible();
  await shot(page, '104-lembrete-hoje', true);
  await page.getByRole('button', { name: 'Ligar lembrete' }).click();
  await expect(page.getByText('Lembrete ligado')).toBeVisible();
  await expect(offer).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Bruno/ })).toBeVisible();
  await expect(offer).toHaveCount(0);
  await page.goto('/ajustes');
  await expect(page.getByRole('switch', { name: 'Lembrete do treino' })).toBeChecked();
});

test('dizer não no cadastro também vale: Hoje não pergunta de novo', async ({ page, context }) => {
  await notificationsAllowed(context);
  await login(page, uniqueEmail('sem-lembrete'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Gil');
  await walkTo(page, 'Seu plano da semana');
  await page.getByRole('checkbox', { name: /Me lembrar do treino/ }).uncheck();
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');
  await expect(page.getByRole('heading', { name: /Gil/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lembrete do treino' })).toHaveCount(0);
  await page.goto('/ajustes');
  await expect(page.getByRole('switch', { name: 'Lembrete do treino' })).not.toBeChecked();
});

// The helper keeps working: onboard() takes the default (reminder on).
test('o cadastro do teste continua passando pelo lembrete', async ({ page }) => {
  await login(page, uniqueEmail('padrao'));
  await onboard(page, 'Lu', { gym: 2, run: 0 });
  await expect(page.getByRole('heading', { name: /Lu/ })).toBeVisible();
});
