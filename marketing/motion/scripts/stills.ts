/**
 * Quadros-chave para o controle de qualidade: empacota uma vez e renderiza os quadros
 * pedidos de uma composição em qc/<composição>/<quadro>.png.
 *
 *   npx tsx scripts/stills.ts Anilha-16x9-45s 112 323 675
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const [id = 'Anilha-16x9-45s', ...frames] = process.argv.slice(2);
const serveUrl = await bundle({
  entryPoint: path.resolve('src/index.ts'),
  webpackOverride: (c) => ({
    ...c,
    resolve: {
      ...c.resolve,
      alias: {
        ...(c.resolve?.alias as Record<string, string> | undefined),
        react: path.resolve('node_modules/react'),
        'react-dom': path.resolve('node_modules/react-dom'),
        'lucide-react': path.resolve('node_modules/lucide-react'),
        three: path.resolve('node_modules/three'),
      },
    },
  }),
});
const chromiumOptions = { gl: 'angle' as const };
const composition = await selectComposition({ serveUrl, id, chromiumOptions });
const dir = path.resolve('qc', id);
mkdirSync(dir, { recursive: true });
for (const f of frames.map(Number)) {
  const output = path.join(dir, `${String(f).padStart(4, '0')}.png`);
  await renderStill({
    composition,
    serveUrl,
    frame: f,
    output,
    chromiumOptions,
    onBrowserLog: process.env.LOG ? (l) => console.log(`[${l.type}] ${l.text}`) : undefined,
  });
  console.log(output);
}
