// Renders the Anilha mark to the PNG icons the manifest and iOS need.
// Uses Playwright's Chromium, already installed for the end-to-end tests.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(fileURLToPath(new URL('..', import.meta.url)), 'public');

function mark(size, { maskable = false, square = false } = {}) {
  // Maskable icons keep the mark inside the 80% safe zone on a full-bleed tile.
  const scale = maskable ? 0.62 : 0.86;
  const inner = size * scale;
  const offset = (size - inner) / 2;
  const radius = square || maskable ? 0 : size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ccbff"/><stop offset="1" stop-color="#0099ff"/></linearGradient></defs>
    <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
    <g transform="translate(${offset} ${offset}) scale(${inner / 32})">
      <path d="M16 6.5 A9.5 9.5 0 1 1 7.77 11.25" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <circle cx="16" cy="16" r="3.2" fill="#fff"/>
    </g>
  </svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, opts: { square: true } },
  { file: 'icon-512.png', size: 512, opts: { square: true } },
  { file: 'icon-maskable-512.png', size: 512, opts: { maskable: true } },
  { file: 'apple-touch-icon.png', size: 180, opts: { square: true } },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0">${mark(t.size, t.opts)}</body></html>`);
  const buf = await page.locator('svg').screenshot({ omitBackground: false });
  writeFileSync(join(out, t.file), buf);
  console.log('ok', t.file);
}
await browser.close();
