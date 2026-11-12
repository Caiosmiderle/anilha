import { expect, test, type Page } from '@playwright/test';
import { login, onboard, shot, uniqueEmail } from './helpers';

async function completed(page: Page) {
  await login(page, uniqueEmail('analysis'));
  await onboard(page, 'Pessoa Sintética', { gym: 3, run: 0 });
  await page.goto('/');
  await page
    .getByRole('button', { name: /Escolher outro|Registrar treino|Treinar academia/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^Ficha A: Peito e tríceps/ })
    .first()
    .click();
  await page.waitForURL(/\/treino\//);
  await page.getByTestId('set-editor').getByRole('button', { name: 'Digitar' }).click();
  await page.getByLabel('Do jeito que você fala').fill('20kg 10 10');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar séries' }).click();
  await page.getByRole('button', { name: 'Opções do treino' }).click();
  await page.getByRole('menuitem', { name: /Encerrar treino/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar treino' }).click();
  await page.waitForURL(/\/historico\/treino\//);
  return page.getByTestId('analysis-card');
}

test('análise usa contexto mínimo, ajusta, salva na fila, reabre sem cobrar e desfaz', async ({
  page,
}) => {
  let calls = 0;
  let body: { context: Record<string, unknown> } | undefined;
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/analise-treino')) {
      calls++;
      body = request.postDataJSON();
    }
  });
  const card = await completed(page);
  await expect(card).toContainText('Vão só os números');
  await page.getByRole('region', { name: 'Análise do Waltér' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('region', { name: 'Análise do Waltér' })).toContainText(
    'limite diário',
  );
  await card.getByRole('button', { name: 'Analisar este treino' }).click();
  await expect(card).toContainText('Você concluiu a sessão.');
  expect(calls).toBe(1);
  expect(body).toBeDefined();
  expect(Object.keys(body!)).toEqual(['context']);
  const sent = JSON.stringify(body);
  for (const forbidden of [
    'Pessoa Sintética',
    'first_name',
    'last_name',
    'email',
    'user_id',
    'note',
    'pain_joint',
    'skip_reason',
    'substitution_reason',
    'return_mode',
  ])
    expect(sent).not.toContain(forbidden);
  await expect(card).toContainText('Antes:');
  await expect(card).toContainText('Depois:');
  await card.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await card.getByLabel('Séries do ajuste').fill('4');
  await card.getByRole('button', { name: 'Revisar ajuste' }).click();
  await expect(card).toContainText('4 séries');
  await card.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(card).toContainText('Salvo.');
  const local = await page.evaluate(async () => {
    const user = JSON.parse(localStorage.getItem('anilha:user')!).id;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(`anilha-${user}`);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const request = db.transaction('meta').objectStore('meta').getAll();
    const rows = await new Promise<
      { key: string; value: { status: string; undo?: { changes: { row: { sets: number } }[] } } }[]
    >((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.find((r) => r.key.startsWith('analysis:'))?.value;
  });
  expect(local?.status).toBe('saved');
  expect(local?.undo?.changes[0]?.row.sets).toBe(4);
  await page.reload();
  await expect(page.getByTestId('analysis-card')).toContainText('Salvo.');
  expect(calls).toBe(1);
  await page
    .getByTestId('analysis-card')
    .getByRole('button', { name: 'Voltar ao anterior' })
    .click();
  await expect(page.getByTestId('analysis-card')).toContainText('Desfeito: voltou como estava.');
  expect(calls).toBe(1);
  await shot(page, '208-analise-walter', true);
});

test('offline, erro do limite, recusa e cache da resposta sem nova chamada', async ({
  page,
  context,
}) => {
  const card = await completed(page);
  await context.setOffline(true);
  await expect(card).toContainText('Sem internet');
  await expect(card.getByRole('button', { name: 'Analisar este treino' })).toBeDisabled();
  await context.setOffline(false);
  await page.route('**/functions/v1/analise-treino', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Você chegou ao limite de hoje. Amanhã tem mais.' }),
    }),
  );
  await card.getByRole('button', { name: 'Analisar este treino' }).click();
  await expect(card.getByRole('alert')).toContainText('limite de hoje');
  await page.unroute('**/functions/v1/analise-treino');
  await card.getByRole('button', { name: 'Analisar este treino' }).click();
  await expect(card).toContainText('Você concluiu a sessão.');
  await card.getByRole('button', { name: 'Recusar', exact: true }).click();
  await expect(card).toContainText('Ajuste recusado.');
  await page.reload();
  await expect(page.getByTestId('analysis-card')).toContainText('Ajuste recusado.');
  await expect(
    page.getByTestId('analysis-card').getByRole('button', { name: 'Analisar este treino' }),
  ).toHaveCount(0);
});

test('operação fora da lista mantém só a narrativa no cartão', async ({ page }) => {
  const card = await completed(page);
  await page.route('**/functions/v1/analise-treino', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: 'Sessão concluída com dados sintéticos.',
        points: ['Repita a faixa planejada.'],
        adjustment: {
          operation: 'apagar_ficha',
          slot: 0,
          sets: null,
          min: null,
          max: null,
          replacement: null,
        },
      }),
    }),
  );
  await card.getByRole('button', { name: 'Analisar este treino' }).click();
  await expect(card).toContainText('Sessão concluída com dados sintéticos.');
  await expect(card.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Ajustar', exact: true })).toHaveCount(0);
});
