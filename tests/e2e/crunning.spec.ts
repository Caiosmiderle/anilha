import { test, expect } from '@playwright/test';
import { API, login, onboard, uniqueEmail, shot } from './helpers';

test.use({ trace: 'off', screenshot: 'off' });

test('token CRUNNING: gerar uma vez, copiar, usar API local, trocar e revogar', async ({
  page,
  context,
}) => {
  // Never retain a trace or screenshot containing the one-time credential.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page, uniqueEmail('crunning'));
  await onboard(page, 'Pessoa');
  await page.goto('/voce');
  await page.getByRole('link', { name: /Conexões/ }).click();
  await page.getByRole('link', { name: 'CRUNNING', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  const field = page.getByLabel('Token do CRUNNING');
  await expect(field).toBeVisible();
  const secret = await field.inputValue();
  await expect(page.getByText(/aparece uma única vez/)).toBeVisible();
  await page.getByRole('button', { name: 'Copiar token' }).click();
  await expect(page.getByRole('button', { name: 'Copiado', exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied === secret).toBe(true);
  const response = await page.request.get(`${API}/functions/v1/troca-crunning/forca`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(response.status()).toBe(200);
  const today = new Date().toISOString().slice(0, 10);
  const headers = { Authorization: `Bearer ${secret}` };
  const received = await page.request.post(`${API}/functions/v1/troca-crunning/corridas`, {
    headers,
    data: {
      versao: 1,
      itens: [
        {
          origem_id: '00000000-0000-4000-8000-000000000050',
          atualizado_em: new Date().toISOString(),
          inicio: `${today}T09:00:00Z`,
          data_local: today,
          tipo: 'leve',
          distancia_m: 5000,
          duracao_movimento_s: 1800,
          esforco: null,
        },
      ],
    },
  });
  expect(received.status()).toBe(200);
  expect((await received.json()).aceitos).toBe(1);
  const planned = await page.request.put(`${API}/functions/v1/troca-crunning/planejados/corrida`, {
    headers,
    data: {
      versao: 1,
      de: today,
      ate: today,
      itens: [
        {
          origem_id: `plano:${today}:1-0`,
          data_local: today,
          tipo: 'longo',
          nome: 'Longão de teste',
          distancia_m: null,
          duracao_s: null,
          importante: true,
          status: 'planejada',
        },
      ],
    },
  });
  expect(planned.status()).toBe(200);
  await page.getByRole('button', { name: 'Já guardei' }).click();
  await expect(field).toHaveCount(0);
  await shot(page, 'crunning-ativo-mobile', true);
  await page.goto('/historico');
  await expect(page.getByText(/Corrida leve do CRUNNING/)).toBeVisible();
  const importedPlans = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const name = databases.find((d) => d.name?.startsWith('anilha-'))?.name;
    if (!name) return 0;
    return new Promise<number>((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(new Error('Banco local indisponível'));
      open.onsuccess = () => {
        const request = open.result
          .transaction('external_plan_items')
          .objectStore('external_plan_items')
          .count();
        request.onsuccess = () => {
          open.result.close();
          resolve(request.result);
        };
      };
    });
  });
  expect(importedPlans).toBe(1);
  await page.goto('/voce/conexoes/crunning');
  await page.reload();
  await expect(page.getByText(/Ativo desde/)).toBeVisible();
  await expect(page.getByText('Último uso: ainda não usado')).toHaveCount(0);
  await expect(field).toHaveCount(0);
  await page.getByRole('button', { name: 'Gerar novo token' }).click();
  await page.getByRole('button', { name: 'Confirmar novo token' }).click();
  await expect(field).toBeVisible();
  const replacement = await field.inputValue();
  expect(replacement !== secret).toBe(true);
  expect(
    (
      await page.request.get(`${API}/functions/v1/troca-crunning/forca`, {
        headers: { Authorization: `Bearer ${secret}` },
      })
    ).status(),
  ).toBe(401);
  await page.getByRole('button', { name: 'Já guardei' }).click();
  await page.getByRole('button', { name: 'Revogar', exact: true }).click();
  await expect(page.getByText(/Revogar não apaga o que já chegou/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar revogação' }).click();
  await expect(page.getByText(/Revogado em/)).toBeVisible();
  await shot(page, 'crunning-revogado-mobile', true);
  expect(
    (
      await page.request.get(`${API}/functions/v1/troca-crunning/forca`, {
        headers: { Authorization: `Bearer ${replacement}` },
      })
    ).status(),
  ).toBe(401);
  await page.goto('/historico');
  await expect(page.getByText(/Corrida leve do CRUNNING/)).toBeVisible();
});
