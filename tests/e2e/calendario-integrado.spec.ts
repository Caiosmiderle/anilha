import { expect, test } from '@playwright/test';
import { API, login, onboard, shot, synced, uniqueEmail } from './helpers';

// The integration token is only held in memory during local ingestion.
test.use({ trace: 'off', screenshot: 'off' });

test('calendário reúne força e CRUNNING, abre detalhes e navega entre meses', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-12T15:00:00Z'));
  await login(page, uniqueEmail('calendar'));
  await onboard(page, 'Pessoa', { gym: 3, run: 0 });
  await synced(page);
  const auth = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('anilha-auth')!) as {
        access_token: string;
        user: { id: string };
      },
  );
  const response = await page.request.post(`${API}/rest/v1/rpc/sync_push`, {
    headers: { Authorization: `Bearer ${auth.access_token}`, apikey: 'local-anon-key' },
    data: {
      changes: [
        {
          table: 'sessions',
          row: {
            id: 'ca1e0000-0000-4000-8000-000000000001',
            user_id: auth.user.id,
            updated_at: Date.now(),
            deleted: false,
            local_date: '2026-11-12',
            started_at: 1794484800000,
            ended_at: 1794486600000,
            status: 'done',
            split_key: 'peito_triceps',
            title: 'Força do calendário',
            routine_id: null,
            source: 'summary',
            detail: 'summary',
            note: null,
            rest_started_at: null,
            rest_duration_sec: null,
            adjustments: [],
          },
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).rejected).toEqual([]);
  await page.goto('/voce/conexoes/crunning');
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  const token = await page.getByLabel('Token do CRUNNING').inputValue();
  const headers = { Authorization: `Bearer ${token}` };
  const run = await page.request.post(`${API}/functions/v1/troca-crunning/corridas`, {
    headers,
    data: {
      versao: 1,
      itens: [
        {
          origem_id: 'ca1e0000-0000-4000-8000-000000000002',
          atualizado_em: new Date().toISOString(),
          inicio: '2026-11-12T10:00:00Z',
          data_local: '2026-11-12',
          tipo: 'leve',
          distancia_m: 5000,
          duracao_movimento_s: 1800,
          esforco: null,
        },
      ],
    },
  });
  expect(run.status()).toBe(200);
  expect((await run.json()).aceitos).toBe(1);
  const planned = await page.request.put(`${API}/functions/v1/troca-crunning/planejados/corrida`, {
    headers,
    data: {
      versao: 1,
      de: '2026-11-13',
      ate: '2026-11-13',
      itens: [
        {
          origem_id: 'plano:2026-11-13:1-0',
          data_local: '2026-11-13',
          tipo: 'longo',
          nome: 'Longão do calendário',
          distancia_m: 12000,
          duracao_s: null,
          importante: true,
          status: 'planejada',
        },
      ],
    },
  });
  expect(planned.status()).toBe(200);
  await page.getByRole('button', { name: 'Já guardei' }).click();
  await page.reload();
  await page.goto('/');
  await synced(page);
  await page.goto('/historico');
  await page.getByRole('link', { name: 'Calendário', exact: true }).click();
  const day = page.getByTestId('calendar-day');
  await expect(day.getByRole('link', { name: /Força do calendário/ })).toBeVisible();
  await expect(day.getByRole('button', { name: /Corrida.*5 km/ })).toBeVisible();
  const today = page.locator('.calendar-cell[data-today]');
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(today.locator('.calendar-dots i')).toHaveCount(2);
  await shot(page, '210-calendario-dia-claro', true);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shot(page, '210-calendario-dia-escuro', true);
  await day.getByRole('link', { name: /Força do calendário/ }).click();
  await page.waitForURL(/\/historico\/treino\/ca1e/);
  await expect(page.getByRole('heading', { name: 'Força do calendário' })).toBeVisible();
  await page.goBack();
  await day.getByRole('button', { name: /Corrida.*5 km/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.locator('.calendar-cell').filter({ hasText: /^13$/ }).click();
  await expect(day).toContainText('Longão do calendário');
  await expect(day).toContainText('12 km');
  await expect(day).toContainText('Importante');
  await day.getByRole('button', { name: /Longão do calendário/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Planejamento recebido do CRUNNING');
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Próximo mês' }).click();
  await expect(page.getByRole('heading', { name: 'Dezembro de 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await page.locator('.calendar-cell').filter({ hasText: /^1$/ }).click();
  await expect(day).toContainText('Nenhum treino neste dia');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await shot(page, '211-calendario-mes-claro', true);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shot(page, '211-calendario-mes-escuro', true);
});
