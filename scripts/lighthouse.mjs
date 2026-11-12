// Lighthouse (mobile) against a production build served by `vite preview`, plus an
// installability check: manifest, icons and an active service worker.
// Usage: npm run lighthouse   (expects `vite build --mode e2e` already done)
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4174;
const URL = `http://localhost:${PORT}`;

function start(cmd, args) {
  return spawn(cmd, args, { shell: true, stdio: 'ignore' });
}

function stop(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill();
}

async function waitFor(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout esperando ${url}`);
}

const api = start('npx', ['tsx', 'server/local-supabase.ts', '--port', '54329', '--seed']);
const web = start('npx', [
  'vite',
  'preview',
  '--mode',
  'e2e',
  '--port',
  String(PORT),
  '--strictPort',
]);
const results = {};
try {
  await waitFor('http://127.0.0.1:54329/health');
  await waitFor(URL);
  // Lighthouse drives Playwright's Chromium through the DevTools port, in a persistent
  // profile so the second run audits the signed-in Today screen.
  const DEBUG_PORT = 9333;
  const profileDir = mkdtempSync(join(tmpdir(), 'anilha-lh-'));
  const chrome = await chromium.launchPersistentContext(profileDir, {
    args: [`--remote-debugging-port=${DEBUG_PORT}`],
  });
  mkdirSync('artifacts/lighthouse', { recursive: true });
  const audit = async (path, keepStorage) => {
    const run = await lighthouse(`${URL}${path}`, {
      port: DEBUG_PORT,
      output: 'html',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      formFactor: 'mobile',
      disableStorageReset: keepStorage,
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        disabled: false,
      },
    });
    const name = path.replace(/\W+/g, '') || 'hoje';
    writeFileSync(`artifacts/lighthouse/${name}.html`, run.report);
    results[`${path} falhas`] = Object.values(run.lhr.audits)
      .filter(
        (a) =>
          a.score !== null &&
          a.score < 1 &&
          !['informative', 'manual'].includes(a.scoreDisplayMode),
      )
      .map((a) => `${a.id}: ${a.title}`);
    const contrast = run.lhr.audits['color-contrast'];
    if (contrast?.score === 0) {
      results[`${path} contraste`] = (contrast.details?.items ?? []).map(
        (i) =>
          `${i.node?.snippet ?? ''} :: ${(i.node?.explanation ?? '').split(String.fromCharCode(10))[1] ?? ''}`,
      );
    }
    results[path] = Object.fromEntries(
      Object.entries(run.lhr.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)]),
    );
  };
  await audit('/entrar', false);
  // The landing and the legal pages: static pages outside the app.
  await audit('/conheca/', false);
  await audit('/privacidade/', false);
  await audit('/termos/', false);

  // Sign in as the sample account, then audit Today with its data.
  const login = chrome.pages()[0] ?? (await chrome.newPage());
  await login.goto(`${URL}/entrar`);
  await login.getByLabel('E-mail').fill('caio@anilha.dev');
  await login.getByRole('button', { name: 'Enviar código' }).click();
  await login.getByRole('heading', { name: 'Digite o código' }).waitFor();
  const { code } = await (
    await fetch(`http://127.0.0.1:54329/dev/otp?email=caio%40anilha.dev`)
  ).json();
  await login.getByLabel('Dígito 1').fill(code);
  // First open of the account: the terms screen.
  const gate = login.locator('[data-consent]');
  await gate
    .or(login.getByRole('heading', { name: /Caio/ }))
    .first()
    .waitFor({ timeout: 30_000 });
  if (await gate.isVisible()) {
    await gate.getByRole('checkbox', { name: /18 anos/ }).check();
    await gate.getByRole('button', { name: 'Continuar' }).click();
  }
  await login.getByRole('heading', { name: /Caio/ }).waitFor({ timeout: 30_000 });
  await login.waitForTimeout(1500);
  await audit('/', true);
  await chrome.close();

  // Installability: manifest fields, icons reachable, service worker controlling the page.
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${URL}/entrar`);
  const manifest = await (await fetch(`${URL}/manifest.webmanifest`)).json();
  const icons = await Promise.all(
    manifest.icons.map(async (i) => ({
      src: i.src,
      ok: (await fetch(`${URL}${i.src}`)).ok,
      sizes: i.sizes,
      purpose: i.purpose ?? 'any',
    })),
  );
  await page
    .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 })
    .catch(() => undefined);
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      active: !!reg?.active,
      controlled: !!navigator.serviceWorker.controller,
      scope: reg?.scope ?? null,
    };
  });
  await browser.close();
  results.install = {
    name: manifest.name,
    display: manifest.display,
    start_url: manifest.start_url,
    icons,
    has192: icons.some((i) => i.sizes === '192x192' && i.ok),
    has512: icons.some((i) => i.sizes === '512x512' && i.ok),
    maskable: icons.some((i) => i.purpose === 'maskable' && i.ok),
    serviceWorker: sw,
  };
  writeFileSync('artifacts/lighthouse/resumo.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  stop(api);
  stop(web);
}
process.exit(0);
