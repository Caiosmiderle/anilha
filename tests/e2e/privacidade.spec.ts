/**
 * LGPD in the app: the terms screen before anything (terms and age only), health data as
 * a pending item in Você with a red dot (features off until allowed), revoking deletes on
 * the server too, the message box for suggestions and requests about personal data, and
 * the public privacy and terms pages. No cookies.
 */
import { expect, test } from '@playwright/test';
import { login, onboard, shot, stats, uniqueEmail, walkTo } from './helpers';

test('termos antes de tudo; saúde fica pendente em Você e desligada até permitir', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = uniqueEmail('consentimento');
  await login(page, email, { consent: false });

  const gate = page.locator('[data-consent]');
  await expect(gate.getByRole('heading', { name: 'Seus dados no Anilha' })).toBeVisible();
  await expect(gate.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute(
    'href',
    '/privacidade/',
  );
  await expect(gate.getByRole('link', { name: 'Termos de uso' })).toHaveAttribute(
    'href',
    '/termos/',
  );
  // Only the terms here: health data is not asked before using the app.
  await expect(gate.getByRole('checkbox')).toHaveCount(1);
  const go = gate.getByRole('button', { name: 'Continuar' });
  await expect(go).toBeDisabled();
  await shot(page, '93-consentimento', true);
  await gate.getByRole('checkbox', { name: /18 anos/ }).check();
  await go.click();

  // Onboarding: one question per screen, and none about health. Joints to spare are asked
  // later, in Perfil de treino, and only with the separate consent.
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Lia');
  const first = await walkTo(page, 'Como dividir os treinos?');
  await page.getByRole('radio', { name: /^Por grupo muscular/ }).click();
  const rest = await walkTo(page, 'Seu plano da semana');
  expect([...first, ...rest.slice(1)]).toEqual([
    'Vamos montar seu plano',
    'Qual a sua idade?',
    'Qual o seu objetivo principal?',
    'Quer mais foco em algum grupo?',
    'Qual o seu nível?',
    'Está voltando de uma pausa longa?',
    'Onde você treina?',
    'Quantos dias por semana?',
    'Quanto tempo por treino?',
    'Como dividir os treinos?',
    'Como você se identifica?',
    'Seu plano da semana',
  ]);
  await expect(page.getByRole('button', { name: 'Permitir dados de saúde' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Usar este plano' }).click();
  await page.waitForURL('/');

  // The pending choice: a red dot on the Você tab.
  const tabs = page.locator('.hb-tabbar');
  await expect(tabs.getByRole('link', { name: 'Você (1 pendência)' })).toBeVisible();

  // A workout: no "Marcar dor" in the exercise menu.
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Ficha A: Peito e tríceps/ }).click();
  await page.waitForURL(/\/treino\//);
  await page
    .getByRole('button', { name: /^Opções de / })
    .first()
    .click();
  const menu = page.getByRole('dialog');
  await expect(menu.getByRole('menuitem', { name: /Substituir exercício/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Marcar dor/ })).toHaveCount(0);

  // Você: the pending card at the top.
  await page.goto('/voce');
  await expect(page.getByTestId('health-pending')).toBeVisible();
  await shot(page, '94-pendencia-saude');

  // Body tab: says the answer is missing; allowing turns it on and the dot goes away.
  await page.goto('/historico?aba=corpo');
  await expect(
    page.getByRole('heading', { name: 'Dados de saúde: falta sua resposta' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Permitir dados de saúde' }).click();
  await page.getByRole('button', { name: 'Registrar peso e medidas' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Peso (kg)', { exact: true }).fill('80');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet).toBeHidden();
  await expect.poll(async () => (await stats(page, email)).body_logs, { timeout: 20_000 }).toBe(1);
  await expect(tabs.getByRole('link', { name: 'Você', exact: true })).toBeVisible();

  // Revoke in Você, Privacidade: gone from this phone and from the server.
  await page.goto('/voce');
  await expect(page.getByTestId('health-pending')).toHaveCount(0);
  await page.getByRole('link', { name: /^Privacidade/ }).click();
  await page.waitForURL('**/voce/privacidade');
  const healthSwitch = page.getByRole('switch', { name: /^Dados de saúde/ });
  await expect(healthSwitch).toBeChecked();
  await healthSwitch.click();
  const off = page.getByRole('dialog');
  await expect(
    off.getByRole('heading', { name: 'Desligar e apagar dados de saúde?' }),
  ).toBeVisible();
  await off.getByRole('button', { name: 'Desligar e apagar' }).click();
  await expect(page.getByText('Dados de saúde desligados')).toBeVisible();
  await expect(healthSwitch).not.toBeChecked();
  const after = await stats(page, email);
  expect(after.body_logs).toBe(0);
  // Not even the deleted row keeps the weight.
  expect(after.body_values).toBe(0);
  await page.goto('/historico?aba=corpo');
  await expect(page.getByRole('heading', { name: 'Dados de saúde desligados' })).toBeVisible();

  // The app sets no cookie at all.
  expect(await page.context().cookies()).toEqual([]);
});

test('Fale com o Anilha: sugestão primeiro, pedido sobre dados com prazo de 15 dias', async ({
  page,
}) => {
  const email = uniqueEmail('pedido');
  await login(page, email);
  await onboard(page, 'Téo', { gym: 2, run: 0 });

  // Saying no to health data with nothing to delete: no warning, the pending item goes away.
  await page.goto('/voce');
  await page.getByTestId('health-pending').getByRole('button', { name: 'Não permitir' }).click();
  await expect(page.getByTestId('health-pending')).toHaveCount(0);
  await page.getByRole('link', { name: /^Privacidade/ }).click();
  await expect(page.getByRole('switch', { name: /^Dados de saúde/ })).not.toBeChecked();

  await page.goto('/voce');
  await page.getByRole('link', { name: /Fale com o Anilha/ }).click();
  await expect(page.getByRole('heading', { name: 'Fale com o Anilha' })).toBeVisible();
  // Suggestions come first.
  await expect(page.getByLabel('Assunto')).toHaveValue('sugestao');
  await page.getByLabel('Assunto').selectOption('dados');
  await page.getByLabel('Pedido').selectOption('exclusao');
  // What the person can already do alone shows before the request.
  await expect(page.getByText(/Para apagar tudo de uma vez/)).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Mensagem' })
    .fill('Quero apagar só as corridas de setembro.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Mensagem enviada')).toBeVisible();

  const ticket = page.getByTestId('ticket').first();
  await expect(ticket).toContainText('Apagar dados');
  await expect(ticket).toContainText('Aberta');
  await expect(ticket).toContainText(/resposta até \d{2}\/\d{2}/);
  await expect.poll(async () => (await stats(page, email)).tickets).toBe(1);
  await shot(page, '95-mensagens', true);
});

test('política de privacidade e termos: páginas públicas que cabem no celular', async ({
  page,
}) => {
  await page.goto('/conheca/');
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Política de privacidade' })
    .click();
  await page.waitForURL('/privacidade/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Política de privacidade' }),
  ).toBeVisible();
  await expect(page.getByText('Caio Smiderle')).toBeVisible();
  await expect(page.getByText('O Anilha não usa cookies.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, '96-privacidade', true);

  await page.getByRole('contentinfo').getByRole('link', { name: 'Termos de uso' }).click();
  await page.waitForURL('/termos/');
  await expect(page.getByRole('heading', { level: 1, name: 'Termos de uso' })).toBeVisible();
  await expect(page.getByText(/não substitui a orientação de profissional/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.context().cookies()).toEqual([]);
});
