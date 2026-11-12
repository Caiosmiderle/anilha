import { expect, test } from '@playwright/test';
import { API, login, onboard, shot, uniqueEmail } from './helpers';

test('admin revisa a ficha com corridas, decide cada ajuste, desfaz e reabre sem cobrar', async ({
  page,
}) => {
  const email = uniqueEmail('review');
  await login(page, email);
  await onboard(page, 'Pessoa Sintética', { gym: 3, run: 0 });
  const routineID = await page.evaluate(async () => {
    const user = JSON.parse(localStorage.getItem('anilha:user')!).id;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(`anilha-${user}`);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows = await new Promise<
      { id: string; position: number; deleted: boolean; archived: boolean }[]
    >((resolve, reject) => {
      const r = db.transaction('routines').objectStore('routines').getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return rows.filter((r) => !r.deleted && !r.archived).sort((a, b) => a.position - b.position)[0]!
      .id;
  });
  await page.goto(`/plano/rotina/${routineID}`);
  await expect(page.getByTestId('review-card')).toHaveCount(0);
  expect((await page.request.get(`${API}/dev/admin?email=${encodeURIComponent(email)}`)).ok()).toBe(
    true,
  );
  let calls = 0;
  let sent: Record<string, unknown> | undefined;
  page.on('request', (r) => {
    if (r.url().includes('/functions/v1/revisao-ficha')) {
      calls++;
      sent = r.postDataJSON();
    }
  });
  await page.reload();
  const card = page.getByTestId('review-card');
  await card.getByRole('button', { name: 'Revisar com IA' }).click();
  await expect(card).toContainText('A ficha está coerente.');
  await expect(card.getByTestId('review-adjustment')).toHaveCount(3);
  await expect(card.getByTestId('review-usage')).toContainText('claude-sonnet-5-5');
  await expect(card.getByTestId('review-usage')).toContainText('2000/1000 tokens');
  await expect(card.getByTestId('review-usage')).toContainText('0,0140000');
  expect(Object.keys(sent!)).toEqual(['context']);
  const ctx = sent!.context as Record<string, unknown>;
  expect(ctx).toHaveProperty('running');
  expect(ctx).toHaveProperty('schedule');
  expect(JSON.stringify(sent)).not.toContain('Pessoa Sintética');
  await shot(page, '210-revisao-ficha', true);
  for (const i of [0, 1, 2]) {
    const adjustment = card.getByTestId('review-adjustment').nth(i);
    await expect(adjustment).toContainText('Antes:');
    await expect(adjustment).toContainText('Depois:');
    await adjustment.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await expect(adjustment).toContainText('Aplicado.');
    await adjustment.getByRole('button', { name: 'Voltar ao anterior' }).click();
    await expect(adjustment).toContainText('Desfeito: voltou como estava.');
  }
  await page.reload();
  await expect(page.getByTestId('review-card')).toContainText('Desfeito: voltou como estava.');
  expect(calls).toBe(1);
});
