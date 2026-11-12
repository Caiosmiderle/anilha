/**
 * Visual pass: walks every screen at 390x844 (and a few at 1280x800) and saves
 * screenshots to artifacts/screens for review. Also a smoke test: every screen renders.
 */
import { expect, test, type Page } from '@playwright/test';
import { login, shot, uniqueEmail, walkTo } from './helpers';

async function settle(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  // Stable screenshots: no sheet or card animations mid-capture.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('telas com a semana de exemplo', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByRole('heading', { name: 'Entrar no Anilha' })).toBeVisible();
  await shot(page, '01-entrar');
  await login(page, 'caio@anilha.dev');
  await expect(page.getByRole('heading', { name: /Rafa/ })).toBeVisible();
  await expect(page.getByTestId('sync-status').filter({ visible: true })).toHaveAttribute(
    'data-state',
    'idle',
    { timeout: 20_000 },
  );
  await settle(page);
  await shot(page, '02-hoje');
  await shot(page, '03-hoje-inteira', true);

  await page.getByRole('button', { name: 'Tenho pouco tempo' }).click();
  await expect(page.getByRole('heading', { name: 'Quanto tempo você tem?' })).toBeVisible();
  await shot(page, '04-ajuste-tempo');
  await page.getByRole('button', { name: 'Fechar' }).click();

  await page.getByRole('link', { name: 'Histórico' }).filter({ visible: true }).click();
  await settle(page);
  await shot(page, '20-historico', true);
  await page
    .getByRole('link', { name: /Ombro e abdômen/ })
    .first()
    .click();
  await expect(page.getByTestId('substitution')).toBeVisible();
  await settle(page);
  await shot(page, '21-sessao-detalhe', true);
  await page.goto('/historico?aba=progresso');
  await settle(page);
  await shot(page, '22-progresso', true);
  await page.goto('/historico?aba=semanas');
  await settle(page);
  await shot(page, '23-semanas', true);

  await page.goto('/plano');
  await settle(page);
  await shot(page, '30-plano', true);
  await page
    .getByRole('link', { name: /Costas e bíceps/ })
    .first()
    .click();
  await settle(page);
  await shot(page, '31-rotina', true);
  await page.goto('/exercicios');
  await shot(page, '32-exercicios');
  await page.goto('/exercicios/elevacao-lateral');
  await settle(page);
  await shot(page, '33-exercicio', true);

  await page.goto('/amigos');
  await expect(page.getByText('Ana').first()).toBeVisible();
  await settle(page);
  await shot(page, '40-amigos', true);
  await page.getByRole('button', { name: /Abrir Turma das 6h/ }).click();
  await expect(page.getByTestId('ranking-row').first()).toBeVisible();
  await shot(page, '41-grupo', true);

  await page.goto('/voce');
  await settle(page);
  await shot(page, '50-voce', true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await settle(page);
  await shot(page, '90-desktop-hoje');
  await page.goto('/historico?aba=progresso');
  await settle(page);
  await shot(page, '91-desktop-progresso');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');
  // Rest day in the sample week: "Registrar treino"; training day: "Escolher outro". Both
  // open the same list of fichas.
  await page
    .getByRole('button', { name: /^(Registrar treino|Escolher outro)$/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /Ombro e abdômen/ })
    .first()
    .click();
  await page.waitForURL(/\/treino\//);
  await expect(page.getByTestId('set-editor')).toBeVisible();
  // Return mode: one simple warm-up set opens the workout, and the clock runs.
  await expect(page.getByTestId('warmup-note').first()).toContainText('1 série de 10, com 40%');
  await expect(page.getByTestId('session-clock')).toBeVisible();
  await shot(page, '05-sessao');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect(page.getByTestId('effort-prompt')).toHaveCount(0);
  await shot(page, '06-sessao-descanso');
  await page.getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('12kg 10 10 pesado');
  await expect(page.getByTestId('quick-preview')).toBeVisible();
  await shot(page, '07-entrada-rapida');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: /Opções de Face pull/ }).click();
  await shot(page, '08-menu-exercicio');
  await page.getByRole('menuitem', { name: /Substituir exercício/ }).click();
  await shot(page, '09-substituir');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await shot(page, '10-encerrar');
});

test('onboarding de conta nova', async ({ page }) => {
  await login(page, uniqueEmail('novo'));
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await shot(page, '60-onboarding-1');
  await page.getByLabel('Nome', { exact: true }).fill('Marina');
  await walkTo(page, 'Qual a sua idade?');
  await page.getByRole('button', { name: '30 a 39' }).click();
  await shot(page, '61-onboarding-idade');
  await walkTo(page, 'Qual o seu objetivo principal?');
  await shot(page, '62-onboarding-objetivo', true);
  await walkTo(page, 'Quer mais foco em algum grupo?');
  await shot(page, '63-onboarding-foco');
  await walkTo(page, 'Está voltando de uma pausa longa?');
  await page.getByRole('button', { name: 'Sim, mais de 3 semanas' }).click();
  await walkTo(page, 'Quantos dias por semana?');
  await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  await shot(page, '64-onboarding-semana');
  await walkTo(page, 'Seu plano da semana');
  await shot(page, '65-onboarding-plano', true);
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');
  await expect(page.getByRole('heading', { name: /Marina/ })).toBeVisible();
  await settle(page);
  await shot(page, '66-hoje-novo', true);
});
