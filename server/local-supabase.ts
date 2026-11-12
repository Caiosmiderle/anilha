/**
 * Local stand-in for the slice of Supabase the app uses: email OTP auth (GoTrue
 * endpoints) and RPC calls (PostgREST). Same migrations, same row level security,
 * running on PGlite. Lets the app and the end-to-end tests run with no external account.
 *
 *   tsx server/local-supabase.ts --port 54321 [--persist] [--seed]
 */
import type { PGlite } from '@electric-sql/pglite';
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callRpc, createUser, openDatabase, type Claims } from './pg';
import { seedDemo } from './seed';
import { handleCrunning } from '../supabase/functions/troca-crunning/core';
import { handleAnalysis } from '../supabase/functions/analise-treino/core';
import { handleReview } from '../supabase/functions/revisao-ficha/core';
import { reviewReply } from '../scripts/ios-review-source';

const JWT_SECRET = 'anilha-local-dev-secret-never-used-in-production';
const ACCESS_TTL = 3600;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_SENDS = 5;
const OTP_SEND_WINDOW_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function verifyJwt(token: string): Record<string, unknown> | null {
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) return null;
  const expected = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
  if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null;
  return payload;
}

interface OtpState {
  code: string;
  expires: number;
  attempts: number;
  sends: number[];
}

export interface LocalSupabase {
  url: string;
  db: PGlite;
  server: Server;
  lastOtp(email: string): string | null;
  close(): Promise<void>;
}

export interface Options {
  port?: number;
  dataDir?: string;
  seed?: boolean;
  log?: boolean;
}

export async function startLocalSupabase(opts: Options = {}): Promise<LocalSupabase> {
  if (opts.dataDir) mkdirSync(opts.dataDir, { recursive: true });
  const db = await openDatabase(opts.dataDir);
  if (opts.seed) await seedDemo(db);
  const otps = new Map<string, OtpState>();
  const log = opts.log ? (...a: unknown[]) => console.log('[api]', ...a) : () => {};

  async function userByEmail(
    email: string,
  ): Promise<{ id: string; email: string; created_at: string } | null> {
    const r = await db.query<{ id: string; email: string; created_at: string }>(
      'select id, email, created_at::text from auth.users where email = $1',
      [email],
    );
    return r.rows[0] ?? null;
  }

  async function issueSession(user: { id: string; email: string; created_at: string }) {
    const now = Math.floor(Date.now() / 1000);
    const access = signJwt({
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      aud: 'authenticated',
      iat: now,
      exp: now + ACCESS_TTL,
    });
    const refresh = randomBytes(24).toString('hex');
    await db.query('insert into auth.refresh_tokens (token, user_id) values ($1, $2)', [
      refresh,
      user.id,
    ]);
    return {
      access_token: access,
      token_type: 'bearer',
      expires_in: ACCESS_TTL,
      expires_at: now + ACCESS_TTL,
      refresh_token: refresh,
      user: userJson(user),
    };
  }

  function userJson(user: { id: string; email: string; created_at: string }) {
    return {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: user.created_at,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: user.created_at,
      updated_at: user.created_at,
    };
  }

  function claimsFrom(req: IncomingMessage): Claims | null {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    const payload = verifyJwt(auth.slice(7));
    if (!payload || payload.role !== 'authenticated' || typeof payload.sub !== 'string')
      return null;
    return { sub: payload.sub, email: payload.email as string, role: 'authenticated' };
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin ?? '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] ??
        'authorization,apikey,content-type,x-client-info',
    );
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : {};
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(data === undefined ? '' : JSON.stringify(data));
    };
    const authError = (status: number, code: string, msg: string) =>
      send(status, { code: status, error_code: code, msg });

    log(req.method, url.pathname);

    if (url.pathname.startsWith('/functions/v1/troca-crunning/')) {
      const request = new Request(`http://127.0.0.1${req.url}`, {
        method: req.method,
        headers: {
          authorization: req.headers.authorization ?? '',
          'content-type': 'application/json',
        },
        ...(req.method === 'POST' || req.method === 'PUT' ? { body: JSON.stringify(body) } : {}),
      });
      const response = await handleCrunning(request, async (hash, operation, payload) =>
        db.transaction(async (tx) => {
          await tx.exec('set local role service_role');
          const result = await tx.query<{ value: Record<string, unknown> }>(
            'select public.crunning_exchange($1,$2,$3::jsonb) as value',
            [hash, operation, JSON.stringify(payload)],
          );
          return result.rows[0]!.value;
        }),
      );
      return send(response.status, await response.json());
    }

    if (url.pathname === '/auth/v1/otp' && req.method === 'POST') {
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return authError(400, 'validation_failed', 'Email inválido');
      }
      const now = Date.now();
      const st = otps.get(email);
      const sends = (st?.sends ?? []).filter((t) => now - t < OTP_SEND_WINDOW_MS);
      if (sends.length >= OTP_MAX_SENDS) {
        return authError(429, 'over_email_send_rate_limit', 'Muitos envios, espere um pouco');
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      otps.set(email, { code, expires: now + OTP_TTL_MS, attempts: 0, sends: [...sends, now] });
      console.log(`[api] código de acesso para ${email}: ${code}`);
      return send(200, {});
    }

    if (url.pathname === '/auth/v1/verify' && req.method === 'POST') {
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase();
      const token = String(body.token ?? '');
      const st = otps.get(email);
      if (!st || st.expires < Date.now()) return authError(403, 'otp_expired', 'Código expirado');
      st.attempts += 1;
      if (st.attempts > OTP_MAX_ATTEMPTS) {
        otps.delete(email);
        return authError(429, 'over_request_rate_limit', 'Muitas tentativas');
      }
      if (token !== st.code) return authError(403, 'otp_invalid', 'Código inválido');
      otps.delete(email);
      let user = await userByEmail(email);
      if (!user) {
        await createUser(db, randomUUID(), email);
        user = await userByEmail(email);
      }
      await db.query('update auth.users set last_sign_in_at = now() where email = $1', [email]);
      return send(200, await issueSession(user as NonNullable<typeof user>));
    }

    if (
      url.pathname === '/auth/v1/token' &&
      url.searchParams.get('grant_type') === 'refresh_token'
    ) {
      const token = String(body.refresh_token ?? '');
      // Rotated on use, but reusable for 10 s like Supabase's reuse interval: several
      // calls refreshing at once keep the session. A logout revokes for good.
      const r = await db.query<{ id: string; email: string; created_at: string }>(
        `update auth.refresh_tokens t set revoked = true, revoked_at = coalesce(t.revoked_at, now())
           from auth.users u
          where t.token = $1 and u.id = t.user_id
            and (not t.revoked or t.revoked_at > now() - interval '10 seconds')
          returning u.id, u.email, u.created_at::text`,
        [token],
      );
      const user = r.rows[0];
      if (!user) return authError(400, 'refresh_token_not_found', 'Sessão expirada');
      return send(200, await issueSession(user));
    }

    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const claims = claimsFrom(req);
      if (!claims) return authError(401, 'bad_jwt', 'Sessão inválida');
      const r = await db.query<{ id: string; email: string; created_at: string }>(
        'select id, email, created_at::text from auth.users where id = $1',
        [claims.sub],
      );
      if (!r.rows[0]) return authError(401, 'user_not_found', 'Usuário não existe');
      return send(200, userJson(r.rows[0]));
    }

    if (url.pathname === '/auth/v1/logout') {
      const claims = claimsFrom(req);
      if (claims)
        await db.query(
          'update auth.refresh_tokens set revoked = true, revoked_at = null where user_id = $1',
          [claims.sub],
        );
      return send(204, undefined);
    }

    const rpc = /^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/.exec(url.pathname);
    if (rpc && req.method === 'POST') {
      const claims = claimsFrom(req);
      try {
        const result = await callRpc(db, claims, rpc[1] as string, body);
        return send(200, result);
      } catch (err) {
        const e = err as { code?: string; message?: string };
        const status =
          e.code === '42501' || e.code === '28000' ? 401 : e.code === '42883' ? 404 : 400;
        return send(status, {
          code: e.code ?? 'P0001',
          message: e.message ?? 'erro',
          details: null,
          hint: null,
        });
      }
    }

    // The assistant, simulated: the same shape as supabase/functions/agente, without the
    // model. The beta and the daily limit go through the same database function; the
    // answers are scripted by keywords, so the tests walk the whole flow with no key.
    if (url.pathname === '/functions/v1/revisao-ficha' && req.method === 'POST') {
      const claims = claimsFrom(req);
      if (!claims) return send(401, { error: 'Entre na sua conta.' });
      const response = await handleReview(
        new Request(`http://127.0.0.1${req.url}`, {
          method: 'POST',
          headers: { authorization: req.headers.authorization ?? '' },
          body: JSON.stringify(body),
        }),
        {
          async authorize() {
            return (await callRpc(db, claims, 'is_admin', {})) === true
              ? {}
              : { status: 403, error: 'Revisão disponível só para o dono por enquanto.' };
          },
          async begin() {
            try {
              await callRpc(db, claims, 'agent_begin_turn', {});
              return {};
            } catch {
              return { status: 429, error: 'Você chegou ao limite de hoje. Amanhã tem mais.' };
            }
          },
          async end(_auth, input, output) {
            await callRpc(db, claims, 'agent_end_turn', { p_input: input, p_output: output });
          },
          async model() {
            return {
              model: 'claude-sonnet-5-5',
              stop: 'tool_use',
              input: 2000,
              output: 1000,
              content: [{ type: 'tool_use', name: 'responder_revisao', input: reviewReply }],
            };
          },
        },
      );
      return send(response.status, await response.json());
    }
    if (url.pathname === '/functions/v1/analise-treino' && req.method === 'POST') {
      const claims = claimsFrom(req);
      if (!claims) return send(401, { error: 'Entre na sua conta.' });
      const response = await handleAnalysis(
        new Request(`http://127.0.0.1${req.url}`, {
          method: 'POST',
          headers: { authorization: req.headers.authorization ?? '' },
          body: JSON.stringify(body),
        }),
        {
          async begin() {
            try {
              await callRpc(db, claims, 'agent_begin_turn', {});
              return {};
            } catch {
              return { status: 429, error: 'Você chegou ao limite de hoje. Amanhã tem mais.' };
            }
          },
          async end(_auth, input, output) {
            await callRpc(db, claims, 'agent_end_turn', { p_input: input, p_output: output });
          },
          async model() {
            return {
              stop: 'tool_use',
              input: 1000,
              output: 150,
              content: [
                {
                  type: 'tool_use',
                  name: 'responder_analise',
                  input: {
                    summary: 'Você concluiu a sessão. Compare o ritmo das séries na próxima vez.',
                    avaliacao: 'boa',
                    proximaVez: [{ slot: 0, comentario: 'Mantenha o controle das séries.' }],
                    points: ['O aquecimento faz parte do planejado.'],
                    adjustment: {
                      operation: 'series',
                      slot: 0,
                      sets: 2,
                      min: null,
                      max: null,
                      replacement: null,
                    },
                  },
                },
              ],
            };
          },
        },
      );
      return send(response.status, await response.json());
    }

    if (url.pathname === '/functions/v1/agente' && req.method === 'POST') {
      const claims = claimsFrom(req);
      if (!claims) return send(401, { error: 'Entre na sua conta' });
      try {
        await callRpc(db, claims, 'agent_begin_turn', {});
      } catch (err) {
        return send(403, { error: (err as Error).message });
      }
      return send(200, fakeAgent(body.messages as FakeMessage[]));
    }

    if (url.pathname === '/dev/otp') {
      const email = String(url.searchParams.get('email') ?? '').toLowerCase();
      return send(200, { code: otps.get(email)?.code ?? null });
    }

    if (url.pathname === '/dev/stats') {
      const email = String(url.searchParams.get('email') ?? '').toLowerCase();
      const user = await userByEmail(email);
      if (!user) return send(404, { error: 'sem usuário' });
      const r = await db.query<Record<string, number>>(
        `select
           (select count(*) from public.sessions where user_id = $1 and not deleted)::int as sessions,
           (select count(*) from public.sets where user_id = $1 and not deleted and completed_at is not null)::int as sets,
           (select count(*) from public.runs where user_id = $1 and not deleted)::int as runs,
           (select count(*) from public.session_items where user_id = $1 and not deleted)::int as items,
           (select count(*) from public.push_jobs where user_id = $1 and kind = 'rest' and sent_at is null)::int as rest_alerts,
           (select count(*) from public.body_logs where user_id = $1 and not deleted)::int as body_logs,
           (select count(*) from public.body_logs where user_id = $1 and weight_kg is not null)::int as body_values,
           (select count(*) from public.tickets where user_id = $1)::int as tickets`,
        [user.id],
      );
      return send(200, { user_id: user.id, ...r.rows[0] });
    }

    // Tests of sent fichas: two accounts become friends without the invite screens.
    if (url.pathname === '/dev/friends') {
      const a = await userByEmail(String(url.searchParams.get('a') ?? '').toLowerCase());
      const b = await userByEmail(String(url.searchParams.get('b') ?? '').toLowerCase());
      if (!a || !b) return send(404, { error: 'sem usuário' });
      await db.query(
        'insert into public.friendships (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) on conflict do nothing',
        [a.id, b.id],
      );
      return send(200, { ok: true });
    }

    // Tests of the management panel: turns an account into an admin.
    if (url.pathname === '/dev/admin') {
      const email = String(url.searchParams.get('email') ?? '').toLowerCase();
      const user = await userByEmail(email);
      if (!user) return send(404, { error: 'sem usuário' });
      await db.query('insert into public.admins (user_id) values ($1) on conflict do nothing', [
        user.id,
      ]);
      return send(200, { ok: true });
    }

    // Tests of the last name: makes an account look like one from before it was asked.
    if (url.pathname === '/dev/sem-sobrenome') {
      const email = String(url.searchParams.get('email') ?? '').toLowerCase();
      const user = await userByEmail(email);
      if (!user) return send(404, { error: 'sem usuário' });
      await db.query(
        `update public.profiles
            set onboarding = onboarding - 'last_name',
                display_name = split_part(display_name, ' ', 1),
                updated_at = (extract(epoch from now()) * 1000)::bigint
          where id = $1`,
        [user.id],
      );
      return send(200, { ok: true });
    }

    if (url.pathname === '/health') return send(200, { ok: true });
    return send(404, { message: 'Não encontrado' });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      console.error('[api] erro', err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Erro interno' }));
    });
  });
  const port = opts.port ?? 54321;
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}`,
    db,
    server,
    lastOtp: (email) => otps.get(email.toLowerCase())?.code ?? null,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

interface FakeMessage {
  role: 'user' | 'assistant';
  content: string | { type: string; name?: string }[];
}

const NULL_PLAN = {
  dias_academia: null,
  divisao: null,
  fichas: null,
  objetivo: null,
  nivel: null,
  minutos: null,
};

/** Scripted answers by keyword: a tool first, then the words for the person. */
function fakeAgent(messages: FakeMessage[]) {
  const last = messages[messages.length - 1];
  const tool = (name: string, input: Record<string, unknown>, text: string) => ({
    text,
    stop: 'tool_use',
    assistant: [
      { type: 'text', text },
      { type: 'tool_use', id: `toolu_${randomUUID().slice(0, 8)}`, name, input },
    ],
  });
  const say = (text: string) => ({
    text,
    stop: 'end_turn',
    assistant: [{ type: 'text', text }],
  });
  if (last && Array.isArray(last.content)) {
    // Tool results came back: the answer about the tool that ran.
    const prev = messages[messages.length - 2];
    const used = Array.isArray(prev?.content)
      ? prev.content.find((b) => b.type === 'tool_use')?.name
      : undefined;
    if (used === 'propor_plano')
      return say(
        'Montei um plano com **foco em pernas e glúteos**.\n\n- Perna ganha fichas próprias\n- A parte de cima fica no nível de manter\n\nRevise no cartão e toque em Salvar.',
      );
    if (used === 'mostrar_onde') return say('Fica em Você > Ajustes, em Unidade de carga.');
    if (used === 'nao_consigo')
      return say('Ainda não consigo montar dieta. Registrei seu pedido para a equipe do Anilha.');
    return say('Pronto.');
  }
  const raw = typeof last?.content === 'string' ? last.content : '';
  const ask = (raw.split('Pedido: ').pop() ?? raw).toLowerCase();
  if (ask.includes('perna') || ask.includes('glúteo'))
    return tool(
      'propor_plano',
      { foco: ['pernas'], ...NULL_PLAN, motivo: 'Mais perna e glúteo.' },
      'Vou montar a proposta.',
    );
  if (ask.includes('libras'))
    return tool(
      'mostrar_onde',
      { lugar: 'ajustes', explicacao: 'Em Unidade de carga, escolha lb.' },
      'Isso já existe.',
    );
  if (ask.includes('dieta'))
    return tool(
      'nao_consigo',
      { pedido: 'Montar uma dieta.', categoria: 'nutricao', motivo: 'O app não faz dieta.' },
      'Vou registrar.',
    );
  return say('O que você quer mudar? Por exemplo, os dias por semana ou o foco.');
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 2_000_000) throw new Error('Corpo grande demais');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 54321;
  const persist = args.includes('--persist');
  const root = fileURLToPath(new URL('..', import.meta.url));
  startLocalSupabase({
    port,
    dataDir: persist ? join(root, '.local', 'pgdata') : undefined,
    seed: args.includes('--seed'),
    log: args.includes('--verbose'),
  })
    .then((s) => {
      console.log(
        `[api] Supabase local em ${s.url} (Postgres via PGlite${persist ? ', dados em .local/pgdata' : ', em memória'})`,
      );
      if (args.includes('--seed'))
        console.log('[api] conta de exemplo: caio@anilha.dev (código aparece aqui ao pedir)');
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
