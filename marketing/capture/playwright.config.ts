/**
 * Real app screens for the ads and the landing: the same local server and seed as the
 * end-to-end tests, a phone viewport at 3x, a fixed clock (Monday 19/10, 06:10).
 * Run: npx playwright test -c marketing/capture/playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const servers = Array.isArray(base.webServer) ? base.webServer : [base.webServer];

export default defineConfig({
  ...base,
  testDir: '.',
  webServer: servers.flatMap((s) => (s ? [{ ...s, cwd: ROOT }] : [])),
  timeout: 180_000,
  reporter: [['list']],
  use: { ...base.use, trace: 'off', screenshot: 'off' },
  projects: [
    {
      name: 'desktop',
      testMatch: /desktop\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: 'phone',
      testMatch: /capture\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
