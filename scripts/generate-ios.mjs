// No tsx runtime: bundle the pure TS source with the existing Vite dependency.
import { rolldown } from 'rolldown';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundle = await rolldown({ input: resolve(root, 'scripts/ios-source.ts'), platform: 'node' });
let artifacts;
try {
  const { output } = await bundle.generate({ format: 'esm' });
  const source = await import(
    `data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`
  );
  artifacts = source.iosArtifacts();
} finally {
  await bundle.close();
}
const trainingBundle = await rolldown({
  input: resolve(root, 'scripts/ios-training-source.ts'),
  platform: 'node',
});
let training;
try {
  const { output } = await trainingBundle.generate({ format: 'esm' });
  training = (
    await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  ).trainingArtifacts();
} finally {
  await trainingBundle.close();
}
const sessionBundle = await rolldown({
  input: resolve(root, 'scripts/ios-session-source.ts'),
  platform: 'node',
});
let sessionFixture;
try {
  const { output } = await sessionBundle.generate({ format: 'esm' });
  sessionFixture = await (
    await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  ).sessionArtifact();
} finally {
  await sessionBundle.close();
}
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const historyBundle = await rolldown({
  input: resolve(root, 'scripts/ios-history-source.ts'),
  platform: 'node',
});
let history;
try {
  const { output } = await historyBundle.generate({ format: 'esm' });
  history = (
    await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  ).historyArtifacts();
} finally {
  await historyBundle.close();
}
const calendarBundle = await rolldown({
  input: resolve(root, 'scripts/ios-calendar-source.ts'),
  platform: 'node',
});
let calendar;
try {
  const { output } = await calendarBundle.generate({ format: 'esm' });
  calendar = (
    await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  ).calendarArtifacts();
} finally {
  await calendarBundle.close();
}
const analysisBundle = await rolldown({
  input: resolve(root, 'scripts/ios-analysis-source.ts'),
  platform: 'node',
});
let analysis;
try {
  const { output } = await analysisBundle.generate({ format: 'esm' });
  analysis = await (
    await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  ).analysisArtifacts();
} finally {
  await analysisBundle.close();
}
const reviewBundle = await rolldown({
  input: resolve(root, 'scripts/ios-review-source.ts'),
  platform: 'node',
});
let review;
try {
  const { output } = await reviewBundle.generate({ format: 'esm' });
  review = (
    await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'))
  ).reviewArtifacts();
} finally {
  await reviewBundle.close();
}
const env = await readFile(resolve(root, '.env.production'), 'utf8');
if (!/^VITE_SUPABASE_ANON_KEY=sb_publishable_[A-Za-z0-9_-]+\s*$/m.test(env)) {
  throw new Error(
    'iOS config requires a publishable Supabase key. Never bundle service credentials.',
  );
}
const publicValue = (key) => {
  const value = env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1].trim();
  if (!value) throw new Error(`Missing public config: ${key}`);
  return JSON.stringify(value);
};
// "Como fazer" for the native catalog: same rule as howToFor in src/content/howto.ts (up to 4
// tips and 2 errors, media only with frames or url, video only with a valid id that the weekly
// check did not take down). src/content/__tests__/howtoIos.test.ts compares both.
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const howtoRaw = await readJson('src/content/howto.json');
const mediaRaw = await readJson('src/content/media.json');
const videoStatus = await readJson('src/content/video-status.json');
const howtoIos = Object.fromEntries(
  Object.entries(howtoRaw)
    .filter(([, h]) => h.tips.length)
    .map(([id, h]) => {
      const m = mediaRaw[id];
      const video = h.videoId.trim();
      return [
        id,
        {
          tips: h.tips.slice(0, 4),
          errors: h.errors.slice(0, 2),
          media: m && (m.url || m.frames?.length) ? m : null,
          video:
            video && /^[A-Za-z0-9_-]{11}$/.test(video) && videoStatus[video]?.ok !== false
              ? { id: video, start: h.start, end: h.end }
              : null,
        },
      ];
    }),
);
const outputs = {
  'ios/App/Recursos/howto.json': json(howtoIos),
  'ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/review.json': json(review).replace(
    /\u2014/g,
    '\\u2014',
  ),
  'ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/history.json': json(history),
  'ios/AnilhaCore/Sources/AnilhaCore/Resources/history-taxonomy.json': json(history.taxonomy),
  'ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/calendar.json': json(calendar),
  'ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/analysis.json': json(analysis),
  'ios/AnilhaCore/Sources/AnilhaCore/Resources/analysis-rules.json': json(analysis.riskRules),
  'ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/training.json': json(training),
  'ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/session.json': json(sessionFixture),
  'ios/App/Recursos/exercises.json': json(artifacts.catalog),
  'ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/plans.json': json(artifacts.planCases),
  'ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/projections.json': json(artifacts.projectionCases),
  'ios/AnilhaCore/Sources/AnilhaCore/Resources/splits.json': json(artifacts.splits),
  'ios/App/Servicos/Configuracao.swift': `// Generated by node scripts/generate-ios.mjs from .env.production.\n// URL e chave publicavel sao publicas por natureza, como no PWA. A protecao e a RLS.\nimport Foundation\n\nenum Configuracao {\n    static let supabaseURL = URL(string: ${publicValue('VITE_SUPABASE_URL')})!\n    static let supabaseKey = ${publicValue('VITE_SUPABASE_ANON_KEY')}\n}\n`,
};
for (const [path, content] of Object.entries(outputs)) {
  const full = resolve(root, path);
  if (process.argv.includes('--check')) {
    if ((await readFile(full, 'utf8')) !== content)
      throw new Error(`Regenerate iOS artifacts: ${path}`);
  } else {
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}
console.log(`iOS artifacts ${process.argv.includes('--check') ? 'verified' : 'generated'}.`);
