import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config';

const root = fileURLToPath(new URL('../../', import.meta.url));
const servers = Array.isArray(base.webServer) ? base.webServer : [base.webServer!];
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'uiux.spec.ts',
  timeout: 120_000,
  reporter: [['list']],
  outputDir: `${root}/artifacts/uiux-test-results`,
  webServer: servers.map((server) => ({ ...server, cwd: root })),
  projects: [
    {
      name: 'ux-audit',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
  ],
});
