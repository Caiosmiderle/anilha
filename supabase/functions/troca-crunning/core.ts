import { strengthResponse } from './engine.generated.ts';

type Obj = Record<string, unknown>;
export type Exchange = (hash: string, operation: string, payload: Obj) => Promise<Obj>;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
const object = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const date = (x: unknown): x is string =>
  typeof x === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  Number.isFinite(Date.parse(x)) &&
  new Date(x).toISOString().slice(0, 10) === x;
const iso = (x: unknown) =>
  typeof x === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x) &&
  date(x.slice(0, 10)) &&
  Number.isFinite(Date.parse(x));
const text = (x: unknown, n: number) =>
  typeof x === 'string' && x.length <= n && !/[\x00-\x1f]/.test(x);
const optional = (x: unknown, valid: (v: unknown) => boolean) => x == null || valid(x);
const positive = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const integer = (x: unknown) => positive(x) && Number.isInteger(x) && Number(x) <= 2147483647;
const type = (x: unknown) => typeof x === 'string' && ['leve', 'longo', 'intervalado'].includes(x);
const uuid = (x: unknown) =>
  typeof x === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

function validRun(x: unknown): x is Obj {
  if (!object(x) || !uuid(x.origem_id) || !iso(x.atualizado_em)) return false;
  if (x.apagado === true) return true;
  return (
    iso(x.inicio) &&
    date(x.data_local) &&
    type(x.tipo) &&
    positive(x.distancia_m) &&
    Number(x.distancia_m) >= 5 &&
    Number(x.distancia_m) <= 300_000 &&
    integer(x.duracao_movimento_s) &&
    Number(x.duracao_movimento_s) <= 172_800 &&
    optional(x.esforco, (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 10) &&
    optional(x.tipo_origem, (v) => text(v, 100_000)) &&
    optional(x.strava_id, (v) => text(v, 100_000)) &&
    optional(x.apagado, (v) => typeof v === 'boolean') &&
    optional(x.esteira, (v) => typeof v === 'boolean') &&
    optional(
      x.planejado,
      (v) =>
        object(v) &&
        Number.isInteger(v.semana) &&
        Number(v.semana) >= 0 &&
        Number.isInteger(v.dia) &&
        Number(v.dia) >= 0 &&
        Number(v.dia) <= 6,
    )
  );
}
function validPlan(x: unknown, from: string, to: string): x is Obj {
  return (
    object(x) &&
    typeof x.origem_id === 'string' &&
    /^plano:\d{4}-\d{2}-\d{2}:\d+-[0-6]$/.test(x.origem_id) &&
    x.origem_id.length <= 55 &&
    date(x.origem_id.slice(6, 16)) &&
    date(x.data_local) &&
    x.data_local >= from &&
    x.data_local <= to &&
    type(x.tipo) &&
    text(x.nome, 60) &&
    optional(x.tipo_origem, (v) => text(v, 100_000)) &&
    optional(x.distancia_m, positive) &&
    optional(x.duracao_s, integer) &&
    typeof x.importante === 'boolean' &&
    typeof x.status === 'string' &&
    ['planejada', 'feita', 'perdida'].includes(x.status)
  );
}
const pick = (x: Obj, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => x[k] !== undefined).map((k) => [k, x[k]]));

/** Same handler in Deno and the local server. Never logs requests or credentials. */
export async function handleCrunning(
  req: Request,
  exchange: Exchange,
  today = new Date().toISOString().slice(0, 10),
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const match = /^Bearer (anl_[A-Za-z0-9_-]{43})$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return json({ erro: 'token' }, 401);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1]));
  const hash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  const fail = async (reason: string) => {
    try {
      const auth = await exchange(hash, 'invalid', { erro: reason });
      const error = String(auth.erro ?? reason);
      return json({ erro: error }, error === 'token' ? 401 : error === 'limite' ? 429 : 400);
    } catch {
      return json({ erro: 'interno' }, 500);
    }
  };
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/troca-crunning/, '');
  let body: Obj = {};
  let operation: string;
  let rejected: Obj[] = [];
  if (req.method === 'GET' && path === '/forca') {
    // GET defaults to v1; an explicit version must also be 1.
    if (url.searchParams.has('versao') && url.searchParams.get('versao') !== '1')
      return fail('versao');
    const since = url.searchParams.get('desde');
    if (since != null && (!/^\d+$/.test(since) || BigInt(since) > 9223372036854775807n))
      return fail('cursor');
    operation = 'forca';
    body = { desde: since };
  } else {
    if (
      !(req.method === 'POST' && path === '/corridas') &&
      !(req.method === 'PUT' && path === '/planejados/corrida')
    )
      return fail('operacao');
    try {
      const raw = await req.text();
      if (raw.length > 100_000) return fail('campos');
      const value: unknown = JSON.parse(raw);
      if (!object(value)) throw new Error();
      body = value;
    } catch {
      return fail('campos');
    }
    if (body.versao !== 1) return fail('versao');
    if (!Array.isArray(body.itens)) return fail('campos');
    operation = path === '/corridas' ? 'corridas' : 'planejados';
    if (body.itens.length > (operation === 'corridas' ? 50 : 30)) return fail('campos');
    if (operation === 'corridas') {
      rejected = body.itens
        .filter((x) => !validRun(x))
        .map((x: unknown) => ({
          origem_id: object(x) && typeof x.origem_id === 'string' ? x.origem_id.slice(0, 64) : '',
          motivo: 'campos',
        }));
      body = {
        itens: body.itens.filter(validRun).map((x) =>
          x.apagado === true
            ? pick(x, ['origem_id', 'atualizado_em', 'apagado'])
            : {
                ...pick(x, [
                  'origem_id',
                  'atualizado_em',
                  'apagado',
                  'inicio',
                  'data_local',
                  'tipo',
                  'tipo_origem',
                  'distancia_m',
                  'duracao_movimento_s',
                  'esforco',
                  'esteira',
                  'strava_id',
                ]),
                planejado: object(x.planejado) ? pick(x.planejado, ['semana', 'dia']) : null,
              },
        ),
      };
    } else {
      const { de, ate, itens } = body;
      // Allow the caller's local day on either side of UTC midnight.
      const delta = date(de) ? (Date.parse(de) - Date.parse(today)) / 86400000 : NaN;
      if (
        !date(de) ||
        !date(ate) ||
        !Number.isFinite(delta) ||
        Math.abs(delta) > 1 ||
        ate < de ||
        (Date.parse(ate) - Date.parse(de)) / 86400000 > 13 ||
        !itens.every((x) => validPlan(x, de, ate)) ||
        new Set(itens.map((x) => (x as Obj).origem_id)).size !== itens.length
      )
        return fail('campos');
      body = {
        de,
        ate,
        itens: itens.map((x) =>
          pick(x as Obj, [
            'origem_id',
            'data_local',
            'tipo',
            'tipo_origem',
            'nome',
            'distancia_m',
            'duracao_s',
            'importante',
            'status',
          ]),
        ),
      };
    }
  }
  try {
    const result = await exchange(hash, operation, body);
    if (result.erro)
      return json(
        { erro: result.erro },
        result.erro === 'token' ? 401 : result.erro === 'limite' ? 429 : 400,
      );
    if (operation === 'forca') return json(strengthResponse(result, body.desde != null));
    if (operation === 'corridas')
      result.rejeitados = [...((result.rejeitados as Obj[]) ?? []), ...rejected];
    return json({ versao: 1, ...result });
  } catch {
    return json({ erro: 'interno' }, 500);
  }
}
