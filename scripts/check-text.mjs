// Fails when user-facing text or docs contain a long dash or an emoji.
// The rule comes from the product spec: those characters read as machine-written text.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dev-dist',
  '.git',
  'playwright-report',
  'test-results',
  '.local',
  'artifacts',
  '.hyperframes',
]);
// Not our text: the user's own brief and references, and the notes a video tool generates.
const SKIP_PATHS = [
  'marketing/referencias',
  'marketing/PROMPT-ANILHA.md',
  'marketing/video/youtube/CLAUDE.md',
  'marketing/video/youtube/AGENTS.md',
  'marketing/video/mobile/CLAUDE.md',
  'marketing/video/mobile/AGENTS.md',
];
const EXTS = new Set([
  '.ts',
  '.tsx',
  '.css',
  '.md',
  '.html',
  '.sql',
  '.json',
  '.mjs',
  '.js',
  '.webmanifest',
]);
const SKIP_FILES = new Set(['package-lock.json']);

const LONG_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const EMOJI = /\p{Extended_Pictographic}/u;

const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (SKIP_PATHS.includes(relative(ROOT, full).split(sep).join('/'))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (EXTS.has(extname(name)) && !SKIP_FILES.has(name)) check(full);
  }
}

function check(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const where = `${relative(ROOT, file)}:${i + 1}`;
    if (line.includes(LONG_DASH)) problems.push(`${where}: travessão`);
    if (line.includes(EN_DASH)) problems.push(`${where}: meia-risca`);
    if (EMOJI.test(line)) problems.push(`${where}: emoji`);
  });
}

walk(ROOT);
if (problems.length) {
  console.error(`Texto proibido encontrado:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('Texto ok: sem travessão, meia-risca ou emoji.');
