/**
 * Two users: onboarding generates the plan, invite by link, one sees the other's
 * adherence, one-tap reaction, weekly group challenge ranking.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  return ctx.newPage();
}

test('amigos: convite, aderência, reação e ranking do grupo', async ({ browser }) => {
  const a = await phone(browser);
  const b = await phone(browser);

  await login(a, uniqueEmail('lia'));
  await onboard(a, 'Lia', { gym: 3, run: 1 });
  await expect(a.getByText('Seu plano da semana')).toHaveCount(0);
  await expect(a.getByTestId('week-text')).toContainText('Academia 0 de 3');

  await login(b, uniqueEmail('davi'));
  await onboard(b, 'Davi', { gym: 4, run: 0 });

  // Lia logs a run so there is something to react to.
  await a
    .getByRole('button', { name: /Registrar corrida|Trocar por corrida/ })
    .first()
    .click();
  if (await a.getByRole('heading', { name: 'Registrar corrida' }).isHidden()) {
    await a.getByRole('button', { name: 'Registrar corrida' }).first().click();
  }
  await a.getByLabel('Distância (km)').fill('5,2');
  await a.getByLabel('Tempo').fill('31:10');
  await expect(a.getByText('6:00 /km')).toBeVisible();
  await a.getByRole('dialog').getByRole('button', { name: 'Salvar corrida' }).click();
  await expect(a.getByTestId('week-text')).toContainText('Corrida 1 de 1');

  // Invite by link.
  await a.goto('/amigos');
  await a.getByRole('button', { name: 'Convidar amigo' }).click();
  await a.getByRole('button', { name: 'Gerar convite' }).click();
  const code = (await a.getByTestId('invite-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{8}$/);

  await b.goto(`/convite/${code}`);
  await expect(b.getByText('Lia Teste te chamou para treinar junto')).toBeVisible();
  await b.getByRole('button', { name: 'Aceitar convite' }).click();
  await b.waitForURL('/amigos');

  // Davi sees Lia's adherence and workouts, but not her loads.
  const liaCard = b
    .locator('section')
    .filter({ has: b.getByRole('link', { name: 'Lia Teste', exact: true }) })
    .first();
  await expect(liaCard).toContainText('Academia 0 de 3 · Corrida 1 de 1');
  await expect(liaCard).toContainText('Corrida leve');

  // One-tap reaction.
  await liaCard.getByRole('button', { name: /Mandar um boa em Corrida leve/ }).click();
  await expect(liaCard.getByRole('button', { name: /Tirar boa em Corrida leve/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await b.getByRole('link', { name: 'Lia Teste', exact: true }).click();
  await expect(b.getByText('Cargas e repetições privadas')).toBeVisible();

  // Lia sees the reaction in her inbox (Today stays on the day's workout).
  await a.goto('/avisos');
  await expect(a.getByText(/Davi.*mandou um boa/)).toBeVisible({ timeout: 15_000 });
  await a.goto('/');
  await expect(a.getByText(/Davi.*mandou um boa/)).toHaveCount(0);

  // Weekly group challenge.
  await a.goto('/amigos');
  await a.getByRole('button', { name: 'Criar grupo' }).click();
  await a.getByLabel('Nome do grupo').fill('Pace de domingo');
  await a.getByRole('button', { name: 'Criar grupo' }).last().click();
  await a.waitForURL(/\/amigos\/grupo\//);
  const groupCode = (await a.getByTestId('group-code').innerText()).trim();

  await b.goto('/amigos');
  await b.getByRole('button', { name: 'Usar código' }).click();
  await b.getByLabel('Código de convite ou de grupo').fill(groupCode);
  await b.getByRole('button', { name: 'Usar código' }).last().click();
  await expect(b.getByRole('heading', { name: 'Pace de domingo' })).toBeVisible();

  await a.reload();
  const rows = a.getByTestId('ranking-row');
  await expect(rows).toHaveCount(2);
  // Lia: 1 of 4 planned (25%). Davi: 0 of 4 (0%).
  await expect(rows.nth(0)).toContainText('Lia');
  await expect(rows.nth(0)).toContainText('25%');
  await expect(rows.nth(1)).toContainText('Davi');
  await expect(rows.nth(1)).toContainText('0%');

  await a.context().close();
  await b.context().close();
});

test('convite direto para o grupo chega nos avisos e entra com um toque', async ({ browser }) => {
  const a = await phone(browser);
  const b = await phone(browser);
  await login(a, uniqueEmail('teca'));
  await onboard(a, 'Teca', { gym: 3, run: 0 });
  await login(b, uniqueEmail('igor'));
  await onboard(b, 'Igor', { gym: 3, run: 0 });

  // Friends first, by invite code.
  await a.goto('/amigos');
  await a.getByRole('button', { name: 'Convidar amigo' }).click();
  await a.getByRole('button', { name: 'Gerar convite' }).click();
  const code = (await a.getByTestId('invite-code').innerText()).trim();
  await b.goto(`/convite/${code}`);
  await b.getByRole('button', { name: 'Aceitar convite' }).click();
  await b.waitForURL('/amigos');

  // Teca sees in her inbox that Igor accepted.
  await a.goto('/');
  await expect(a.getByTestId('inbox-bell').filter({ visible: true })).toHaveAccessibleName(
    /Avisos, \d+ novo/,
  );
  await a.getByTestId('inbox-bell').filter({ visible: true }).click();
  await expect(a.getByText('Igor Teste aceitou seu convite')).toBeVisible();

  // Teca creates a group and invites Igor directly, no code.
  await a.goto('/amigos');
  await a.getByRole('button', { name: 'Criar grupo' }).click();
  await a.getByLabel('Nome do grupo').fill('Turma das 7h');
  await a.getByRole('button', { name: 'Criar grupo' }).last().click();
  await a.waitForURL(/\/amigos\/grupo\//);
  await a.getByRole('button', { name: 'Convidar amigos' }).click();
  const igor = a.getByTestId('invite-candidate').filter({ hasText: 'Igor' });
  await igor.getByRole('button', { name: 'Convidar' }).click();
  await expect(igor).toContainText('Convite enviado');
  await shot(a, '43-convidar-para-grupo');

  // Igor: the bell counts it, the inbox has the invite, one tap and he is in.
  await b.goto('/');
  await expect(b.getByTestId('inbox-bell').filter({ visible: true })).toHaveAccessibleName(
    /Avisos, \d+ novo/,
  );
  await b.getByTestId('inbox-bell').filter({ visible: true }).click();
  await b.waitForURL('/avisos');
  await expect(b.getByText('Teca Teste chamou você para Turma das 7h')).toBeVisible();
  await shot(b, '44-avisos');
  await b.getByRole('button', { name: 'Entrar no grupo' }).click();
  await expect(b.getByRole('heading', { name: 'Turma das 7h' })).toBeVisible();
  await expect(b.getByTestId('ranking-row')).toHaveCount(2);

  // Seen: back on Today the bell has nothing new.
  await b.goto('/');
  await expect(b.getByTestId('inbox-bell').filter({ visible: true })).toHaveAccessibleName(
    'Avisos',
  );

  // Teca is told that Igor joined.
  await a.goto('/avisos');
  await expect(a.getByText('Igor Teste entrou em Turma das 7h')).toBeVisible();

  await a.context().close();
  await b.context().close();
});

test('convite aberto sem conta: mostra o código, guarda e aceita depois do login', async ({
  browser,
}) => {
  const a = await phone(browser);
  await login(a, uniqueEmail('rui'));
  await onboard(a, 'Rui', { gym: 3, run: 0 });
  await a.goto('/amigos');
  await a.getByRole('button', { name: 'Convidar amigo' }).click();
  await a.getByRole('button', { name: 'Gerar convite' }).click();
  const code = (await a.getByTestId('invite-code').innerText()).trim();

  // The friend opens the link in a browser without an account: no redirect, the code shows.
  const b = await phone(browser);
  await b.goto(`/convite/${code}`);
  await expect(
    b.getByRole('heading', { name: 'Você recebeu um convite para treinar junto' }),
  ).toBeVisible();
  await expect(b.getByTestId('landing-code')).toContainText(`${code.slice(0, 4)} ${code.slice(4)}`);
  expect(new URL(b.url()).pathname).toBe(`/convite/${code}`);
  await shot(b, '42-convite-sem-conta', true);
  await b.getByRole('button', { name: 'Entrar e aceitar' }).click();
  await expect(b.getByText('Seu convite está guardado')).toBeVisible();

  // The login happens in another tab, like the link of the e-mail: the invite still waits.
  const b2 = await b.context().newPage();
  await login(b2, uniqueEmail('bia'));
  await b2.waitForURL(`**/convite/${code}`);
  await expect(b2.getByText('Rui Teste te chamou para treinar junto')).toBeVisible();
  await b2.getByRole('button', { name: 'Aceitar convite' }).click();
  // A new account still goes through the onboarding, and the friend is there after it.
  await expect(b2.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await onboard(b2, 'Bia', { gym: 2, run: 0 });
  await b2.goto('/amigos');
  await expect(b2.getByRole('link', { name: 'Rui Teste', exact: true })).toBeVisible();

  await a.context().close();
  await b.context().close();
});
