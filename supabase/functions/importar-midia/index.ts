// Supabase Edge Function (Deno): imports the RepDB free-tier exercise images into our own
// storage, so the app never loads media from a third-party site. It runs inside Supabase,
// where the service key already is: nobody copies the key. Called by hand, in batches
// (?inicio=0&fim=30), with a one-time token whose SHA-256 goes in TOKEN_SHA256; after the
// import it is deployed again switched off. Used on 20/10/2026 (89 exercises) and 17/11/2026 (73). Empty hash:
// every call is refused. License (RepDB Free Tier v1.0, read on 20/10/2026): commercial
// use inside apps with the visible link "Exercise data by RepDB (repdb.co)"; no
// redistribution as a dataset or API; no generative AI on the images.
const TOKEN_SHA256 = '';
const BASE = 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/';
const BUCKET = 'midia-exercicios';

/** Anilha id -> RepDB id (scripts/media/mapa-repdb.json): the 73 added on 17/11/2026. The 89 of
 * 20/10/2026 are already in the bucket. */
const MAPA: Record<string, string> = {
  'remada-pendlay': 'pendlay-row',
  'remada-curvada-halteres': 'bent-over-db-row',
  'remada-apoiada-halteres': 'chest-supported-db-row',
  'remada-curvada-supinada': 'reverse-grip-bent-over-row',
  'remada-smith': 'smith-machine-bent-over-row',
  'puxada-unilateral': 'one-arm-lat-pulldown',
  'remada-baixa-aberta': 'wide-grip-seated-cable-row',
  'remada-unilateral-polia': 'one-arm-seated-cable-row',
  'barra-fixa-supinada': 'chin-ups',
  'barra-fixa-neutra': 'neutral-grip-pull-ups',
  'extensao-lombar-maquina': 'machine-back-extension',
  'crucifixo-inclinado': 'incline-dumbbell-fly',
  'supino-declinado-halteres': 'decline-bench-press',
  'supino-smith': 'smith-machine-bench-press',
  'supino-inclinado-smith': 'smith-machine-incline-bench-press',
  'supino-polia': 'cable-chest-press',
  'flexao-inclinada': 'incline-push-ups',
  'flexao-joelhos': 'knee-push-ups',
  'flexao-declinada': 'decline-push-up',
  'supino-chao-halteres': 'dumbbell-floor-press',
  'desenvolvimento-halteres-em-pe': 'dumbbell-shoulder-press',
  'desenvolvimento-smith': 'smith-machine-shoulder-press',
  'elevacao-lateral-sentado': 'seated-dumbbell-lateral-raise',
  'elevacao-frontal-polia': 'cable-front-raise',
  'elevacao-frontal-barra': 'barbell-front-raise',
  'remada-alta-polia': 'cable-upright-row',
  'remada-alta-halteres': 'dumbbell-upright-row',
  'crucifixo-inverso-polia': 'cable-reverse-fly',
  'encolhimento-smith': 'smith-machine-shrug',
  'rosca-scott-halter': 'db-preacher-curl',
  'rosca-maquina': 'machine-bicep-curl',
  'rosca-martelo-polia': 'cable-hammer-curl',
  'rosca-inversa': 'ez-bar-reverse-curl',
  'rosca-spider': 'spider-curl',
  'rosca-sentado': 'seated-dumbbell-curl',
  'rosca-punho': 'dumbbell-wrist-curl',
  'triceps-acima-polia': 'cable-overhead-tricep-extension',
  'triceps-unilateral-polia': 'single-arm-tricep-pushdown',
  'triceps-testa-halteres': 'db-skull-crusher',
  'triceps-barra-v': 'v-bar-tricep-pushdown',
  'triceps-coice-polia': 'cable-tricep-kickback',
  'triceps-frances-barra': 'ez-bar-overhead-extension',
  'mergulho-maquina': 'seated-dip-machine',
  'flexao-diamante': 'diamond-push-ups',
  'agachamento-frontal': 'front-squat',
  'agachamento-halteres': 'db-squat',
  'agachamento-bulgaro-smith': 'smith-machine-bulgarian-split',
  'afundo-smith': 'smith-machine-split-squat',
  'afundo-reverso': 'reverse-lunge',
  'afundo-barra': 'barbell-lunge',
  'subida-banco': 'step-ups',
  'terra-romeno': 'romanian-deadlift',
  'terra-sumo': 'sumo-deadlift',
  'terra-hexagonal': 'hex-bar-deadlift',
  'elevacao-pelvica-maquina': 'plate-loaded-glute-drive',
  'elevacao-pelvica-smith': 'smith-machine-hip-thrust',
  'ponte-gluteos': 'glute-bridge',
  'elevacao-pelvica-unilateral': 'single-leg-hip-thrust',
  'coice-polia': 'cable-kickback',
  'extensora-unilateral': 'single-leg-extension',
  'flexora-unilateral': 'single-leg-lying-leg-curl',
  'leg-press-unilateral': 'single-leg-press',
  'stiff-unilateral': 'single-leg-romanian-deadlift',
  'panturrilha-smith': 'smith-machine-calf-raise',
  'panturrilha-burrinho': 'plate-loaded-donkey-calf-raise',
  'good-morning': 'good-morning',
  'abdominal-declinado': 'decline-crunch',
  'abdominal-canivete': 'v-ups',
  'elevacao-joelhos-barra': 'hanging-knee-raise',
  'rotacao-russa': 'russian-twist',
  canoa: 'hollow-body-hold',
  'flexao-lateral-halter': 'dumbbell-side-bend',
  'abdominal-completo': 'sit-ups',
};

interface RepdbExercise {
  id: string;
  images?: { flat?: { main?: string; start?: string; peak?: string } };
}

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const token = req.headers.get('x-token') ?? '';
  if (!TOKEN_SHA256 || !token || (await sha256(token)) !== TOKEN_SHA256)
    return new Response('não', { status: 401 });

  const url = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  // Public bucket, images only: the app reads without a session; only the service key writes.
  const bucket = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 1048576,
      allowed_mime_types: ['image/webp', 'image/png', 'image/gif'],
    }),
  });
  if (!bucket.ok && bucket.status !== 409 && bucket.status !== 400)
    return Response.json(
      { erro: `bucket ${bucket.status} ${await bucket.text()}` },
      { status: 500 },
    );

  const params = new URL(req.url).searchParams;
  const ids = Object.keys(MAPA).sort();
  const inicio = Number(params.get('inicio') ?? 0);
  const fim = Math.min(ids.length, Number(params.get('fim') ?? ids.length));

  const dataset = (await (await fetch(`${BASE}exercises.json`)).json()) as {
    exercises: RepdbExercise[];
  };
  const byId = new Map(dataset.exercises.map((e) => [e.id, e]));

  const entradas: Record<string, { frames?: string[]; url?: string }> = {};
  const falhas: string[] = [];
  for (const id of ids.slice(inicio, fim)) {
    const flat = byId.get(MAPA[id] as string)?.images?.flat;
    const files =
      flat?.start && flat.peak
        ? [
            ['inicio', flat.start],
            ['fim', flat.peak],
          ]
        : flat?.main
          ? [['principal', flat.main]]
          : [];
    if (!files.length) {
      falhas.push(`${id}: sem imagem na fonte`);
      continue;
    }
    const urls: string[] = [];
    try {
      for (const [frame, path] of files) {
        const res = await fetch(`${BASE}${path}`);
        if (!res.ok) throw new Error(`download ${path} ${res.status}`);
        const ext = (path as string).split('.').pop() ?? 'webp';
        const dest = `repdb/${id}/${frame}.${ext}`;
        const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${dest}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': `image/${ext}`, 'x-upsert': 'true' },
          body: await res.arrayBuffer(),
        });
        if (!up.ok) throw new Error(`envio ${dest} ${up.status} ${await up.text()}`);
        urls.push(`${url}/storage/v1/object/public/${BUCKET}/${dest}`);
      }
      entradas[id] = urls.length > 1 ? { frames: urls } : { url: urls[0] };
    } catch (e) {
      falhas.push(`${id}: ${(e as Error).message}`);
    }
  }
  return Response.json({ total: ids.length, inicio, fim, entradas, falhas });
});
