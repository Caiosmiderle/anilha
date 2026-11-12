// Fallback for environments where tsx cannot call os.userInfo(). No source edits.
import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = join(root, '.local', 'node-api-runtime');
const seen = new Set();
function compile(source) {
  if (seen.has(source)) return;
  seen.add(source);
  const output = join(runtime, relative(root, source)).replace(/\.ts$/, '.js');
  let code = ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: source,
  }).outputText;
  code = code.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, (_match, before, specifier, after) => {
    const dependency = resolve(
      dirname(source),
      specifier.endsWith('.ts') ? specifier : `${specifier}.ts`,
    );
    compile(dependency);
    return (
      before + (specifier.endsWith('.ts') ? specifier.slice(0, -3) : specifier) + '.js' + after
    );
  });
  code = code.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(source).href));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, code);
}
compile(join(root, 'server', 'local-supabase.ts'));
const { startLocalSupabase } = await import(
  pathToFileURL(join(runtime, 'server', 'local-supabase.js')).href
);
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex < 0 ? 54321 : Number(args[portIndex + 1]);
await startLocalSupabase({
  port,
  seed: args.includes('--seed'),
  ...(args.includes('--persist') ? { dataDir: join(root, '.local', 'pg') } : {}),
});
console.log(`API local em http://127.0.0.1:${port}, fontes atuais (${seen.size} módulos).`);
