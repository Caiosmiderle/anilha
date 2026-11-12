/**
 * Deload week: after 8 weeks in a row the app suggests a lighter week; accepted, the
 * workout comes with half the sets and 10% less load, and says it does not count.
 */
import { expect, test } from '@playwright/test';
import { API, login, onboard, shot, uniqueEmail } from './helpers';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('semana leve sugerida depois de 8 semanas, com metade das séries', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, uniqueEmail('leve'));
  await onboard(page, 'Nina', { gym: 3, run: 0 });

  // Eight past weeks with a finished workout each, pushed like the app would.
  const token = await page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('anilha-auth') ?? '{}') as { access_token?: string })
        .access_token,
  );
  const changes = Array.from({ length: 8 }, (_, i) => {
    const day = iso(new Date(Date.now() - (i + 1) * 7 * 86_400_000));
    return {
      table: 'sessions',
      row: {
        id: `antigo-${i}`,
        updated_at: Date.now(),
        deleted: false,
        local_date: day,
        started_at: Date.now() - (i + 1) * 7 * 86_400_000,
        ended_at: Date.now() - (i + 1) * 7 * 86_400_000 + 3_600_000,
        status: 'done',
        split_key: 'peito_triceps',
        title: 'Ficha A: Peito e tríceps',
        routine_id: null,
        source: 'blank',
        note: null,
        detail: 'summary',
        rest_started_at: null,
        rest_duration_sec: null,
        adjustments: [],
      },
    };
  });
  const res = await page.request.post(`${API}/rest/v1/rpc/sync_push`, {
    headers: { Authorization: `Bearer ${token}`, apikey: 'local-anon-key' },
    data: { changes },
  });
  expect(res.ok()).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Semana leve sugerida' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/semanas seguidas treinando/)).toBeVisible();
  await shot(page, '26-semana-leve');
  await page.getByRole('button', { name: 'Fazer esta semana leve' }).click();
  await expect(page.getByTestId('deload-active')).toBeVisible();

  // The workout: half the sets of the routine (3 becomes 2), and it says so.
  await page
    .getByRole('button', { name: /Iniciar treino|Escolher outro|Registrar treino/ })
    .first()
    .click();
  // "Iniciar treino" opens it directly; the other buttons open the list of fichas.
  const ficha = page.getByRole('button', { name: /^Ficha [ABC]:/ }).first();
  await Promise.race([page.waitForURL(/\/treino\//), ficha.waitFor()]);
  if (!/\/treino\//.test(page.url())) await ficha.click();
  await page.waitForURL(/\/treino\//);
  await expect(page.getByTestId('deload-session')).toBeVisible();
  const first = page.getByTestId('item-card').first();
  await expect(first.locator('[data-testid="set-row"][data-kind="work"]')).toHaveCount(2);

  // Back to normal from Today.
  await page.goto('/');
  await page.getByRole('button', { name: 'Voltar ao normal' }).click();
  await expect(page.getByTestId('deload-active')).toHaveCount(0);
});
