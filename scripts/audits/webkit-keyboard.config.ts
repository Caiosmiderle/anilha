import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config';

// WebKit runs the same tasks as Chromium. Virtual-keyboard geometry is simulated;
// this does not replace checking the installed PWA on a physical iPhone.
const root = fileURLToPath(new URL('../../', import.meta.url));
const servers = Array.isArray(base.webServer) ? base.webServer : [base.webServer!];
export default defineConfig({
  ...base,
  testDir: `${root}/tests/e2e`,
  testMatch: ['agente.spec.ts', 'agente-teclado.spec.ts'],
  outputDir: `${root}/artifacts/keyboard-feedback/webkit-results`,
  reporter: [['list']],
  webServer: servers.map((server) => ({ ...server, cwd: root })),
  projects: [
    {
      name: 'webkit',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        browserName: 'webkit',
      },
    },
  ],
});
