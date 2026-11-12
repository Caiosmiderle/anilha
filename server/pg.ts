import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const SHIM = join(ROOT, 'supabase', 'shim', 'local_auth_shim.sql');

/** Boots Postgres (PGlite) with the Supabase shim and every migration applied once. */
export async function openDatabase(dataDir?: string): Promise<PGlite> {
  const db = await PGlite.create(dataDir ? { dataDir } : undefined);
  await db.exec(readFileSync(SHIM, 'utf8'));
  await db.exec(`create table if not exists auth.applied_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set(
    (await db.query<{ name: string }>('select name from auth.applied_migrations')).rows.map(
      (r) => r.name,
    ),
  );
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
      await tx.query('insert into auth.applied_migrations (name) values ($1)', [file]);
    });
  }
  return db;
}

export interface Claims {
  sub: string;
  email?: string;
  role: 'authenticated';
}

/** Runs `fn` as the given user, with row level security on, like PostgREST does. */
export async function asUser<T>(
  db: PGlite,
  claims: Claims | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(claims ?? { role: 'anon' }),
    ]);
    await tx.exec(claims ? 'set local role authenticated' : 'set local role anon');
    return fn(tx);
  });
}

export async function createUser(db: PGlite, id: string, email: string): Promise<void> {
  await db.query('insert into auth.users (id, email) values ($1, $2) on conflict do nothing', [
    id,
    email,
  ]);
}

const argCache = new Map<string, { name: string; type: string }[]>();

/** Calls public.<fn>(named args) the way PostgREST maps a JSON body to arguments. */
export async function callRpc(
  db: PGlite,
  claims: Claims | null,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn))
    throw Object.assign(new Error('Função inválida'), { code: '42883' });
  let params = argCache.get(fn);
  if (!params) {
    const res = await db.query<{ names: string[] | null; types: string[] | null }>(
      `select p.proargnames as names,
              array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t) as types
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1
         order by p.pronargs desc limit 1`,
      [fn],
    );
    const row = res.rows[0];
    if (!row) throw Object.assign(new Error(`Função ${fn} não existe`), { code: '42883' });
    params = (row.types ?? []).map((type, i) => ({ name: row.names?.[i] ?? `$${i + 1}`, type }));
    argCache.set(fn, params);
  }
  const values: unknown[] = [];
  const parts: string[] = [];
  for (const p of params) {
    if (!(p.name in args)) continue;
    const v = args[p.name];
    values.push(p.type === 'jsonb' || p.type === 'json' ? JSON.stringify(v) : v);
    parts.push(`${p.name} => $${values.length}::${p.type}`);
  }
  return asUser(db, claims, async (tx) => {
    const res = await tx.query<{ result: unknown }>(
      `select public.${fn}(${parts.join(', ')}) as result`,
      values,
    );
    return res.rows[0]?.result ?? null;
  });
}
