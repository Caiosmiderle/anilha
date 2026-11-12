/**
 * Captures the real screens the videos and the landing use. Nothing is redrawn: these
 * are the app's own screens. Data: the seed's example week (October 2026) plus three
 * Mondays of back and biceps pushed through the app's own sync, so loads come
 * prefilled and the app suggests a heavier load. The account gets a neutral name.
 * Local server only; production is never touched.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { EXERCISES_BY_ID } from '../../src/engine/exercises';
import { API, login, uniqueEmail, walkTo } from '../../tests/e2e/helpers';
import { answerHealth, rename, renameAtRealTime } from './flow';

const OUT = 'marketing/capture/screens';
// A Monday after the example week: the day's workout, loads from last week.
const MONDAY = new Date('2026-10-26T06:10:00-03:00');
// Sunday of the example week: the group ranking with everyone's week done.
const SUNDAY = new Date('2026-10-18T19:00:00-03:00');

async function snap(page: Page, name: string, fullPage = false) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

async function settle(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
}

async function synced(page: Page) {
  await expect(page.getByTestId('sync-status').filter({ visible: true })).toHaveAttribute(
    'data-state',
    'idle',
    { timeout: 20_000 },
  );
}

async function rpc(page: Page, name: string, body: unknown) {
  const token = await page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('anilha-auth') ?? '{}') as { access_token?: string })
        .access_token,
  );
  const res = await page.request.post(`${API}/rest/v1/rpc/${name}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: 'local-anon-key' },
    data: body,
  });
  expect(res.ok()).toBe(true);
  return res.json();
}

type Row = Record<string, unknown> & { id: string };

/** Three Mondays of back and biceps with loads going up; the lat pulldown tops its range. */
async function seedBackHistory(page: Page) {
  const rows: { table: string; row: Row }[] = [];
  let cursor = 0;
  for (;;) {
    const r = (await rpc(page, 'sync_pull', { since: cursor, max_rows: 2000 })) as {
      rows: { table: string; row: Row }[];
      cursor: number;
      more: boolean;
    };
    rows.push(...r.rows);
    cursor = r.cursor;
    if (!r.more) break;
  }
  const routine = rows.find(
    (x) =>
      x.table === 'routines' &&
      x.row.split_key === 'costas_biceps' &&
      !x.row.archived &&
      !x.row.deleted,
  )?.row;
  expect(routine).toBeTruthy();
  const items = rows
    .filter(
      (x) => x.table === 'routine_items' && x.row.routine_id === routine?.id && !x.row.deleted,
    )
    .map((x) => x.row)
    .sort((a, b) => Number(a.position) - Number(b.position));

  const days = ['2026-09-28', '2026-10-05', '2026-10-19'];
  const changes: { table: string; row: Row }[] = [];
  days.forEach((day, w) => {
    const start = new Date(`${day}T06:05:00-03:00`).getTime();
    const sid = `mkt-costas-${day}`;
    changes.push({
      table: 'sessions',
      row: {
        id: sid,
        updated_at: start,
        deleted: false,
        local_date: day,
        started_at: start,
        ended_at: start + 58 * 60_000,
        status: 'done',
        split_key: 'costas_biceps',
        title: 'Costas e bíceps',
        routine_id: routine?.id ?? null,
        source: 'routine',
        note: null,
        detail: 'full',
        rest_started_at: null,
        rest_duration_sec: null,
        adjustments: [],
      },
    });
    let t = start + 3 * 60_000;
    items.forEach((it, i) => {
      const ex = EXERCISES_BY_ID.get(String(it.exercise_id));
      const iid = `${sid}-i${i}`;
      const loaded = ex?.measure === 'weight_reps';
      const timed = ex?.measure === 'time';
      // First exercise: 47.5, 50, 50 kg; the top of the range twice in a row at 50 kg, with
      // reps in reserve, so the app suggests the next load.
      const base = ex?.compound ? 40 : 12;
      const step = ex?.compound ? 2.5 : 1;
      const load = loaded ? (i === 0 ? ([47.5, 50, 50][w] ?? 50) : base + step * w) : null;
      const top = Number(it.target_max);
      const min = Number(it.target_min);
      const reps =
        i === 0
          ? w >= 1
            ? [top, top, top]
            : [top, top - 1, top - 2]
          : [Math.min(top, min + 2), Math.min(top, min + 1), min];
      changes.push({
        table: 'session_items',
        row: {
          id: iid,
          updated_at: start,
          deleted: false,
          session_id: sid,
          position: i,
          exercise_id: it.exercise_id,
          original_exercise_id: null,
          substitution_reason: null,
          status: 'done',
          skip_reason: null,
          planned_sets: it.sets,
          target_min: it.target_min,
          target_max: it.target_max,
          rest_sec: it.rest_sec,
          warmup_sets: i === 0 ? 2 : 0,
          note: null,
          pain_joint: null,
          added: false,
        },
      });
      const warm = i === 0 && load ? [Math.round(load * 0.4), Math.round(load * 0.8)] : [];
      warm.forEach((wl, k) => {
        t += 90_000;
        changes.push({
          table: 'sets',
          row: {
            id: `${iid}-w${k}`,
            updated_at: start,
            deleted: false,
            session_id: sid,
            item_id: iid,
            exercise_id: it.exercise_id,
            position: k,
            kind: 'warmup',
            load_kg: wl,
            reps: 6,
            seconds: null,
            rir: null,
            note: null,
            completed_at: t,
          },
        });
      });
      reps.slice(0, Number(it.sets)).forEach((rp, k) => {
        t += 120_000;
        changes.push({
          table: 'sets',
          row: {
            id: `${iid}-s${k}`,
            updated_at: start,
            deleted: false,
            session_id: sid,
            item_id: iid,
            exercise_id: it.exercise_id,
            position: warm.length + k,
            kind: 'work',
            load_kg: load,
            reps: timed ? null : rp,
            seconds: timed ? 30 + 5 * w : null,
            rir: 2,
            note: null,
            completed_at: t,
          },
        });
      });
    });
  });
  for (let i = 0; i < changes.length; i += 400) {
    const r = (await rpc(page, 'sync_push', { changes: changes.slice(i, i + 400) })) as {
      rejected: unknown[];
    };
    expect(r.rejected).toEqual([]);
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('grupo com a semana de todos', async ({ page, browser }) => {
  await renameAtRealTime(browser, 'caio@anilha.dev');
  await page.clock.install({ time: SUNDAY });
  await login(page, 'caio@anilha.dev');
  await synced(page);
  await page.goto('/amigos');
  await settle(page);
  await snap(page, 'amigos');
  await page.getByRole('button', { name: /Abrir Turma das 6h/ }).click();
  await expect(page.getByTestId('ranking-row').first()).toBeVisible();
  // Captures use the synthetic account's display name.
  await expect(page.locator('main').getByText(/Caio/)).toHaveCount(0);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, 'grupo');
});

test('mandar e receber uma ficha', async ({ page, browser }, info) => {
  // Real time here: the sent ficha says "agora", not a week from now.
  await login(page, 'caio@anilha.dev');
  await synced(page);
  await rename(page);
  await page.goto('/plano');
  await page
    .getByRole('link', { name: /Peito e tríceps/ })
    .first()
    .click();
  const send = page.getByRole('button', { name: 'Enviar para um amigo' });
  await expect(send).toBeVisible();
  await send.click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Ana', exact: true }).click();
  await sheet.getByLabel('Recado (opcional)').fill('Faz na segunda e na quinta. Bom treino!');
  await sheet.getByLabel('Recado (opcional)').blur();
  await snap(page, 'enviar-ficha');
  await sheet.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(/Ficha enviada para Ana/)).toBeVisible();

  const ctx = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  const ana = await ctx.newPage();
  await ana.emulateMedia({ reducedMotion: 'reduce' });
  await login(ana, 'ana@anilha.dev');
  await answerHealth(ana);
  await ana.goto('/avisos');
  await ana
    .getByRole('button', { name: /te mandou uma ficha/ })
    .first()
    .click();
  await expect(ana.getByTestId('shared-items')).toBeVisible();
  await snap(ana, 'ficha-recebida');
  await ctx.close();
});

test('fichas prontas', async ({ page }) => {
  await login(page, 'caio@anilha.dev');
  await synced(page);
  await rename(page);
  await page.goto('/plano/fichas-prontas');
  await expect(page.getByTestId('ready-routine').first()).toBeVisible();
  await settle(page);
  await snap(page, 'fichas-prontas');
});

test('telas do app com a semana de exemplo', async ({ page, browser }) => {
  await renameAtRealTime(browser, 'caio@anilha.dev');
  await page.clock.install({ time: MONDAY });
  await login(page, 'caio@anilha.dev');
  await synced(page);
  await seedBackHistory(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Rafa/ })).toBeVisible();
  await synced(page);
  await settle(page);
  await snap(page, 'hoje');
  await snap(page, 'hoje-inteira', true);

  // Plan: the rotation and the week.
  await page.goto('/plano');
  await settle(page);
  await snap(page, 'plano');

  // History and progress.
  await page.goto('/historico');
  await settle(page);
  await snap(page, 'historico');
  await page.goto('/historico?aba=progresso');
  await settle(page);
  await snap(page, 'progresso');
  await snap(page, 'progresso-inteira', true);

  // Cardio sheet, before the workout starts.
  await page.goto('/');
  await settle(page);
  await page.getByRole('button', { name: 'Escolher outro' }).click();
  await page.getByRole('button', { name: /^Cardio/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Bike' }).click();
  await dialog.getByLabel('Distância (km), opcional').fill('18');
  await dialog.getByLabel('Tempo').fill('40:00');
  await dialog.getByRole('button', { name: '7', exact: true }).click();
  await snap(page, 'cardio');
  await dialog.getByRole('button', { name: 'Fechar' }).click();

  // The workout of the day, from Today.
  await page.getByRole('button', { name: 'Iniciar treino' }).click();
  await page.waitForURL(/\/treino\//);
  const editor = page.getByTestId('set-editor');
  await expect(editor).toBeVisible();
  await expect(page.locator('[data-testid="suggestion"]').first()).toHaveAttribute(
    'data-kind',
    'increase',
  );
  await snap(page, 'treino-inicio');
  await snap(page, 'treino-inteiro', true);

  // Warm-ups (loads already worked out), then the work set at the new load.
  for (let i = 0; i < 3; i += 1) {
    if (!(await editor.getByText('Aquecimento').count())) break;
    if (i === 0) await snap(page, 'treino-aquecimento');
    await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
    await page.waitForTimeout(300);
  }
  const skip = page.getByRole('button', { name: 'Pular' });
  if (await skip.count()) await skip.click();
  await expect(editor).toContainText('Série 1 de');
  await snap(page, 'treino-serie');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).click();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await snap(page, 'treino-esforco');
  await page.getByTestId('effort-prompt').getByRole('button', { name: 'Ok', exact: true }).click();
  await page.clock.runFor(14_000);
  await snap(page, 'treino-descanso');
});

test('primeiro acesso: entrar e montar o plano', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await page.goto('/entrar');
  await expect(page.getByRole('heading', { name: 'Entrar no Anilha' })).toBeVisible();
  await snap(page, 'entrar');
  const email = uniqueEmail('rafa');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('heading', { name: 'Digite o código' })).toBeVisible();
  await snap(page, 'entrar-codigo');
  await login(page, email);

  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Rafa');
  await snap(page, 'comecar-1');
  await walkTo(page, 'Quer mais foco em algum grupo?');
  await page.getByRole('button', { name: 'Glúteos e pernas' }).click();
  await page.getByRole('button', { name: 'Abdômen' }).click();
  await snap(page, 'comecar-foco');
  // The capture keeps the balanced week: back to evenly.
  await page.getByRole('button', { name: 'Corpo todo por igual' }).click();
  await walkTo(page, 'Quantos dias por semana?');
  await page.getByRole('button', { name: 'Aumentar academia' }).click();
  await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  await page.getByRole('button', { name: 'Aumentar corrida' }).click();
  await page.getByRole('button', { name: 'Correr na terça' }).click();
  await page.getByRole('button', { name: 'Correr no sábado' }).click();
  for (const day of ['na segunda', 'na quarta', 'na quinta', 'na sexta'])
    await page.getByRole('button', { name: `Academia ${day}` }).click();
  await expect(page.getByText('Pronto: a semana fica nos dias que você escolheu.')).toBeVisible();
  await snap(page, 'comecar-2');
  await walkTo(page, 'Como dividir os treinos?');
  await snap(page, 'comecar-3');
  await walkTo(page, 'Seu plano da semana');
  await snap(page, 'comecar-plano');
});

// Last on purpose: it makes the example account an admin, and the screens above must not
// show admin options.
test('cartão do treino, teste do admin', async ({ page, browser }) => {
  await renameAtRealTime(browser, 'caio@anilha.dev');
  await page.clock.install({ time: MONDAY });
  await login(page, 'caio@anilha.dev');
  await synced(page);
  await seedBackHistory(page);
  await page.request.get(`${API}/dev/admin?email=${encodeURIComponent('caio@anilha.dev')}`);
  await page.goto('/historico');
  await settle(page);
  await page.locator('a.hb-list-row').first().click();
  await page.waitForURL(/\/historico\/treino\//);
  await page.getByRole('button', { name: 'Compartilhar treino' }).click();
  const img = page.getByRole('dialog').getByRole('img', { name: /^Imagem do treino/ });
  await expect(img).toBeVisible();
  const src = (await img.getAttribute('src')) as string;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/cartao-treino.png`, Buffer.from(src.split(',')[1] as string, 'base64'));
  await snap(page, 'cartao-sheet');
});
