// Joins every migration into supabase/bundle.sql, ready to paste in the Supabase SQL editor
// when setting up a new project by hand.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const sql = files.map((f) => `-- ${f}\n${readFileSync(join(dir, f), 'utf8')}`).join('\n\n');
writeFileSync(join(root, 'supabase', 'bundle.sql'), sql);
console.log(`supabase/bundle.sql: ${files.length} migrações`);
