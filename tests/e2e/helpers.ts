import { expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export const API = 'http://127.0.0.1:54329';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@teste.dev`;
}

/**
 * Logs in through the real UI; the code comes from the local API instead of an inbox.
 * A first login passes the terms screen too, unless the test wants to look at it.
 */
export async function login(
  page: Page,
  email: string,
  opts: { consent?: boolean } = {},
): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('heading', { name: 'Digite o código' })).toBeVisible();
  const res = await page.request.get(`${API}/dev/otp?email=${encodeURIComponent(email)}`);
  const { code } = (await res.json()) as { code: string };
  await page.getByLabel('Dígito 1').fill(code);
  await page.waitForURL((url) => !url.pathname.startsWith('/entrar'));
  if (opts.consent !== false) await passConsent(page);
}

/** The terms screen shows on the first open of an account; later opens go straight in. */
export async function passConsent(page: Page): Promise<void> {
  const gate = page.locator('[data-consent]');
  await expect(gate.or(page.locator('main.app-main'))).toBeVisible({ timeout: 15_000 });
  if (!(await gate.isVisible())) return;
  await gate.getByRole('checkbox', { name: /18 anos/ }).check();
  await gate.getByRole('button', { name: 'Continuar' }).click();
  await expect(gate).toBeHidden();
}

/**
 * The onboarding, one question per screen: Continuar until the screen titled `heading`,
 * answering on the way only what is required (the age range). Returns the titles seen.
 */
export async function walkTo(page: Page, heading: string): Promise<string[]> {
  const title = page.locator('main h1.page-title').first();
  const seen: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    const text = (await title.innerText()).trim();
    seen.push(text);
    if (text === heading) return seen;
    // The first screen asks for the last name too: any one will do for a test.
    if (text === 'Vamos montar seu plano') {
      const last = page.getByLabel('Sobrenome', { exact: true });
      if (!(await last.inputValue())) await last.fill('Teste');
    }
    if (
      text === 'Qual a sua idade?' &&
      !(await page
        .getByRole('group', { name: 'Faixa de idade' })
        .locator('[aria-pressed="true"]')
        .count())
    )
      await page.getByRole('button', { name: '30 a 39' }).click();
    await page.getByRole('button', { name: /^(Continuar|Pular)$/ }).click();
    await expect(title).not.toHaveText(text);
  }
  throw new Error(`O cadastro não chegou em: ${heading}`);
}

/**
 * The whole onboarding with defaults. From 3 gym days the split is "Por grupo muscular"
 * unless the test asks for the suggestion: many tests open "Ficha A: Peito e tríceps".
 */
export async function onboard(
  page: Page,
  name: string,
  opts: { gym?: number; run?: number; returning?: boolean; split?: 'grupos' | 'sugerida' } = {},
) {
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill(name);
  if (opts.returning) {
    await walkTo(page, 'Está voltando de uma pausa longa?');
    await page.getByRole('button', { name: 'Sim, mais de 3 semanas' }).click();
  }
  await walkTo(page, 'Quantos dias por semana?');
  // Gym days default 3; run days from 0.
  const runs = opts.run ?? 2;
  for (let i = 0; i < runs; i += 1)
    await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  const gym = opts.gym ?? 3;
  for (let i = 3; i < gym; i += 1)
    await page.getByRole('button', { name: 'Aumentar academia' }).click();
  for (let i = 3; i > gym; i -= 1)
    await page.getByRole('button', { name: 'Diminuir academia' }).click();
  // The old default, kept for the tests: whole body up to 2 days, groups from 3.
  if (gym >= 3 && opts.split !== 'sugerida') {
    await walkTo(page, 'Como dividir os treinos?');
    await page.getByRole('radio', { name: /^Por grupo muscular/ }).click();
  }
  await walkTo(page, 'Seu plano da semana');
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');
}

/** On Today: everything on the phone went up (the name others see, the plan). */
export async function synced(page: Page): Promise<void> {
  const status = page.getByTestId('sync-status').filter({ visible: true });
  await expect(status).toHaveAttribute('data-state', 'idle', { timeout: 20_000 });
  await expect(status).toHaveText('Sincronizado', { timeout: 20_000 });
}

export async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  mkdirSync('artifacts/screens', { recursive: true });
  await page.screenshot({ path: `artifacts/screens/${name}.png`, fullPage });
}

export interface Stats {
  sessions: number;
  sets: number;
  runs: number;
  items: number;
  rest_alerts: number;
  /** Body logs not deleted, and rows still holding a weight (deleted or not). */
  body_logs: number;
  body_values: number;
  tickets: number;
}

export async function stats(page: Page, email: string): Promise<Stats> {
  const res = await page.request.get(`${API}/dev/stats?email=${encodeURIComponent(email)}`);
  return (await res.json()) as Stats;
}
