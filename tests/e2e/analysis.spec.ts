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
  await expect(card).toContainText('Boa execução');
  await expect(card).toContainText('Na próxima vez');
  await expect(card.getByTestId('analysis-usage')).toContainText('1000/150 tokens');
  await expect(card.getByTestId('analysis-usage')).toContainText('0.0001750');
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
  await expect(page.getByTestId('next-time')).toHaveCount(0);
  await expect(page.locator('.hb-toast')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '208-analise-walter-proposta', true);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shot(page, '208-analise-walter-proposta-escuro', true);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
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
  await expect(page.getByTestId('evolution-card')).toContainText('20 kg x 10 rep');
  await expect(page.getByTestId('evolution-card')).toContainText('Primeira vez');
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
  await page.reload();
  await expect(page.getByTestId('analysis-card')).toContainText(
    'Sessão concluída com dados sintéticos.',
  );
  await expect(page.getByTestId('analysis-card')).not.toContainText('Na próxima vez');
  await expect(page.getByTestId('next-time')).toHaveCount(1);
});

test('evolução offline compara outra ficha e o cartão mantém números do motor diante de comentário conflitante', async ({
  page,
  context,
}) => {
  await completed(page);
  // Seed a fictitious earlier workout in a different routine and a heavier current set.
  await page.evaluate(async () => {
    const user = JSON.parse(localStorage.getItem('anilha:user')!).id;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`anilha-${user}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = async (table: string) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = db.transaction(table).objectStore(table).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const sessions = await read('sessions'),
      items = await read('session_items'),
      sets = await read('sets');
    const session = sessions.find((s) => s.id === location.pathname.split('/').at(-1))!;
    const done = sets.filter(
      (s) =>
        s.session_id === session.id && !s.deleted && s.completed_at != null && s.kind === 'work',
    );
    const item = items.find((i) => i.id === done[0]!.item_id)!;
    const date = new Date(`${String(session.local_date)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 3);
    const transaction = db.transaction(['sessions', 'session_items', 'sets'], 'readwrite');
    transaction.objectStore('sessions').put({
      ...session,
      id: 'synthetic-prior',
      routine_id: 'other-routine',
      local_date: date.toISOString().slice(0, 10),
      started_at: Number(session.started_at) - 259200000,
    });
    transaction
      .objectStore('session_items')
      .put({ ...item, id: 'synthetic-prior-item', session_id: 'synthetic-prior' });
    for (const [index, set] of done.entries())
      transaction.objectStore('sets').put({
        ...set,
        id: `synthetic-prior-set-${index}`,
        session_id: 'synthetic-prior',
        item_id: 'synthetic-prior-item',
        exercise_id: item.exercise_id,
        load_kg: 20,
        reps: 8,
        completed_at: Number(session.started_at) - 259200000 + index,
      });
    transaction.objectStore('sets').put({ ...done[0], load_kg: 25 });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  const evolution = page.getByTestId('evolution-card');
  await expect(evolution).toContainText('Última vez há 3 dias');
  await expect(evolution).toContainText('Recorde pessoal de carga');
  await expect(evolution).toContainText('Recorde pessoal de repetições');
  await context.setOffline(true);
  await expect(evolution).toContainText('25 kg x 10 rep');
  await context.setOffline(false);
  let engineSets: { load_kg: number | null; reps: number | null }[] = [];
  await page.route('**/functions/v1/analise-treino', async (route) => {
    engineSets = route.request().postDataJSON().context.items[0].next.sets;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        avaliacao: 'aceitavel',
        summary: 'Execução sintética.',
        points: [],
        adjustment: null,
        proximaVez: [{ slot: 0, comentario: 'Use 999 kg e faça 99 repetições.' }],
        usage: { model: 'claude-haiku-5-5', input_tokens: 2345, output_tokens: 210 },
      }),
    });
  });
  const card = page.getByTestId('analysis-card');
  await card.getByRole('button', { name: 'Analisar este treino' }).click();
  await expect(card).toContainText('Execução aceitável');
  expect(engineSets.length).toBeGreaterThan(0);
  await expect(card.getByRole('region', { name: 'Na próxima vez' })).toContainText(
    `${engineSets[0]!.load_kg} kg x ${engineSets[0]!.reps} rep`,
  );
  await expect(card).not.toContainText('999');
  await expect(card).not.toContainText('99 repetições');
  await expect(card.getByTestId('analysis-usage')).toContainText('2345/210 tokens');
  await expect(card.getByTestId('analysis-usage').locator('.hb-sr')).toContainText(
    '2345 tokens de entrada + 210 de saída',
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('evolution-card')).toContainText('Recorde pessoal de carga');
  await expect(page.getByTestId('analysis-card')).toContainText('Execução aceitável');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '209-evolucao-local', true);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shot(page, '209-evolucao-local-escuro', true);
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.fontSize = '200%';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, '209-evolucao-local-texto-grande', true);
});
