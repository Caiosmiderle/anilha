import { defineConfig, devices } from '@playwright/test';

const API = 'http://127.0.0.1:54329';
const WEB = 'http://localhost:4173';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npx tsx server/local-supabase.ts --port 54329 --seed',
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite build --mode e2e && npx vite preview --mode e2e --port 4173 --strictPort',
      url: WEB,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
